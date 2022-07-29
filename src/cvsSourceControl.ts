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
		
        this.cvsRepository = new CvsRepository(this.rootPath);
		this.cvsScm.quickDiffProvider = this.cvsRepository;
		this.cvsScm.inputBox.placeholder = 'cvs commit message';

		// start listening
		const fileWatcher = vscode.workspace.onWillSaveTextDocument(e => this.listen(e), context.subscriptions);

		//const fileSystemWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, "*.*"));
		// fileSystemWatcher.onDidChange(uri => this.onResourceChange(uri), context.subscriptions);
		// fileSystemWatcher.onDidCreate(uri => this.onResourceChange(uri), context.subscriptions);
		// fileSystemWatcher.onDidDelete(uri => this.onResourceChange(uri), context.subscriptions);

		context.subscriptions.push(this.cvsScm);
		context.subscriptions.push(fileWatcher);
	}


	async listen(event: vscode.TextDocumentWillSaveEvent): Promise<void> {
		console.log(event.document.fileName);

		let left = this.cvsRepository.getHeadVersion(vscode.Uri.parse(event.document.fileName));
		let right = vscode.Uri.parse(event.document.fileName);

		const command: vscode.Command =
		{
			title: "Show changes",
			command: "vscode.diff",
			arguments: [left, right],
			tooltip: "Diff your changes"
		};

		const changedResources: vscode.SourceControlResourceState[] = [];
		let result = await this.cvsRepository.getResources();
		this.cvsRepository.parseResources(result);

		
		this.cvsRepository.getRes().forEach(element => {
			const resourceState: vscode.SourceControlResourceState = {resourceUri: element, command: command, contextValue: 'diffable'};
			changedResources.push(resourceState);
			console.log('push');
		});
		
		this.changedResources.resourceStates = changedResources;
	}

    dispose() {
		this.cvsScm.dispose();
	}
}