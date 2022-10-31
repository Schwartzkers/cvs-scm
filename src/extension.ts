import * as vscode from 'vscode';
import * as path from 'path';
import { CvsSourceControl } from './cvsSourceControl';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';
import { CVS_SCHEME } from './cvsRepository';
import { ConfigManager} from './configManager';

let cvsDocumentContentProvider: CvsDocumentContentProvider;
let configManager: ConfigManager;
const cvsSourceControlRegister = new Map<vscode.Uri, CvsSourceControl>();

export function activate(context: vscode.ExtensionContext) {
	
	console.log('"cvs-scm" is now active');

	cvsDocumentContentProvider = new CvsDocumentContentProvider();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(CVS_SCHEME, cvsDocumentContentProvider));

	configManager = new ConfigManager(context);

	initializeWorkspaceFolders(context);

	cvsSourceControlRegister.forEach(sourceControl => {
		sourceControl.getCvsState();
	});

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.refresh', async (sourceControlPane: vscode.SourceControl) => {
		// check CVS repository for local and remote changes
		const sourceControl = await pickSourceControl(sourceControlPane);
		if (sourceControl) { sourceControl.getCvsState(); }
		else { 
			cvsSourceControlRegister.forEach(sourceControl => {
				sourceControl.getCvsState();
			});
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.commit', async (sourceControlPane: vscode.SourceControl) => {
		// commit staged changes
		const sourceControl = await pickSourceControl(sourceControlPane);
		if (sourceControl) { sourceControl.commitAll(); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.stage', async (resource: vscode.SourceControlResourceState) => {
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.stageFile(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.unstage', async (resource: vscode.SourceControlResourceState) => {
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.unstageFile(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.stage-all', async (sourceControlResourceGroup: vscode.SourceControlResourceGroup) => {
		if (sourceControlResourceGroup.resourceStates.length > 0) {
			const sourceControl = findSourceControl(sourceControlResourceGroup.resourceStates[0].resourceUri);
			if (sourceControl) { sourceControl.stageAll(); }
		}		
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.unstage-all', async (sourceControlResourceGroup: vscode.SourceControlResourceGroup) => {
		if (sourceControlResourceGroup.resourceStates.length > 0) {
			const sourceControl = findSourceControl(sourceControlResourceGroup.resourceStates[0].resourceUri);
			if (sourceControl) { sourceControl.unstageAll(); }
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.discard', async (resource: vscode.SourceControlResourceState) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to discard Changes?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resource.resourceUri);
			if (sourceControl) { sourceControl.revertFile(resource.resourceUri); }
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.force-revert', async (resource: vscode.SourceControlResourceState) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to discard merge and revert to HEAD?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resource.resourceUri);
		 	if (sourceControl) { sourceControl.forceRevert(resource.resourceUri); }
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.add', async (resource: vscode.SourceControlResourceState) => {
		// slect file to be added to repo on next commit
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.addFile(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.add-folder', async (resource: vscode.SourceControlResourceState) => {		
		const option = await vscode.window.showWarningMessage(`Are you sure you want to add the folder to repository?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resource.resourceUri);
	 		if (sourceControl) { sourceControl.addFile(resource.resourceUri); }
		}	
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.undo-add', async (resource: vscode.SourceControlResourceState) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to discard changes?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resource.resourceUri);
	 		if (sourceControl) { sourceControl.undoAdd(resource.resourceUri); }
		}		
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.delete', async (resource: vscode.SourceControlResourceState) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to delete?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resource.resourceUri);
	 		if (sourceControl) { sourceControl.deleteUri(resource.resourceUri); }
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.restore', async (resource: vscode.SourceControlResourceState) => {
		// restore deleted source file
		const sourceControl = findSourceControl(resource.resourceUri);
	 	if (sourceControl) { sourceControl.recoverDeletedFile(resource.resourceUri); }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.remove', async (resource: vscode.SourceControlResourceState) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to select file for removal from repository?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resource.resourceUri);
			if (sourceControl) { sourceControl.removeFileFromCvs(resource.resourceUri); }
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.undo-remove', async (resource: vscode.SourceControlResourceState) => {
		// undo the removal of a file
		const sourceControl = findSourceControl(resource.resourceUri);
		if (sourceControl) { 
			await sourceControl.addFile(resource.resourceUri);
			await sourceControl.recoverDeletedFile(resource.resourceUri);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.merge-latest', async (resource: vscode.SourceControlResourceState) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to merge the latest changes from repository?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resource.resourceUri);
			if (sourceControl) { sourceControl.mergeLatest(resource.resourceUri); }
		}
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

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.ignore-folder', async (resource: vscode.SourceControlResourceState) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to ignore folder from cvs update?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resource.resourceUri);
			if (sourceControl) { sourceControl.ignoreFolder(resource.resourceUri); }
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.checkout-folder', async (resource: vscode.SourceControlResourceState) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to checkout the folder and its contents?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resource.resourceUri);
			if (sourceControl) { sourceControl.checkoutFolder(resource.resourceUri); }
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.discard-all', async (sourceControlResourceGroup: vscode.SourceControlResourceGroup) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to discard all changes?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			if (sourceControlResourceGroup.resourceStates.length > 0) {
				const sourceControl = findSourceControl(sourceControlResourceGroup.resourceStates[0].resourceUri);
				
				if (sourceControl) {
					sourceControlResourceGroup.resourceStates.forEach(resourceState => {
						if (resourceState.contextValue === 'modified') {
							sourceControl.revertFile(resourceState.resourceUri);
						} else if (resourceState.contextValue === 'added') {
							sourceControl.undoAdd(resourceState.resourceUri);
						} else if (resourceState.contextValue === 'removed') {
							sourceControl.addFile(resourceState.resourceUri);
						} 
					});
				}
			}
		}
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
	const cvsSourceControl = new CvsSourceControl(context, folder.uri, cvsDocumentContentProvider, configManager);
	registerCvsSourceControl(cvsSourceControl, context);
}

function registerCvsSourceControl(cvsSourceControl: CvsSourceControl, context: vscode.ExtensionContext) {
	cvsSourceControlRegister.set(cvsSourceControl.getWorkspaceFolder(), cvsSourceControl);
	context.subscriptions.push(cvsSourceControl);
}

// this method is called when your extension is deactivated
export function deactivate() {}
