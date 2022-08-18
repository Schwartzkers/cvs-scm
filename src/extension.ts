import * as vscode from 'vscode';
import * as path from 'path';
import { CvsSourceControl } from './cvsSourceControl';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';
import { CVS_SCHEME } from './cvsRepository';

let cvsDocumentContentProvider: CvsDocumentContentProvider;

export function activate(context: vscode.ExtensionContext) {
	
	console.log('"cvs-ext" is now active');

	const rootPath =
	vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
	  ? vscode.workspace.workspaceFolders[0].uri
	  : vscode.Uri.parse('empty');

	console.log(rootPath);

	cvsDocumentContentProvider = new CvsDocumentContentProvider();
	const cvsSCM = new CvsSourceControl(context, rootPath, cvsDocumentContentProvider);
	cvsSCM.getCvsState();

	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(CVS_SCHEME, cvsDocumentContentProvider));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.refresh', () => {
		vscode.window.showInformationMessage('Refresh CVS repository');
		cvsSCM.getCvsState();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.commit-all', () => {
		vscode.window.showInformationMessage('Commit all changed files');
		cvsSCM.commitAll();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.commit-file', (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Commit file');
		cvsSCM.commitFile(resource.resourceUri);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.revert', (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Revert file');
		cvsSCM.revertFile(resource.resourceUri);		
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.force-revert', (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Revert file');
		cvsSCM.forceRevert(resource.resourceUri);		
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.add', (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Add resource to CVS repository');
		cvsSCM.addFile(resource.resourceUri);		
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.undo-add', (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Undo add to CVS repository');
		cvsSCM.undoAdd(resource.resourceUri);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.delete-file', (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Delete fIle');
		cvsSCM.deleteFile(resource.resourceUri);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.recover', (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Recover deleted file');
		cvsSCM.recoverLostFile(resource.resourceUri);		
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.remove-file', (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Remove file from CVS repository');
		cvsSCM.removeFileFromCvs(resource.resourceUri);		
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.undo-remove', (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Undo remove of file');
		cvsSCM.addFile(resource.resourceUri);		
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-ext.merge-latest', (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Merge latest changes from repository');
		cvsSCM.mergeLatest(resource.resourceUri);		
	}));
}

// this method is called when your extension is deactivated
export function deactivate() {}
