import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import { CvsRepository } from './cvsRepository';
import * as path from 'path';
import { SourceFile, SourceFileState } from './sourceFile';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';
import { runCvsBoolCmd } from './utility';
import { basename, dirname } from 'path';


export class CvsSourceControl implements vscode.Disposable {
	private cvsScm: vscode.SourceControl;
	private workspacefolder: vscode.Uri;
	private cvsDocumentContentProvider: CvsDocumentContentProvider;
	private stagedResources: vscode.SourceControlResourceGroup;
	private changedResources: vscode.SourceControlResourceGroup;
	private conflictResources: vscode.SourceControlResourceGroup;
	private unknownResources: vscode.SourceControlResourceGroup;
	private cvsRepository: CvsRepository;
	private timeout?: NodeJS.Timer;
	private myStatusBarItem: vscode.StatusBarItem;
	private stagedFiles: string[]; //temp array

    constructor(context: vscode.ExtensionContext, worspacefolder: vscode.Uri, cvsDocumentContentProvider: CvsDocumentContentProvider) {
		this.cvsScm = vscode.scm.createSourceControl('cvs', 'CVS', worspacefolder);
		this.workspacefolder = worspacefolder;
		this.cvsDocumentContentProvider = cvsDocumentContentProvider;
		this.stagedResources = this.cvsScm.createResourceGroup('stagingTree', 'Staged Changes');
		this.changedResources = this.cvsScm.createResourceGroup('changeTree', 'Changes');
		this.conflictResources = this.cvsScm.createResourceGroup('conflictTree', 'Conflicts');
		this.unknownResources = this.cvsScm.createResourceGroup('untrackedTree', 'Untracked');

		this.stagedResources.hideWhenEmpty = true;
		this.changedResources.hideWhenEmpty = true;
		this.conflictResources.hideWhenEmpty = true;
		this.unknownResources.hideWhenEmpty = true;

		this.stagedFiles = [];
		
        this.cvsRepository = new CvsRepository(this.workspacefolder);
		this.cvsScm.quickDiffProvider = this.cvsRepository;
		this.cvsScm.inputBox.placeholder = 'Commit Message';

		const fileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*");
		fileSystemWatcher.onDidChange(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidCreate(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidDelete(uri => this.onResourceChange(uri), context.subscriptions);

		this.myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		context.subscriptions.push(this.myStatusBarItem);
		context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(textEditor => this.updateStatusBarItem(textEditor), context.subscriptions));

		context.subscriptions.push(this.cvsScm);
		context.subscriptions.push(fileSystemWatcher);

		this.updateStatusBarItem(vscode.window.activeTextEditor);
	}

	async updateStatusBarItem(textEditor: vscode.TextEditor | undefined): Promise<void> {
		if (textEditor && dirname(textEditor.document.uri.fsPath).includes(this.workspacefolder.fsPath)) {
			let resource = textEditor.document.uri.fsPath.split(this.workspacefolder.fsPath)[1];
			resource = resource.substring(1);
			let sourceFile = new SourceFile(resource);
			await this.cvsRepository.getStatusOfFile(sourceFile);
			if (sourceFile.branch && sourceFile.workingRevision) {
				this.myStatusBarItem.text = `$(source-control-view-icon) ${sourceFile.branch}: ${sourceFile.workingRevision}`;
				this.myStatusBarItem.show();
			}
			else {
				this.myStatusBarItem.hide();	
			}
		}
		else
		{
			this.myStatusBarItem.hide();
		}
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
		const stagedResources: vscode.SourceControlResourceState[] = [];
		const changedResources: vscode.SourceControlResourceState[] = [];
		const conflictResources: vscode.SourceControlResourceState[] = [];
		const unknownResources: vscode.SourceControlResourceState[] = [];
		this.stagedResources.resourceStates = stagedResources;
		this.changedResources.resourceStates = changedResources;
		this.conflictResources.resourceStates = changedResources;
		this.unknownResources.resourceStates = unknownResources;

		const result = await this.cvsRepository.getResources();
		await this.cvsRepository.parseResources(result);

		console.log("staged files: " + this.stagedFiles);
		
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
				
				if (element.isStaged || this.stagedFiles.includes(element.path)) {
					stagedResources.push(resourceState);
				} else {
					changedResources.push(resourceState);
				}
			} else if (element.state === SourceFileState.untracked)
			{
				var type = "untracked_file";
				if (element.isFolder) {
					type = "untracked_folder";
				}

				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.path),
					contextValue: type,
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

				if (element.isStaged || this.stagedFiles.includes(element.path)) {
					stagedResources.push(resourceState);
				} else {
					changedResources.push(resourceState);
				}
			} else if (element.state === SourceFileState.removed) {
				// cannot provide diff once "cvs remove" executed
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.path),					
					contextValue: "removed",
					decorations: {
						strikeThrough: true,						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/removed.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/removed.svg",
						}
					}};

				if (element.isStaged || this.stagedFiles.includes(element.path)) {
					stagedResources.push(resourceState);
				} else {
					changedResources.push(resourceState);
				}
			} else if (element.state === SourceFileState.deleted) {
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
					contextValue: "deleted",
					decorations: {
						strikeThrough: true,						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/deleted.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/deleted.svg",
						}
					}};

					conflictResources.push(resourceState);
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
					contextValue: "checkout",
					decorations: {						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/checkout.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/checkout.svg",
						}
					}};

				conflictResources.push(resourceState);
			}
			else if (element.state === SourceFileState.invalid) {
				const token = new vscode.CancellationTokenSource();
				let left = "";
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
					contextValue: "invalid",
					decorations: {			
						strikeThrough: true,			
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/conflict.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/conflict.svg",
						}
					}};

				conflictResources.push(resourceState);
			}			
		});
		
		this.stagedResources.resourceStates = stagedResources;
		this.changedResources.resourceStates = changedResources;
		this.conflictResources.resourceStates = conflictResources;
		this.unknownResources.resourceStates = unknownResources;

		this.cvsDocumentContentProvider.updated(changedResources.concat(conflictResources));
	}

	async commitAll(): Promise<void> {
		if (!this.stagedResources.resourceStates.length) {
			vscode.window.showErrorMessage("There are no staged changes to commit.");
			return;
		}
		else if (this.cvsScm.inputBox.value.length === 0) {
			vscode.window.showErrorMessage("Missing commit message.");
			return;
		}

		//need list of files relative to root 
		let files = '';
		let token = this.workspacefolder.fsPath.concat("/");
		this.stagedResources.resourceStates.forEach(element => {			
			files = files.concat(element.resourceUri.fsPath.split(token)[1], ' ');
		});


		if (await runCvsBoolCmd(`cvs commit -m "${this.cvsScm.inputBox.value}" ${files}`, this.workspacefolder.fsPath)) {
			this.stagedResources.resourceStates.forEach(element => {			
				this.unstageFile(element.resourceUri, false);
			});
			
			this.cvsScm.inputBox.value = '';
			this.getCvsState();
			
		} else {
			vscode.window.showErrorMessage('Failed to commit changes');
		};

		
	}

	async stageFile(_uri: vscode.Uri, refreshScm: boolean=true): Promise<void> {
		this.cvsRepository.getChangesSourceFiles().forEach(element => {
		//for (const element of this.cvsRepository.getChangesSourceFiles()) {
			const resource = _uri.fsPath.split(this.workspacefolder.fsPath)[1].substring(1);			
			if (resource === element.path) {
				element.isStaged = true;

				//temp array until all stats are cached
				this.stagedFiles.push(element.path);

				if (refreshScm) {
					this.getCvsState();
				}
				return;
			}
		});
	}

	async unstageFile(_uri: vscode.Uri, refreshScm: boolean=true): Promise<void> {
		this.cvsRepository.getChangesSourceFiles().forEach(element => {
		///for (const element of this.cvsRepository.getChangesSourceFiles()) {
			const resource = _uri.fsPath.split(this.workspacefolder.fsPath)[1].substring(1);
			if (resource === element.path) {
				element.isStaged = false;

				//temp array until all stats are cached
				const index = this.stagedFiles.indexOf(element.path, 0);
				if (index > -1) {
					this.stagedFiles.splice(index, 1);
				}

				if (refreshScm) {
					this.getCvsState();
				}
				return;
			}
		});
	}

	async stageAll(): Promise<void> {
		if (this.changedResources.resourceStates.length === 0) {
			vscode.window.showErrorMessage("There are no changes to stage.");
			return;
		}

		this.changedResources.resourceStates.forEach(element => {			
			this.stageFile(element.resourceUri, false);
		});

		this.getCvsState();
		return;
	}

	async unstageAll(): Promise<void> {
		if (this.stagedResources.resourceStates.length === 0) {
			vscode.window.showErrorMessage("There are no changes to unstage.");
			return;
		}

		this.stagedResources.resourceStates.forEach(element => {			
			this.unstageFile(element.resourceUri, false);
		});

		this.getCvsState();
		return;
	}


	async forceRevert(_uri: vscode.Uri): Promise<void> {
		try {
			await this.deleteUri(_uri);
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

	async recoverDeletedFile(_uri: vscode.Uri): Promise<void>  {
		this.unstageFile(_uri); // in case staged
		await runCvsBoolCmd(`cvs update ${path.basename(_uri.fsPath)}`, path.dirname(_uri.fsPath));
	}

	async deleteUri(_uri: vscode.Uri): Promise<void>  {
		const fs = require('fs/promises');
		// is it a file or folder?
		const stat = await fs.lstat(_uri.fsPath);
		if (stat.isFile()) {
			await fsPromises.unlink(_uri.fsPath);
		}
		else {
			await fsPromises.rmdir(_uri.fsPath);
		}		
	}

	async revertFile(_uri: vscode.Uri): Promise<void> {
		this.unstageFile(_uri); // in case staged
		await runCvsBoolCmd(`cvs update -C ${path.basename(_uri.fsPath)}`, path.dirname(_uri.fsPath));
	}

	async mergeLatest(uri: vscode.Uri): Promise<void>  {
		// FIX ME need to get latest version in tmp, cvs update will fail if file contains conflicts??
		await runCvsBoolCmd(`cvs update ${path.basename(uri.fsPath)}`, path.dirname(uri.fsPath));
	}

	// can only do this if file was untracked by repository
	async undoAdd(_uri: vscode.Uri): Promise<void>  {
		this.unstageFile(_uri); // in case staged

		// 1. remove temp CVS file (e.g. 'test.txt,t')
		const files = await this.readDir(path.dirname(_uri.fsPath) + '/CVS');
		
		files.forEach(async file => {
			if(file.includes(path.basename(_uri.fsPath))) {
				await this.deleteUri(vscode.Uri.parse(path.dirname(_uri.fsPath) + '/CVS/' + file));
			}
		});

		const entries = await this.readCvsEntries(path.dirname(_uri.fsPath) + '/CVS/Entries');

		let newEntries = '';
		entries.split(/\r?\n/).forEach(element => {
			if (element.includes(path.basename(_uri.fsPath)) === false) {
				newEntries = newEntries.concat(element + '\n');
			}
		});

		await this.writeCvsEntries(path.dirname(_uri.fsPath) + '/CVS/Entries.out', newEntries);
		 
		await fsPromises.rename(path.dirname(_uri.fsPath) + '/CVS/Entries', path.dirname(_uri.fsPath) + '/CVS/Entries.bak');
		await fsPromises.rename(path.dirname(_uri.fsPath) + '/CVS/Entries.out', path.dirname(_uri.fsPath) + '/CVS/Entries');
		
		//TODO remove Entries.bak
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