import * as vscode from 'vscode';
import { CvsRepository } from './cvsRepository';
import * as path from 'path';


export class CvsSourceControl implements vscode.Disposable {
	private cvsScm: vscode.SourceControl;
	private changedResources: vscode.SourceControlResourceGroup;
	private cvsRepository: CvsRepository;
	//private latestFiddleVersion: number = Number.POSITIVE_INFINITY; // until actual value is established
	//private _onRepositoryChange = new vscode.EventEmitter<Fiddle>();
	private timeout?: NodeJS.Timer;

	//constructor(context: vscode.ExtensionContext, private readonly workspaceFolder: vscode.WorkspaceFolder) {
    constructor(context: vscode.ExtensionContext) {
		this.cvsScm = vscode.scm.createSourceControl('cvs', 'CVS');
		this.changedResources = this.cvsScm.createResourceGroup('workingTree', 'Changes');
		//this.cvsRepository = new CvsRepository(workspaceFolder);
        this.cvsRepository = new CvsRepository();
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


	listen(event: vscode.TextDocumentWillSaveEvent): void {
		console.log(event.document.fileName);
		const changedResources: vscode.SourceControlResourceState[] = [];

		//let oldfile = vscode.Uri.file('/home/jon/workspace/code/cvs-sandbox/cvsdiff');
		let left = this.cvsRepository.getHeadVersion(vscode.Uri.parse(event.document.fileName));
		//let left = vscode.Uri.file('/home/jon/workspace/code/cvs-sandbox/cvsdiff');

		//let left = this.cvsRepository.provideOriginalResource(uri ,null);//('/home/jon/workspace/code/cvs-sandbox/cvsdiff');
		//let right = vscode.Uri.file('/home/jon/workspace/code/cvs-sandbox/README');
		let right = vscode.Uri.parse(event.document.fileName);

		const command: vscode.Command =
		{
			title: "Show changes",
			//command: "cvs-ext.compare",
			command: "vscode.diff",
			arguments: [left, right],
			tooltip: "Diff your changes"
		};

		const resourceState: vscode.SourceControlResourceState = {resourceUri: vscode.Uri.parse(event.document.fileName), command: command, contextValue: 'diffable'};
		changedResources.push(resourceState);
		//this.changedResources.resourceStates = this.changedResources.resourceStates.concat(changedResources);
		this.changedResources.resourceStates = changedResources;
	}

	// getResources(): void {
	// 	let cvsCMd = `cvs -n -q update`;	
	// }


    dispose() {
		this.cvsScm.dispose();
	}
}