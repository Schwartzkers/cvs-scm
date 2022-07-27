import * as vscode from 'vscode';
import { CvsRepository } from './cvsRepository';
import * as path from 'path';


export class CvsSourceControl implements vscode.Disposable {
	private cvsScm: vscode.SourceControl;
	private changedResources: vscode.SourceControlResourceGroup;
	private cvsRepository: CvsRepository;
	private latestFiddleVersion: number = Number.POSITIVE_INFINITY; // until actual value is established
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

		//const fileSystemWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, "*.*"));
		// fileSystemWatcher.onDidChange(uri => this.onResourceChange(uri), context.subscriptions);
		// fileSystemWatcher.onDidCreate(uri => this.onResourceChange(uri), context.subscriptions);
		// fileSystemWatcher.onDidDelete(uri => this.onResourceChange(uri), context.subscriptions);

		context.subscriptions.push(this.cvsScm);
		//context.subscriptions.push(fileSystemWatcher);

	}

    getResourceStates(): vscode.SourceControlResourceGroup{
        return this.changedResources;
    }

    addResource(file: vscode.Uri): void {
        const resourceState: vscode.SourceControlResourceState = {
			resourceUri: file};
        
        console.log('addResource: ', file);
        this.changedResources.resourceStates.push(resourceState);		
    }

    dispose() {
		this.cvsScm.dispose();
	}
}