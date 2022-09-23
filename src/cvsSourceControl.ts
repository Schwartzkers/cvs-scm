import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import { CvsRepository } from './cvsRepository';
import * as path from 'path';
import { SourceFileState } from './sourceFile';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';
import { runCvsBoolCmd } from './utility';


export class CvsSourceControl implements vscode.Disposable {
	private cvsScm: vscode.SourceControl;
	private workspacefolder: vscode.Uri;
	private cvsDocumentContentProvider: CvsDocumentContentProvider;
	private changedResources: vscode.SourceControlResourceGroup;
	private conflictResources: vscode.SourceControlResourceGroup;
	private unknownResources: vscode.SourceControlResourceGroup;
	private cvsRepository: CvsRepository;
	private timeout?: NodeJS.Timer;

    constructor(context: vscode.ExtensionContext, worspacefolder: vscode.Uri, cvsDocumentContentProvider: CvsDocumentContentProvider) {
		this.cvsScm = vscode.scm.createSourceControl('cvs', 'CVS', worspacefolder);
		this.workspacefolder = worspacefolder;
		this.cvsDocumentContentProvider = cvsDocumentContentProvider;
		this.changedResources = this.cvsScm.createResourceGroup('workingTree', 'Changes');
		this.conflictResources = this.cvsScm.createResourceGroup('conflictTree', 'Conflicts');
		this.unknownResources = this.cvsScm.createResourceGroup('unknownTree', 'Untracked');
		
        this.cvsRepository = new CvsRepository(this.workspacefolder);
		this.cvsScm.quickDiffProvider = this.cvsRepository;
		this.cvsScm.inputBox.placeholder = 'cvs commit message';

		const fileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*");
		fileSystemWatcher.onDidChange(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidCreate(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidDelete(uri => this.onResourceChange(uri), context.subscriptions);

		context.subscriptions.push(this.cvsScm);
		context.subscriptions.push(fileSystemWatcher);
	}

	getWorkspaceFolder(): vscode.Uri {
		return this.workspacefolder;
	}

	getCvsState(): void 
	{
		this.onResourceChange(this.workspacefolder);
	}

	onResourceChange(_uri: vscode.Uri): void {
		if (this.timeout) { clearTimeout(this.timeout); }
		this.timeout = setTimeout(() => this.getResourceChanges(_uri), 500);
	}

	async getResourceChanges(event: vscode.Uri): Promise<void> {
		const changedResources: vscode.SourceControlResourceState[] = [];
		const conflictResources: vscode.SourceControlResourceState[] = [];
		const unknownResources: vscode.SourceControlResourceState[] = [];
		this.changedResources.resourceStates = changedResources;
		this.conflictResources.resourceStates = changedResources;
		this.unknownResources.resourceStates = unknownResources;

		const result = await this.cvsRepository.getResources();
		await this.cvsRepository.parseResources(result);
		
		this.cvsRepository.getChangesSourceFiles().forEach(element => {

			if(element.state === SourceFileState.modified)
			{
				const token = new vscode.CancellationTokenSource();
				const left = this.cvsRepository.provideOriginalResource!(vscode.Uri.joinPath(this.workspacefolder, element.path), token.token);
				let right = vscode.Uri.joinPath(this.workspacefolder, element.path);

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${path.basename(element.path)} (${this.changedResources.label})`],
					tooltip: "Diff your changes"
				};

				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.path),
					command: command,
					contextValue: 'modified',
					decorations: {
						strikeThrough: false,
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/modified.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/modified.svg",
						}
					}};

				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.untracked)
			{
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.path),
					decorations: {
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/untracked.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/untracked.svg",
						}
					}};

				unknownResources.push(resourceState);
			} else if (element.state === SourceFileState.added) {
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.path),
					contextValue: "undoable",
					decorations: {
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/added.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/added.svg",
						}
					}};

				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.removed) {	
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.path),					
					contextValue: "removed",
					decorations: {
						strikeThrough: true,						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/deleted.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/deleted.svg",
						}
					}};

				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.lost) {
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.path),					
					contextValue: "lost",
					decorations: {
						strikeThrough: true,						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/lost.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/lost.svg",
						}
					}};

				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.conflict) {	
				let _uri = vscode.Uri.joinPath(this.workspacefolder, element.path);
				
				const command: vscode.Command =
				{
					title: "View conflicts",
					command: "vscode.open",
					arguments: [_uri],
					tooltip: "Open file"
				};

				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: _uri,
					contextValue: "conflict",
					command: command,
					decorations: {						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/conflict.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/conflict.svg",
						}
					}};

				conflictResources.push(resourceState);
			} else if (element.state === SourceFileState.patch) {
				const token = new vscode.CancellationTokenSource();
				let left = this.cvsRepository.provideOriginalResource!(vscode.Uri.joinPath(this.workspacefolder, element.path), token.token);
				let right = vscode.Uri.joinPath(this.workspacefolder, element.path);

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${path.basename(element.path)} (${this.conflictResources.label})`],
					tooltip: "View remote changes"
				};

				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.path),
					command: command,				
					contextValue: "patch",
					decorations: {						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/patch.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/patch.svg",
						}
					}};

				conflictResources.push(resourceState);
			} else if (element.state === SourceFileState.merge) {
				const token = new vscode.CancellationTokenSource();
				let left = this.cvsRepository.provideOriginalResource!(vscode.Uri.joinPath(this.workspacefolder, element.path), token.token);
				let right = vscode.Uri.joinPath(this.workspacefolder, element.path);

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${path.basename(element.path)} (${this.conflictResources.label})`],
					tooltip: "View remote changes"
				};
	
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.path),
					command: command,
					contextValue: "merge",
					decorations: {						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/merge.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/merge.svg",
						}
					}};

				conflictResources.push(resourceState);
			} else if (element.state === SourceFileState.checkout) {
				const token = new vscode.CancellationTokenSource();
				let left = this.cvsRepository.provideOriginalResource!(vscode.Uri.joinPath(this.workspacefolder, element.path), token.token);
				let right = "";

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${path.basename(element.path)} (${this.conflictResources.label})`],
					tooltip: "View remote changes"
				};
	
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.path),
					command: command,
					contextValue: "merge",
					decorations: {						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/patch.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/patch.svg",
						}
					}};

				conflictResources.push(resourceState);
			}			
		});
		
		this.changedResources.resourceStates = changedResources;
		this.conflictResources.resourceStates = conflictResources;
		this.unknownResources.resourceStates = unknownResources;

		this.cvsDocumentContentProvider.updated(changedResources.concat(conflictResources));
	}

	async commitAll(): Promise<void> {
		if (!this.changedResources.resourceStates.length) {
			vscode.window.showErrorMessage("There is nothing to commit.");
			return;
		}
		else if (this.cvsScm.inputBox.value.length === 0) {
			vscode.window.showErrorMessage("Missing commit message.");
			return;
		}

		//need list of files relative to root 
		let files = '';
		let token = this.workspacefolder.fsPath.concat("/");
		this.changedResources.resourceStates.forEach(element => {			
			files = files.concat(element.resourceUri.fsPath.split(token)[1], ' ');
		});

		await runCvsBoolCmd(`cvs commit -m "${this.cvsScm.inputBox.value}" ${files}`, this.workspacefolder.fsPath);
		this.cvsScm.inputBox.value = '';
	}

	async commitFile(_uri: vscode.Uri): Promise<void> {
		if (this.cvsScm.inputBox.value.length === 0) {
			vscode.window.showErrorMessage("Missing commit message.");
			return;
		}

		const token = this.workspacefolder.fsPath.concat("/");
		const file = _uri.fsPath.split(token)[1];

		await runCvsBoolCmd(`cvs commit -m "${this.cvsScm.inputBox.value}" ${file}`, this.workspacefolder.fsPath);
		this.cvsScm.inputBox.value = '';
	}

	async forceRevert(_uri: vscode.Uri): Promise<void> {
		try {
			await this.deleteFile(_uri);
			await this.revertFile(_uri);
		} catch(e) {
			vscode.window.showErrorMessage("Error reverting file");
		}
	}

	async addFile(_uri: vscode.Uri): Promise<void>  {
		await runCvsBoolCmd(`cvs add ${path.basename(_uri.fsPath)}`, path.dirname(_uri.fsPath));
	}

	async removeFileFromCvs(_uri: vscode.Uri): Promise<void>  {
		await runCvsBoolCmd(`cvs remove -f ${path.basename(_uri.fsPath)}`, path.dirname(_uri.fsPath));
	}

	async recoverLostFile(_uri: vscode.Uri): Promise<void>  {
		await runCvsBoolCmd(`cvs update ${path.basename(_uri.fsPath)}`, path.dirname(_uri.fsPath));
	}

	async deleteFile(_uri: vscode.Uri): Promise<void>  {
		await fsPromises.unlink(_uri.fsPath);
	}

	async revertFile(uri: vscode.Uri): Promise<void> {
		await runCvsBoolCmd(`cvs update -C ${path.basename(uri.fsPath)}`, path.dirname(uri.fsPath));
	}

	async mergeLatest(uri: vscode.Uri): Promise<void>  {
		// FIX ME need to get latest version in tmp, cvs update will fail if file contains conflicts??
		await runCvsBoolCmd(`cvs update ${path.basename(uri.fsPath)}`, path.dirname(uri.fsPath));
	}

	// can only do this if file was untracked by repository
	async undoAdd(uri: vscode.Uri): Promise<void>  {
		// 1. remove temp CVS file (e.g. 'test.txt,t')
		const files = await this.readDir(path.dirname(uri.fsPath) + '/CVS');
		
		files.forEach(async file => {
			if(file.includes(path.basename(uri.fsPath))) {
				await this.deleteFile(vscode.Uri.parse(path.dirname(uri.fsPath) + '/CVS/' + file));
			}
		});

		const entries = await this.readCvsEntries(path.dirname(uri.fsPath) + '/CVS/Entries');

		let newEntries = '';
		entries.split(/\r?\n/).forEach(element => {
			if (element.includes(path.basename(uri.fsPath)) === false) {
				newEntries = newEntries.concat(element + '\n');
			}
		});

		await this.writeCvsEntries(path.dirname(uri.fsPath) + '/CVS/Entries.out', newEntries);
		 
		await fsPromises.rename(path.dirname(uri.fsPath) + '/CVS/Entries', path.dirname(uri.fsPath) + '/CVS/Entries.bak');
		await fsPromises.rename(path.dirname(uri.fsPath) + '/CVS/Entries.out', path.dirname(uri.fsPath) + '/CVS/Entries');		
	}

	async readDir(path: string): Promise<string[]> {
		const fs = require('fs/promises');

		let result = [];

		try {
			result = await fs.readdir(path);
		} catch (err: any) {
			console.log(err);
		}

		return result;
	}


	async readCvsEntries(path: string): Promise<string> {
		const fs = require('fs/promises');

		let data = '';

		try{
			data = await fs.readFile(path, {encoding: 'utf-8'});
			console.log(data);		
		} catch(err: any) {
			console.log(err);
		}

		return data;
	}

	async writeCvsEntries(path: string, data: string): Promise<void> {
		const fs = require('fs/promises');

		try{
			await fs.writeFile(path, data);
		} catch(err: any) {
			console.log(err);
		}
	}

    dispose() {
		this.cvsScm.dispose();
	}
}