import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import { CvsRepository } from './cvsRepository';
import * as path from 'path';
import { SourceFile, SourceFileState } from './sourceFile';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';
import { runCvsBoolCmd, runCvsStrCmd } from './utility';
import { dirname } from 'path';
import { ConfigManager} from './configManager';

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
	private stagedFiles: string[];
	private configManager: ConfigManager;

    constructor(context: vscode.ExtensionContext,
		        worspacefolder: vscode.Uri,
				cvsDocumentContentProvider: CvsDocumentContentProvider,
				configManager: ConfigManager) {
		this.cvsScm = vscode.scm.createSourceControl('cvs', 'CVS', worspacefolder);
		this.workspacefolder = worspacefolder;
		this.cvsDocumentContentProvider = cvsDocumentContentProvider;
		this.configManager = configManager;
		this.stagedResources = this.cvsScm.createResourceGroup('stagingTree', 'Staged Changes');
		this.changedResources = this.cvsScm.createResourceGroup('changeTree', 'Changes');
		this.conflictResources = this.cvsScm.createResourceGroup('conflictTree', 'Conflicts');
		this.unknownResources = this.cvsScm.createResourceGroup('untrackedTree', 'Untracked');

		this.stagedResources.hideWhenEmpty = true;
		this.changedResources.hideWhenEmpty = true;
		this.conflictResources.hideWhenEmpty = true;
		this.unknownResources.hideWhenEmpty = true;

		this.stagedFiles = [];
		
        this.cvsRepository = new CvsRepository(this.workspacefolder, this.configManager);
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
		await this.cvsRepository.getResources();
		this.refreshScm();
	}

	refreshScm(): void {
		const stagedResources: vscode.SourceControlResourceState[] = [];
		const changedResources: vscode.SourceControlResourceState[] = [];
		const conflictResources: vscode.SourceControlResourceState[] = [];
		const unknownResources: vscode.SourceControlResourceState[] = [];
		
		this.cvsRepository.getChangesSourceFiles().forEach(element => {

			// check if resource is staged
			let isStaged = false;			
			this.stagedFiles.forEach(resource => {
				if (resource === vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot).fsPath) {
					isStaged = true;
				}
			});

			if(element.state === SourceFileState.modified)
			{
				const token = new vscode.CancellationTokenSource();
				const left = this.cvsRepository.provideOriginalResource!(vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot), token.token);
				let right = vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot);

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${path.basename(element.relativePathFromRoot)} (${this.changedResources.label})`],
					tooltip: "Diff your changes"
				};

				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot),
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
				
				if (isStaged) {
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
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot),
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
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot),
					contextValue: "added",
					decorations: {
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/added.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/added.svg",
						}
					}};

				if (isStaged) {
					stagedResources.push(resourceState);
				} else {
					changedResources.push(resourceState);
				}
			} else if (element.state === SourceFileState.removed) {
				// cannot provide diff once "cvs remove" executed
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot),					
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

				if (isStaged) {
					stagedResources.push(resourceState);
				} else {
					changedResources.push(resourceState);
				}
			} else if (element.state === SourceFileState.deleted) {
				const token = new vscode.CancellationTokenSource();
				let left = this.cvsRepository.provideOriginalResource!(vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot), token.token);
				let right = "";

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${path.basename(element.relativePathFromRoot)} (${this.conflictResources.label})`],
					tooltip: "View remote changes"
				};

				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot),					
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
				let _uri = vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot);
				
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
				let left = this.cvsRepository.provideOriginalResource!(vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot), token.token);
				let right = vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot);

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${path.basename(element.relativePathFromRoot)} (${this.conflictResources.label})`],
					tooltip: "View remote changes"
				};

				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot),
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
				let left = this.cvsRepository.provideOriginalResource!(vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot), token.token);
				let right = vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot);

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${path.basename(element.relativePathFromRoot)} (${this.conflictResources.label})`],
					tooltip: "View remote changes"
				};
	
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot),
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
				let left = this.cvsRepository.provideOriginalResource!(vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot), token.token);
				let right = "";

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${path.basename(element.relativePathFromRoot)} (${this.conflictResources.label})`],
					tooltip: "View remote changes"
				};
	
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot),
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
				let right = vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot);

				const command: vscode.Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${path.basename(element.relativePathFromRoot)} (${this.conflictResources.label})`],
					tooltip: "View remote changes"
				};
	
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot),
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
			} else if (element.state === SourceFileState.directory) {
				const resourceState: vscode.SourceControlResourceState = {
					resourceUri: vscode.Uri.joinPath(this.workspacefolder, element.relativePathFromRoot),
					contextValue: "directory",
					decorations: {			
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/folder.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/folder.svg",
						}
					}};

				conflictResources.push(resourceState);
			}		
		});
		
		this.stagedResources.resourceStates = stagedResources;
		this.changedResources.resourceStates = changedResources;
		this.conflictResources.resourceStates = conflictResources;
		this.unknownResources.resourceStates = unknownResources;

		this.cvsDocumentContentProvider.updated(changedResources.concat(conflictResources, stagedResources));
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
		} else {
			vscode.window.showErrorMessage('Failed to commit changes');
		};		
	}

	async stageFile(_uri: vscode.Uri, refresh: boolean=true): Promise<void> {
		if (!this.stagedFiles.includes(_uri.fsPath)) {
			// add to staging cache
			this.stagedFiles.push(_uri.fsPath);
		}

		if (refresh) {
			this.refreshScm();
		}		
	}

	async unstageFile(_uri: vscode.Uri, refresh: boolean=true): Promise<void> {
		if (this.stagedFiles.includes(_uri.fsPath)) {
			// remove from staging cache
			let index = this.stagedFiles.indexOf(_uri.fsPath, 0);
			if (index > -1) {
				this.stagedFiles.splice(index, 1);
			}
		}

		if (refresh) {
			this.refreshScm();
		}
	}

	async stageAll(): Promise<void> {
		if (this.changedResources.resourceStates.length === 0) {
			vscode.window.showErrorMessage("There are no changes to stage.");
			return;
		}

		this.changedResources.resourceStates.forEach(element => {			
			this.stageFile(element.resourceUri, false);
		});

		this.refreshScm();
	}

	async unstageAll(): Promise<void> {
		if (this.stagedResources.resourceStates.length === 0) {
			vscode.window.showErrorMessage("There are no changes to unstage.");
			return;
		}

		this.stagedResources.resourceStates.forEach(element => {			
			this.unstageFile(element.resourceUri, false);
		});

		this.refreshScm();
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
		this.unstageFile(_uri, false); // in case staged
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
		this.unstageFile(_uri, false); // in case staged
		await runCvsBoolCmd(`cvs update -C ${path.basename(_uri.fsPath)}`, path.dirname(_uri.fsPath));
	}

	async mergeLatest(uri: vscode.Uri): Promise<void>  {
		// FIX ME need to get latest version in tmp, cvs update will fail if file contains conflicts??
		await runCvsBoolCmd(`cvs update ${path.basename(uri.fsPath)}`, path.dirname(uri.fsPath));
	}

	// can only do this if file was untracked by repository
	async undoAdd(_uri: vscode.Uri): Promise<void>  {
		this.unstageFile(_uri, false); // in case staged

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
		await fsPromises.unlink(path.dirname(_uri.fsPath) + '/CVS/Entries.bak');
	}

	async ignoreFolder(uri: vscode.Uri): Promise<void>  {
		await this.configManager.updateIgnoreFolders(this.getResourcePathRelativeToWorkspace(uri));
	}

	async checkoutFolder(uri: vscode.Uri): Promise<void>  {
		// 1. make folder
		const fs = require('fs/promises');
		await fs.mkdir(uri.fsPath);

		// 2. cvs add folder
		await this.addFile(uri);

		// 3. cvs update folder
		await runCvsBoolCmd(`cvs update -d `, path.dirname(uri.fsPath));
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
			//console.log(data);		
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

	private getResourcePathRelativeToWorkspace(uri: vscode.Uri) {
		return uri.fsPath.split(this.workspacefolder.fsPath)[1].substring(1);
	}

    dispose() {
		this.cvsScm.dispose();
	}
}