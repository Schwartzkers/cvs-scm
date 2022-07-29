import * as vscode from 'vscode';
import { CvsRepository } from './cvsRepository';
import * as path from 'path';


export class CvsSourceControl implements vscode.Disposable {
	private cvsScm: vscode.SourceControl;
	private changedResources: vscode.SourceControlResourceGroup;
	private cvsRepository: CvsRepository;
	private rootPath: vscode.Uri;
	private timeout?: NodeJS.Timer;

	//constructor(context: vscode.ExtensionContext, private readonly workspaceFolder: vscode.WorkspaceFolder) {
    constructor(context: vscode.ExtensionContext) {
		this.cvsScm = vscode.scm.createSourceControl('cvs', 'CVS');
		this.changedResources = this.cvsScm.createResourceGroup('workingTree', 'Changes');

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
		let result = await this.cvsRepository.getResources();
		this.cvsRepository.parseResources(result);
		
		this.cvsRepository.getRes().forEach(element => {
			let left = this.cvsRepository.getHeadVersion(element);
			let right = element;
	
			const command: vscode.Command =
			{
				title: "Show changes",
				command: "vscode.diff",
				arguments: [left, right],
				tooltip: "Diff your changes"
			};

			console.log(vscode.Uri.joinPath(this.rootPath, "resources/icons/dark/modified.svg"));
			const resourceState: vscode.SourceControlResourceState = {
				resourceUri: element,
				command: command,
				contextValue: 'diffable',			
				decorations: {
					dark:{
						iconPath: "/home/jon/cvs-ext/resources/icons/dark/modified.svg",
					},
					light: {
						iconPath: "/home/jon/cvs-ext/resources/icons/light/modified.svg",
					}
				}};
			changedResources.push(resourceState);
			console.log('push');
		});
		
		this.changedResources.resourceStates = changedResources;
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
					vscode.window.showErrorMessage("Error commiting files.");
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}


    dispose() {
		this.cvsScm.dispose();
	}
}