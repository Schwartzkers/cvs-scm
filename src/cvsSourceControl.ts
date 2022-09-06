import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import { CvsFile, CvsRepository } from './cvsRepository';
import * as path from 'path';
import { SourceFileState } from './sourceFile';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';


export class CvsSourceControl implements vscode.Disposable {
	private cvsScm: vscode.SourceControl;
	private workspacefolder: vscode.Uri;
	private cvsDocumentContentProvider: CvsDocumentContentProvider;
	private changedResources: vscode.SourceControlResourceGroup;
	private conflictResources: vscode.SourceControlResourceGroup;
	private unknownResources: vscode.SourceControlResourceGroup;
	private cvsRepository: CvsRepository;
	private timeout?: NodeJS.Timer;

	//constructor(context: vscode.ExtensionContext, private readonly workspaceFolder: vscode.WorkspaceFolder) {
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

	getCvsState(): void 
	{
		this.onResourceChange(this.workspacefolder);
	}

	onResourceChange(_uri: vscode.Uri): void {
		if (this.timeout) { clearTimeout(this.timeout); }
		this.timeout = setTimeout(() => this.getResourceChanges(_uri), 500);
	}

	async getResourceChanges(event: vscode.Uri): Promise<void> {
		console.log("onResourceChange");
		console.log(event.fsPath);

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
				const left = this.cvsRepository.provideOriginalResource!(element.resource, token.token);
				console.log(left);

				let right = element.resource;

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right],
					tooltip: "Diff your changes"
				};

				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,
					command: command,
					contextValue: 'revertable',
					decorations: {
						strikeThrough: false,
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/modified.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/modified.svg",
						}
					}};
				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.untracked)
			{
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,	
					decorations: {
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/untracked.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/untracked.svg",
						}
					}};
				unknownResources.push(resourceState);
			} else if (element.state === SourceFileState.added) {
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,
					contextValue: "undoable",
					decorations: {
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/added.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/added.svg",
						}
					}};
				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.removed) {
				console.log(element.resource);
				console.log('removed');
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,					
					contextValue: "removed",
					decorations: {
						strikeThrough: true,						
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/deleted.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/deleted.svg",
						}
					}};
				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.lost) {
				console.log(element.resource);
				console.log('lost');
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,					
					contextValue: "lost",
					decorations: {
						strikeThrough: true,						
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/lost.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/lost.svg",
						}
					}};
				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.conflict) {
				console.log(element.resource);
				console.log('conflict');
				
				const command: vscode.Command =
				{
					title: "View conflicts",
					command: "vscode.open",
					arguments: [element.resource],
					tooltip: "Open file"
				};

				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,					
					contextValue: "conflict",
					command: command,
					decorations: {						
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/conflict.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/conflict.svg",
						}
					}};
				conflictResources.push(resourceState);
			} else if (element.state === SourceFileState.patch) {
				console.log(element.resource);
				console.log('patch');

				const token = new vscode.CancellationTokenSource();
				let left = this.cvsRepository.provideOriginalResource!(element.resource, token.token);
				let right = element.resource;

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right],
					tooltip: "Diff your changes"
				};

				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,
					command: command,				
					contextValue: "patch",
					decorations: {						
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/patch.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/patch.svg",
						}
					}};
				conflictResources.push(resourceState);
			} else if (element.state === SourceFileState.merge) {
				console.log(element.resource);

				const token = new vscode.CancellationTokenSource();
				let left = this.cvsRepository.provideOriginalResource!(element.resource, token.token);
				let right = element.resource;

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right],
					tooltip: "Diff your changes"
				};

				console.log('merge');
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,
					command: command,
					contextValue: "merge",
					decorations: {						
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/merge.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/merge.svg",
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


		await this.runCvsCommand(`cvs commit -m "${this.cvsScm.inputBox.value}" ${files}`, this.workspacefolder.fsPath);
		this.cvsScm.inputBox.value = '';
	}

	async commitFile(_uri: vscode.Uri): Promise<void> {
		if (this.cvsScm.inputBox.value.length === 0) {
			vscode.window.showErrorMessage("Missing commit message.");
			return;
		}

		const token = this.workspacefolder.fsPath.concat("/");
		const file = _uri.fsPath.split(token)[1];

		await this.runCvsCommand(`cvs commit -m "${this.cvsScm.inputBox.value}" ${file}`, this.workspacefolder.fsPath);
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
		await this.runCvsCommand(`cvs add ${path.basename(_uri.fsPath)}`, path.dirname(_uri.fsPath));
	}

	async removeFileFromCvs(_uri: vscode.Uri): Promise<void>  {
		await this.runCvsCommand(`cvs remove -f ${path.basename(_uri.fsPath)}`, path.dirname(_uri.fsPath));
	}

	async recoverLostFile(_uri: vscode.Uri): Promise<void>  {
		await this.runCvsCommand(`cvs update ${path.basename(_uri.fsPath)}`, path.dirname(_uri.fsPath));
	}

	async deleteFile(_uri: vscode.Uri): Promise<void>  {
		await fsPromises.unlink(_uri.fsPath);
	}

	async revertFile(uri: vscode.Uri): Promise<void> {
		await this.runCvsCommand(`cvs update -C ${path.basename(uri.fsPath)}`, path.dirname(uri.fsPath));
	}

	async mergeLatest(uri: vscode.Uri): Promise<void>  {
		// need to get latest version in tmp, cvs update will fail if file contains conflicts??
		//this.cvsRepository.createTmpVersion(uri);

		await this.runCvsCommand(`cvs update ${path.basename(uri.fsPath)}`, path.dirname(uri.fsPath));
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

		console.log(newEntries);
		await this.writeCvsEntries(path.dirname(uri.fsPath) + '/CVS/Entries.out', newEntries);
		 
		await fsPromises.rename(path.dirname(uri.fsPath) + '/CVS/Entries', path.dirname(uri.fsPath) + '/CVS/Entries.bak');
		await fsPromises.rename(path.dirname(uri.fsPath) + '/CVS/Entries.out', path.dirname(uri.fsPath) + '/CVS/Entries');		
	}

	async runCvsCommand(cvsCommand: string, path: string): Promise<boolean>  {
		const { exec } = require("child_process");
		return await new Promise<boolean>((resolve, reject) => {
			console.log('runCvsCommand: '+ cvsCommand);
			exec(cvsCommand, {cwd: path}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					vscode.window.showErrorMessage("CVS repository error");
					console.log(error);
					reject(false);
				} else {
					resolve(true);
				}
			});
		});
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