import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import { CvsRepository } from './cvsRepository';
import * as path from 'path';
import { SourceFileState } from './sourceFile';


export class CvsSourceControl implements vscode.Disposable {
	private cvsScm: vscode.SourceControl;
	private changedResources: vscode.SourceControlResourceGroup;
	private unknownResources: vscode.SourceControlResourceGroup;
	private cvsRepository: CvsRepository;
	private rootPath: vscode.Uri;
	private timeout?: NodeJS.Timer;

	//constructor(context: vscode.ExtensionContext, private readonly workspaceFolder: vscode.WorkspaceFolder) {
    constructor(context: vscode.ExtensionContext) {
		this.cvsScm = vscode.scm.createSourceControl('cvs', 'CVS');
		this.changedResources = this.cvsScm.createResourceGroup('workingTree', 'Changes');
		this.unknownResources = this.cvsScm.createResourceGroup('unknownTree', 'Untracked');

		this.rootPath =
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		  ? vscode.workspace.workspaceFolders[0].uri
		  : vscode.Uri.parse('empty');

		console.log(this.rootPath);
		
        this.cvsRepository = new CvsRepository(this.rootPath);
		this.cvsScm.quickDiffProvider = this.cvsRepository;
		this.cvsScm.inputBox.placeholder = 'cvs commit message';

		// start listening
		//const fileWatcher = vscode.workspace.onWillSaveTextDocument(e => this.listen(e), context.subscriptions);

		const fileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*");
		fileSystemWatcher.onDidChange(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidCreate(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidDelete(uri => this.onResourceChange(uri), context.subscriptions);

		context.subscriptions.push(this.cvsScm);
		context.subscriptions.push(fileSystemWatcher);
	}

	getCvsState(): void 
	{
		this.onResourceChange(this.rootPath);
	}

	async onResourceChange(event: vscode.Uri): Promise<void> {
		console.log("onResourceChange");
		console.log(event.fsPath);

		const changedResources: vscode.SourceControlResourceState[] = [];
		const unknownResources: vscode.SourceControlResourceState[] = [];
		let result = await this.cvsRepository.getResources();
		await this.cvsRepository.parseResources(result);
		
		this.cvsRepository.getChangesSourceFiles().forEach(element => {

			if(element.state === SourceFileState.modified)
			{
				let left = this.cvsRepository.getHeadVersion(element.resource);
				// const token = new vscode.CancellationTokenSource();
				// const left = this.cvsRepository.provideOriginalResource(element.resource, token.token);

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
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,					
					contextValue: "conflict",
					decorations: {						
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/conflict.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/conflict.svg",
						}
					}};
				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.patch) {
				console.log(element.resource);
				console.log('patch');
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,					
					contextValue: "patch",
					decorations: {						
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/patch.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/patch.svg",
						}
					}};
				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.merge) {
				console.log(element.resource);
				console.log('merge');
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: element.resource,					
					contextValue: "merge",
					decorations: {						
						dark:{
							iconPath: "/home/jon/cvs-ext/resources/icons/dark/merge.svg",
						},
						light: {
							iconPath: "/home/jon/cvs-ext/resources/icons/light/merge.svg",
						}
					}};
				changedResources.push(resourceState);
			}

			
		});
		
		this.changedResources.resourceStates = changedResources;
		this.unknownResources.resourceStates = unknownResources;
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
		const files = this.getListOfFIlesToCommit();

		const { exec } = require("child_process");
		const result = await new Promise<void>((resolve, reject) => {
			const cvsCmd = `cvs commit -m "${this.cvsScm.inputBox.value}" ${files}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: this.rootPath.fsPath}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					vscode.window.showErrorMessage("Error commiting files.");
					reject(error);
				} else {
					this.cvsScm.inputBox.value = '';
					resolve();
				}
			});
		});
	}

	async commitFile(resource: vscode.Uri): Promise<void> {
		if (this.cvsScm.inputBox.value.length === 0) {
			vscode.window.showErrorMessage("Missing commit message.");
			return;
		}

		const token = this.rootPath.fsPath.concat("/");
		const file = resource.fsPath.split(token)[1];

		const { exec } = require("child_process");
		const result = await new Promise<void>((resolve, reject) => {
			const cvsCmd = `cvs commit -m "${this.cvsScm.inputBox.value}" ${file}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: this.rootPath.fsPath}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					vscode.window.showErrorMessage("Error commiting files.");
					reject(error);
				} else {
					this.cvsScm.inputBox.value = '';
					resolve();
				}
			});
		});
	}

	getListOfFIlesToCommit(): String {
		let files = '';
		this.changedResources.resourceStates.forEach(element => {
			let token = this.rootPath.fsPath.concat("/");
			files = files.concat(element.resourceUri.fsPath.split(token)[1], ' ');
		});
		return files;
	}

	async revertFile(uri: vscode.Uri): Promise<void> {
		const { exec } = require("child_process");
		const result = await new Promise<void>((resolve, reject) => {
			const cvsCmd = `cvs update -C ${path.basename(uri.fsPath)}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					vscode.window.showErrorMessage("Error reverting files.");
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	async addFile(uri: vscode.Uri): Promise<void>  {
		const { exec } = require("child_process");
		const result = await new Promise<void>((resolve, reject) => {
			const cvsCmd = `cvs add ${path.basename(uri.fsPath)}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					vscode.window.showErrorMessage("Error adding file.");
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}	

	async removeFileFromCvs(uri: vscode.Uri): Promise<void>  {
		const { exec } = require("child_process");
		const result = await new Promise<void>((resolve, reject) => {
			const cvsCmd = `cvs remove -f ${path.basename(uri.fsPath)}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					vscode.window.showErrorMessage("Error removing file.");
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	async undoRemoval(uri: vscode.Uri): Promise<void>  {
		const { exec } = require("child_process");
		const result = await new Promise<void>((resolve, reject) => {
			const cvsCmd = `cvs add ${path.basename(uri.fsPath)}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					vscode.window.showErrorMessage("Error undoing removal.");
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	async resurrectLostFile(uri: vscode.Uri): Promise<void>  {
		const { exec } = require("child_process");
		const result = await new Promise<void>((resolve, reject) => {
			const cvsCmd = `cvs update ${path.basename(uri.fsPath)}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					vscode.window.showErrorMessage("Error removing file.");
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	async deleteFile(uri: vscode.Uri): Promise<void>  {
		const { exec } = require("child_process");
		const result = await new Promise<void>((resolve, reject) => {
			const cvsCmd = `rm -f ${path.basename(uri.fsPath)}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					vscode.window.showErrorMessage("Error deleting file.");
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	// can only do this if file was untracked by repository
	async undoAdd(uri: vscode.Uri): Promise<void>  {
		//const fs = require('fs');
		const fs = require('fs/promises');

		// remove temp CVS file (e.g. 'test.txt,t')
		const files = await this.readDir(path.dirname(uri.fsPath) + '/CVS');
		
		files.forEach(async file => {
			if(file.includes(path.basename(uri.fsPath))) {
				await this.removeFile(path.dirname(uri.fsPath) + '/CVS/' + file);
				console.log('remove file');
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

	async mergeLatest(uri: vscode.Uri): Promise<void>  {
		const { exec } = require("child_process");
		await new Promise<void>((resolve, reject) => {
			const cvsCmd = `cvs update ${path.basename(uri.fsPath)}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					vscode.window.showErrorMessage("Error merging file.");
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	async removeFile(path: string) : Promise<void> {
		const fs = require('fs/promises');

		try {
			await fsPromises.rm(path);
		} catch (err: any) {
			console.log(err);
		}		
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