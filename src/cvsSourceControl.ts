import { scm, SourceControl, SourceControlResourceGroup, SourceControlResourceState,
		 CancellationTokenSource, StatusBarItem, Uri, ExtensionContext, Command, Disposable,
		 workspace, RelativePattern, window, StatusBarAlignment, TextEditor, TabInputTextDiff } from 'vscode';
import { promises as fsPromises } from 'fs';
import { CvsRepository } from './cvsRepository';
import { SourceFile, SourceFileState } from './sourceFile';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';
import { execCmd } from './utility';
import { dirname, basename } from 'path';
import { ConfigManager} from './configManager';

export class CvsSourceControl implements Disposable {
	private cvsScm: SourceControl;
	private workspacefolder: Uri;
	private cvsDocumentContentProvider: CvsDocumentContentProvider;
	private stagedResources: SourceControlResourceGroup;
	private changedResources: SourceControlResourceGroup;
	private repositoryResources: SourceControlResourceGroup;
	private conflictResources: SourceControlResourceGroup;
	private unknownResources: SourceControlResourceGroup;
	private cvsRepository: CvsRepository;
	private timeout?: NodeJS.Timer;
	private myStatusBarItem: StatusBarItem;
	private stagedFiles: string[];
	private configManager: ConfigManager;

	constructor(context: ExtensionContext,
			worspacefolder: Uri,
			cvsDocumentContentProvider: CvsDocumentContentProvider,
			configManager: ConfigManager) {
		this.cvsScm = scm.createSourceControl('cvs', 'CVS', worspacefolder);
		this.workspacefolder = worspacefolder;
		this.cvsDocumentContentProvider = cvsDocumentContentProvider;
		this.configManager = configManager;
		this.stagedResources = this.cvsScm.createResourceGroup('stagingTree', 'Staged Changes');
		this.changedResources = this.cvsScm.createResourceGroup('changeTree', 'Changes');
		this.repositoryResources = this.cvsScm.createResourceGroup('repositoryTree', 'Repository Changes');
		this.conflictResources = this.cvsScm.createResourceGroup('conflictTree', 'Conflicts');
		this.unknownResources = this.cvsScm.createResourceGroup('untrackedTree', 'Untracked');

		this.stagedResources.hideWhenEmpty = true;
		this.changedResources.hideWhenEmpty = true;
		this.repositoryResources.hideWhenEmpty = true;
		this.conflictResources.hideWhenEmpty = true;
		this.unknownResources.hideWhenEmpty = true;

		this.stagedFiles = [];
		
		this.cvsRepository = new CvsRepository(this.workspacefolder, this.configManager);
		this.cvsScm.quickDiffProvider = this.cvsRepository;
		this.cvsScm.inputBox.placeholder = 'Commit Message';

		const fileSystemWatcher = workspace.createFileSystemWatcher(new RelativePattern(this.workspacefolder, '**/*'));
		fileSystemWatcher.onDidChange(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidCreate(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidDelete(uri => this.onResourceChange(uri), context.subscriptions);

		this.myStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
		context.subscriptions.push(this.myStatusBarItem);
		context.subscriptions.push(window.onDidChangeActiveTextEditor(textEditor => this.updateStatusBarItem(textEditor), context.subscriptions));

		context.subscriptions.push(this.cvsScm);
		context.subscriptions.push(fileSystemWatcher);

		this.updateStatusBarItem(window.activeTextEditor);
	}

	async updateStatusBarItem(textEditor: TextEditor | undefined): Promise<void> {
		if (textEditor && dirname(textEditor.document.uri.fsPath).includes(this.workspacefolder.fsPath)) {
			let sourceFile = new SourceFile(textEditor.document.uri);
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

	getWorkspaceFolder(): Uri {
		return this.workspacefolder;
	}

	getCvsState(): void 
	{
		this.onResourceChange(this.workspacefolder);
	}

	onResourceChange(_uri: Uri): void {
		if (this.timeout) { clearTimeout(this.timeout); }
		this.timeout = setTimeout(() => this.getResourceChanges(_uri), 500);
	}

	async getResourceChanges(event: Uri): Promise<void> {
		await this.cvsRepository.getResources();
		this.refreshScm();
	}

	refreshScm(): void {
		const stagedResources: SourceControlResourceState[] = [];
		const changedResources: SourceControlResourceState[] = [];
		const repositoryResources: SourceControlResourceState[] = [];
		const conflictResources: SourceControlResourceState[] = [];
		const unknownResources: SourceControlResourceState[] = [];
		
		this.cvsRepository.getChangesSourceFiles().forEach(element => {

			// check if resource is staged
			let isStaged = false;			
			this.stagedFiles.forEach(resource => {
				if (resource === element.uri.fsPath) {
					isStaged = true;
				}
			});

			if(element.state === SourceFileState.modified)
			{
				const token = new CancellationTokenSource();
				const left = this.cvsRepository.provideOriginalResource!(element.uri, token.token);
				let right = element.uri;

				const command: Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${basename(element.uri.fsPath)} (${this.changedResources.label})`],
					tooltip: "Diff your changes"
				};

				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,
					command: command,
					contextValue: 'modified',
					decorations: {
						strikeThrough: false,
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/modified.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/modified.svg",
						},
						tooltip: "Locally Modified"
					}};
				
				if (isStaged) {
					stagedResources.push(resourceState);
				} else {
					changedResources.push(resourceState);
				}
			} else if (element.state === SourceFileState.untracked)
			{
				let type = "untracked_file";
				let tip = "Unknown File";
				if (element.isFolder) {
					type = "untracked_folder";
					tip = "Unknown Folder";
				}

				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,
					contextValue: type,
					decorations: {
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/untracked.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/untracked.svg",
						},
						tooltip: tip
					}};

				unknownResources.push(resourceState);
			} else if (element.state === SourceFileState.added) {
				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,
					contextValue: "added",
					decorations: {
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/added.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/added.svg",
						},
						tooltip: "Locally Added"
					}};

				if (isStaged) {
					stagedResources.push(resourceState);
				} else {
					changedResources.push(resourceState);
				}
			} else if (element.state === SourceFileState.removed) {
				// cannot provide diff once "cvs remove" executed
				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,					
					contextValue: "removed",
					decorations: {
						strikeThrough: true,						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/removed.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/removed.svg",
						},
						tooltip: "Locally Removed"
					}};

				if (isStaged) {
					stagedResources.push(resourceState);
				} else {
					changedResources.push(resourceState);
				}
			} else if (element.state === SourceFileState.deleted) {
				const token = new CancellationTokenSource();
				let left = this.cvsRepository.provideOriginalResource!(element.uri, token.token);
				let right = "";

				const command: Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${basename(element.uri.fsPath)} (${this.changedResources.label})`],
					tooltip: "View remote changes"
				};

				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,					
					contextValue: "deleted",
					command: command,			
					decorations: {
						strikeThrough: true,						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/deleted.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/deleted.svg",
						},
						tooltip: "Deleted"
					}};

				changedResources.push(resourceState);
			} else if (element.state === SourceFileState.conflict) {				
				const command: Command =
				{
					title: "View conflicts",
					command: "vscode.open",
					arguments: [element.uri],
					tooltip: "Open file"
				};

				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,
					contextValue: "conflict",
					command: command,
					decorations: {						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/conflict.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/conflict.svg",
						},
						tooltip: "Contains Conflicts"
					}};

				conflictResources.push(resourceState);
			} else if (element.state === SourceFileState.patch) {
				const token = new CancellationTokenSource();
				let left = this.cvsRepository.provideOriginalResource!(element.uri, token.token);
				let right = element.uri;

				const command: Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${basename(element.uri.fsPath)} (${this.repositoryResources.label})`],
					tooltip: "View remote changes"
				};

				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,
					command: command,				
					contextValue: "patch",
					decorations: {						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/patch.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/patch.svg",
						},
						tooltip: "Needs Patch"
					}};

				repositoryResources.push(resourceState);
			} else if (element.state === SourceFileState.merge) {
				const token = new CancellationTokenSource();
				let left = this.cvsRepository.provideOriginalResource!(element.uri, token.token);
				let right = element.uri;

				const command: Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${basename(element.uri.fsPath)} (${this.repositoryResources.label})`],
					tooltip: "View remote changes"
				};

				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,
					command: command,
					contextValue: "merge",
					decorations: {						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/merge.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/merge.svg",
						},
						tooltip: "Needs Merge"
					}};

				repositoryResources.push(resourceState);
			} else if (element.state === SourceFileState.checkout) {
				const token = new CancellationTokenSource();
				let left = this.cvsRepository.provideOriginalResource!(element.uri, token.token);
				let right = "";

				const command: Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${basename(element.uri.fsPath)} (${this.repositoryResources.label})`],
					tooltip: "View remote changes"
				};

				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,
					command: command,
					contextValue: "checkout",
					decorations: {						
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/checkout.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/checkout.svg",
						},
						tooltip: "Needs Checkout"
					}};

				repositoryResources.push(resourceState);
			}
			else if (element.state === SourceFileState.removedFromRepo) {
				const token = new CancellationTokenSource();
				let left = "";
				let right = element.uri;

				const command: Command =
				{
					title: "Show changes",
					command: "vscode.diff",
					arguments: [left, right, `${basename(element.uri.fsPath)} (${this.repositoryResources.label})`],
					tooltip: "View remote changes"
				};

				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,
					command: command,
					contextValue: "removedFromRepo",
					decorations: {			
						strikeThrough: true,			
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/removed.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/removed.svg",
						},
						tooltip: "Removed from Repository"
					}};

				repositoryResources.push(resourceState);
			} else if (element.state === SourceFileState.directory) {
				const resourceState: SourceControlResourceState = {
					resourceUri: element.uri,
					contextValue: "directory",
					decorations: {			
						dark:{
							iconPath: __dirname + "/../resources/icons/dark/folder.svg",
						},
						light: {
							iconPath: __dirname + "/../resources/icons/light/folder.svg",
						},
						tooltip: "Folder found in Repository"
					}};

				repositoryResources.push(resourceState);
			}		
		});
		
		this.stagedResources.resourceStates = stagedResources;
		this.changedResources.resourceStates = changedResources;
		this.repositoryResources.resourceStates = repositoryResources;
		this.conflictResources.resourceStates = conflictResources;
		this.unknownResources.resourceStates = unknownResources;

		this.cvsDocumentContentProvider.updated(changedResources.concat(conflictResources, stagedResources, repositoryResources));
	}

	async commitAll(): Promise<void> {
		if (!this.stagedResources.resourceStates.length) {
			window.showErrorMessage("There are no staged changes to commit.");
			return;
		}
		else if (this.cvsScm.inputBox.value.length === 0) {
			window.showErrorMessage("Missing commit message.");
			return;
		}

		// need list of files relative to root 
		let files = '';
		this.stagedResources.resourceStates.forEach(element => {			
			files = files.concat(workspace.asRelativePath(element.resourceUri, false) + ' ');
		});

		if (await execCmd(`cvs commit -m "${this.cvsScm.inputBox.value}" ${files}`, this.workspacefolder.fsPath)) {
			this.stagedResources.resourceStates.forEach(element => {			
				this.unstageFile(element.resourceUri, false);
			});
			
			this.cvsScm.inputBox.value = '';			
		} else {
			window.showErrorMessage('Failed to commit changes');
		};		
	}

	async stageFile(_uri: Uri, refresh: boolean=true): Promise<void> {
		if (!this.stagedFiles.includes(_uri.fsPath)) {
			// add to staging cache
			this.stagedFiles.push(_uri.fsPath);
		}

		if (refresh) {
			this.refreshScm();
		}		
	}

	async unstageFile(_uri: Uri, refresh: boolean=true): Promise<void> {
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
			window.showErrorMessage("There are no changes to stage.");
			return;
		}

		for (const resource of this.changedResources.resourceStates) {
		//this.changedResources.resourceStates.forEach(resource => {
			// automatically "cvs remove" any deleted files
			if (resource.contextValue === 'deleted') {
				await this.removeFileFromCvs(resource.resourceUri);
			}
			this.stageFile(resource.resourceUri, false);
		};

		this.refreshScm();
	}

	async unstageAll(): Promise<void> {
		if (this.stagedResources.resourceStates.length === 0) {
			window.showErrorMessage("There are no changes to unstage.");
			return;
		}

		this.stagedResources.resourceStates.forEach(element => {			
			this.unstageFile(element.resourceUri, false);
		});

		this.refreshScm();
	}

	async forceRevert(_uri: Uri): Promise<void> {
		try {
			await this.deleteUri(_uri);
			await this.revertFile(_uri);
		} catch(e) {
			window.showErrorMessage("Error reverting file");
		}
	}

	async addFile(uri: Uri): Promise<void>  {
		await execCmd(`cvs add ${basename(uri.fsPath)}`, dirname(uri.fsPath));
	}

	async removeFileFromCvs(uri: Uri): Promise<void>  {
		await execCmd(`cvs remove -f ${basename(uri.fsPath)}`, dirname(uri.fsPath));
	}

	async recoverDeletedFile(uri: Uri): Promise<void>  {
		this.unstageFile(uri, false); // in case staged
		await execCmd(`cvs update ${basename(uri.fsPath)}`, dirname(uri.fsPath));
	}

	async deleteUri(uri: Uri): Promise<void>  {
		const fs = require('fs/promises');
		// is it a file or folder?
		const stat = await fs.lstat(uri.fsPath);
		if (stat.isFile()) {
			await fsPromises.unlink(uri.fsPath);
		}
		else {
			await fsPromises.rmdir(uri.fsPath);
		}		
	}

	async revertFile(uri: Uri): Promise<void> {
		this.unstageFile(uri, false); // in case staged
			await execCmd(`cvs update -C ${basename(uri.fsPath)}`, dirname(uri.fsPath));
	}

	async mergeLatest(uri: Uri): Promise<void>  {
		// FIX ME need to get latest version in tmp, cvs update will fail if file contains conflicts??
		await execCmd(`cvs update ${basename(uri.fsPath)}`, dirname(uri.fsPath));
	}

	// can only do this if file was untracked by repository
	async undoAdd(_uri: Uri): Promise<void>  {
		this.unstageFile(_uri, false); // in case staged

		// 1. remove temp CVS file (e.g. 'test.txt,t')
		const files = await this.readDir(dirname(_uri.fsPath) + '/CVS');
		
		files.forEach(async file => {
			if(file.includes(basename(_uri.fsPath))) {
				await this.deleteUri(Uri.parse(dirname(_uri.fsPath) + '/CVS/' + file));
			}
		});

		const entries = await this.readCvsEntries(dirname(_uri.fsPath) + '/CVS/Entries');

		let newEntries = '';
		entries.split(/\r?\n/).forEach(element => {
			if (element.includes(basename(_uri.fsPath)) === false) {
				newEntries = newEntries.concat(element + '\n');
			}
		});

		await this.writeCvsEntries(dirname(_uri.fsPath) + '/CVS/Entries.out', newEntries);		 
		await fsPromises.rename(dirname(_uri.fsPath) + '/CVS/Entries', dirname(_uri.fsPath) + '/CVS/Entries.bak');
		await fsPromises.rename(dirname(_uri.fsPath) + '/CVS/Entries.out', dirname(_uri.fsPath) + '/CVS/Entries');		
		await fsPromises.unlink(dirname(_uri.fsPath) + '/CVS/Entries.bak');
	}

	async ignoreFolder(uri: Uri): Promise<void>  {
		await this.configManager.updateIgnoreFolders(workspace.asRelativePath(uri, false));
	}

	async checkoutFolder(uri: Uri, isRecursive: boolean=true): Promise<void>  {
		// 1. make folder
		const fs = require('fs/promises');
		await fs.mkdir(uri.fsPath);

		// 2. cvs add folder
		await this.addFile(uri);

		// 3. cvs update folder
		if (isRecursive){
			await execCmd(`cvs update -d `, uri.fsPath);
		} else {
			await execCmd(`cvs update `, uri.fsPath);
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

	dispose() {
		this.cvsScm.dispose();
	}
}