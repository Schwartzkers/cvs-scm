import * as vscode from 'vscode';
import * as path from 'path';
import { CvsSourceControl } from './cvsSourceControl';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';
import { CVS_SCHEME } from './cvsRepository';

let cvsDocumentContentProvider: CvsDocumentContentProvider;
const cvsSourceControlRegister = new Map<vscode.Uri, CvsSourceControl>();

export function activate(context: vscode.ExtensionContext) {
	
	console.log('"cvs-scm" is now active');

	cvsDocumentContentProvider = new CvsDocumentContentProvider();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(CVS_SCHEME, cvsDocumentContentProvider));

	initializeWorkspaceFolders(context);

	cvsSourceControlRegister.forEach(sourceControl => {
		sourceControl.getCvsState();
		//console.log(sourceControl.getWorkspaceFolder());
	});

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.refresh', async (sourceControlPane: vscode.SourceControl) => {
		vscode.window.showInformationMessage('Refresh CVS repository');
		const sourceControl = await pickSourceControl(sourceControlPane);
		if (sourceControl) { sourceControl.getCvsState(); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.commit-all', async (sourceControlPane: vscode.SourceControl) => {
		vscode.window.showInformationMessage('Commit all changed files');
		const sourceControl = await pickSourceControl(sourceControlPane);
		if (sourceControl) { sourceControl.commitAll(); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.commit-file', async (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Commit file');
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.commitFile(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.revert', async (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Revert file');
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.revertFile(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.force-revert', async (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Revert file');
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.forceRevert(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.add', async (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Add resource to CVS repository');
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.addFile(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.undo-add', async (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Undo add to CVS repository');
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.undoAdd(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.delete-file', async (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Delete fIle');
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.deleteFile(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.recover', async (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Recover deleted file');
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.recoverDeletedFile(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.remove-file', async (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Remove file from CVS repository');
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.removeFileFromCvs(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.undo-remove', async (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Undo remove of file');
		const sourceControl = findSourceControl(resource.resourceUri);
		if (sourceControl) { sourceControl.addFile(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.merge-latest', async (resource: vscode.SourceControlResourceState) => {
		vscode.window.showInformationMessage('Merge latest changes from repository');
		const sourceControl = findSourceControl(resource.resourceUri);
		if (sourceControl) { sourceControl.mergeLatest(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.openFile', async (resource: vscode.SourceControlResourceState) => {
		const sourceControl = findSourceControl(resource.resourceUri);
		if (sourceControl) { vscode.commands.executeCommand("vscode.open", resource.resourceUri); }		
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(e => {
		e.added.forEach(wf => {
			initializeFolder(wf, context);
		});
	}));
}

function findSourceControl(resource: vscode.Uri): CvsSourceControl | undefined  {
	for (const uri of cvsSourceControlRegister.keys()) {
		if (resource.fsPath.includes(uri.fsPath)) {
			return cvsSourceControlRegister.get(uri);
		}	
	}

	return undefined;
}

async function pickSourceControl(sourceControlPane: vscode.SourceControl): Promise<CvsSourceControl | undefined> {
	if (sourceControlPane && sourceControlPane.rootUri) {
		return cvsSourceControlRegister.get(sourceControlPane.rootUri);
	}

	if (cvsSourceControlRegister.size === 0) { return undefined; }
	else if (cvsSourceControlRegister.size === 1) { return [...cvsSourceControlRegister.values()][0]; }
	else { return undefined; }
}

async function initializeWorkspaceFolders(context: vscode.ExtensionContext): Promise<void> {
	if (!vscode.workspace.workspaceFolders) { return; }

	const folderPromises = vscode.workspace.workspaceFolders.map(async (folder) => await initializeFolder(folder, context));
	await Promise.all(folderPromises);
}

async function initializeFolder(folder: vscode.WorkspaceFolder, context: vscode.ExtensionContext): Promise<void> {
	const cvsSourceControl = new CvsSourceControl(context, folder.uri, cvsDocumentContentProvider);
	registerFiddleSourceControl(cvsSourceControl, context);
}

function registerFiddleSourceControl(cvsSourceControl: CvsSourceControl, context: vscode.ExtensionContext) {
	cvsSourceControlRegister.set(cvsSourceControl.getWorkspaceFolder(), cvsSourceControl);
	context.subscriptions.push(cvsSourceControl);
}

// this method is called when your extension is deactivated
export function deactivate() {}
