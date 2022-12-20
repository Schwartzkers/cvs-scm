import * as vscode from 'vscode';
import { CvsSourceControl } from './cvsSourceControl';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';
import { CVS_SCHEME, CVS_SCHEME_COMPARE } from './cvsRepository';
import { ConfigManager} from './configManager';
import { CvsRevisionProvider, CommitData } from './cvsRevisionProvider';
import { CvsCompareContentProvider } from './cvsCompareContentProvider';
import { SourceFile } from './sourceFile';

export let cvsDocumentContentProvider: CvsDocumentContentProvider;
export let configManager: ConfigManager;
export let fileHistory: CvsRevisionProvider;
let fileHistoryTree: vscode.TreeView<CommitData>;
let cvsCompareProvider: CvsCompareContentProvider;
let revStatusBarItem: vscode.StatusBarItem;
let fileHistoryTimeout: NodeJS.Timer;
let revStatusBarTimeout: NodeJS.Timer;

export const cvsSourceControlRegister = new Map<vscode.Uri, CvsSourceControl>();

export function activate(context: vscode.ExtensionContext) {
	
	console.log('"cvs-scm" is now active');

	//vscode.window.showInformationMessage(`Ensure CVS client can connect/login to CVS Server before using CVS extension`);

	cvsDocumentContentProvider = new CvsDocumentContentProvider();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(CVS_SCHEME, cvsDocumentContentProvider));

	configManager = new ConfigManager();
	revStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => configManager.configurationChange(event), context.subscriptions));
	context.subscriptions.push(revStatusBarItem);
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(textEditor => updateStatusBarItem(textEditor), context.subscriptions));

	fileHistory = new CvsRevisionProvider(configManager.getFileHistoryEnableFlag());
	fileHistoryTree = vscode.window.createTreeView('cvs-file-revisions', { treeDataProvider: fileHistory, canSelectMany: false} );
	if (configManager.getFileHistoryEnableFlag()) {
		cvsCompareProvider = new CvsCompareContentProvider();

		context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(CVS_SCHEME_COMPARE, cvsCompareProvider));
		context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => updateFileHistory(), context.subscriptions));
		context.subscriptions.push(fileHistoryTree.onDidChangeVisibility(() => updateFileHistory(), context.subscriptions));
	}
	else {
		fileHistoryTree.message = 'Enable view in CVS settings.';
	}

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

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.stage', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const sourceControl = findSourceControl(resourceStates[0].resourceUri);
		if (sourceControl) {
			for (const resource of resourceStates) {
				// can only stage modified, added, removed or deleted resource states
				if (resource.contextValue === "modified" || 
					resource.contextValue === "added" ||
					resource.contextValue === "removed" ||
					resource.contextValue === "deleted") {

					// automatically "cvs remove" any deleted files if staged
					if (resource.contextValue === 'deleted') {
						await sourceControl.removeFileFromCvs(resource.resourceUri);
					}
					sourceControl.stageFile(resource.resourceUri);
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.unstage', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const sourceControl = findSourceControl(resourceStates[0].resourceUri);
	 	if (sourceControl) {
			for (const resource of resourceStates) {
				// can only unstage modified, added, removed resource states
				if (resource.contextValue === "modified" || 
					resource.contextValue === "added" ||
					resource.contextValue === "removed") {

					sourceControl.unstageFile(resource.resourceUri);
				}
			}
		}
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

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.discard', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to discard Changes?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resourceStates[0].resourceUri);
			if (sourceControl) {
				for (const resource of resourceStates) {
					// can only discard modified, added, deleted or removed resource states
					if (resource.contextValue === "modified") {
						await sourceControl.revertFile(resource.resourceUri);
					} else if (resource.contextValue === "added") {
						await sourceControl.undoAdd(resource.resourceUri);
					} else if (resource.contextValue === "deleted") {
						await sourceControl.recoverDeletedFile(resource.resourceUri);
					} else if (resource.contextValue === "removed") {
						await sourceControl.addFile(resource.resourceUri);
						await sourceControl.recoverDeletedFile(resource.resourceUri);
					}
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.force-revert', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to discard merge and revert to HEAD?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resourceStates[0].resourceUri);
		 	if (sourceControl) {
				for (const resource of resourceStates) {
					// can only force-revert conflict resource states
					if (resource.contextValue === "conflict") {
						await sourceControl.forceRevert(resource.resourceUri); }
					}			
				}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.add', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		// select file to be added to repo on next commit
		const sourceControl = findSourceControl(resourceStates[0].resourceUri);
	 	if (sourceControl) {
			for (const resource of resourceStates) {
				// can only add untracked files
				if (resource.contextValue === "untracked_file") {
					await sourceControl.addFile(resource.resourceUri);
				}	
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.add-folder', async (...resourceStates: vscode.SourceControlResourceState[]) => {		
		const option = await vscode.window.showWarningMessage(`Are you sure you want to add the selected folder(s) to the repository?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resourceStates[0].resourceUri);
			if (sourceControl) {
				for (const resource of resourceStates) {
					// can only add-folder for untracked folders 
					if (resource.contextValue === "untracked_folder") {
						await sourceControl.addFile(resource.resourceUri);
					}
				}
			}
		}	
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.delete', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to delete?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resourceStates[0].resourceUri);
	 		if (sourceControl) {
				for (const resource of resourceStates) {
					// can only delete untracked files or folders
					if (resource.contextValue === "untracked_file" || 
						resource.contextValue === "untracked_folder" ) {
						await sourceControl.deleteResource(resource.resourceUri);
					}					
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.remove', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to remove from the repository?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resourceStates[0].resourceUri);
			if (sourceControl) {
				for (const resource of resourceStates) {
					// can only remove deleted files
					if (resource.contextValue === "deleted") {
						await sourceControl.removeFileFromCvs(resource.resourceUri);
					}
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.merge-latest', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to merge the latest changes from the repository for the selected item(s)?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resourceStates[0].resourceUri);
			if (sourceControl) {
				for (const resource of resourceStates) {
					// can only merge the following
					if (resource.contextValue === 'removedFromRepo' ||
						resource.contextValue === 'checkout' ||
						resource.contextValue === 'patch' ||
						resource.contextValue === 'merge') {							
						await sourceControl.mergeLatest(resource.resourceUri);
					}					
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.openFile', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const sourceControl = findSourceControl(resourceStates[0].resourceUri);
		if (sourceControl) { 
			const options: vscode.TextDocumentShowOptions  = {
				preserveFocus: true,
            	preview: false,
			};
			for (const resource of resourceStates) {
				// cannot open the following
				if (resource.contextValue !== 'removed' &&
					resource.contextValue !== 'checkout' &&
					resource.contextValue !== 'deleted' &&
					resource.contextValue !== 'untracked_folder' &&
					resource.contextValue !== 'directory') {
					vscode.commands.executeCommand("vscode.open", resource.resourceUri, options);
				}					
			}
		}		
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(e => {
		e.added.forEach(wf => {
			initializeFolder(wf, context);
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.ignore-folder', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to ignore the selected folder(s) from cvs update?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resourceStates[0].resourceUri);
			if (sourceControl) {
				for (const resource of resourceStates) {
					// can only ignore-folders on a directory
					if (resource.contextValue === 'directory') {
						sourceControl.ignoreFolder(resource.resourceUri);
					}
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.checkout-folder-recursive', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to checkout the selected folder(s) (including subfolders)?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resourceStates[0].resourceUri);
			if (sourceControl) {
				for (const resource of resourceStates) {
					// can only checkout-folder-recursive on a directory
					if (resource.contextValue === 'directory') {
						sourceControl.checkoutFolder(resource.resourceUri);
					}					
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.checkout-folder', async (...resourceStates: vscode.SourceControlResourceState[]) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to checkout the selected folder(s)?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(resourceStates[0].resourceUri);
			if (sourceControl) {
				for (const resource of resourceStates) {
					// can only checkout-folder on a directory
					if (resource.contextValue === 'directory') {
						sourceControl.checkoutFolder(resource.resourceUri, false);
					}
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.discard-all', async (sourceControlResourceGroup: vscode.SourceControlResourceGroup) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to discard all changes?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			if (sourceControlResourceGroup.resourceStates.length > 0) {
				const sourceControl = findSourceControl(sourceControlResourceGroup.resourceStates[0].resourceUri);
				
				if (sourceControl) {
					for (const resource of sourceControlResourceGroup.resourceStates) {
						if (resource.contextValue === 'modified') {
							sourceControl.revertFile(resource.resourceUri);
						} else if (resource.contextValue === 'added') {
							sourceControl.undoAdd(resource.resourceUri);
						} else if (resource.contextValue === 'removed') {
							sourceControl.addFile(resource.resourceUri);
						} else if (resource.contextValue === 'deleted') {
							sourceControl.recoverDeletedFile(resource.resourceUri);
						}
					}
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.merge-all', async (sourceControlResourceGroup: vscode.SourceControlResourceGroup) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to merge all repository changes into the local checkout?`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			if (sourceControlResourceGroup.resourceStates.length > 0) {
				const sourceControl = findSourceControl(sourceControlResourceGroup.resourceStates[0].resourceUri);
				
				if (sourceControl) {
					for (const resource of sourceControlResourceGroup.resourceStates) {
						if (resource.contextValue === 'directory') {
							sourceControl.checkoutFolder(resource.resourceUri);
						} else if (resource.contextValue === 'removedFromRepo' ||
								   resource.contextValue === 'checkout' ||
								   resource.contextValue === 'patch' ||
								   resource.contextValue === 'merge') {
							sourceControl.mergeLatest(resource.resourceUri);
						}
					}
				}
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.compare-to-working', async (commitData: CommitData) => {
		const sourceControl = findSourceControl(commitData.uri);
		
		if (sourceControl) {
			sourceControl.compareRevToWorkingFile(commitData);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.open-revision', async (commitData: CommitData) => {
		const sourceControl = findSourceControl(commitData.uri);
		
		if (sourceControl) {
			sourceControl.openRev(commitData);
		}
	}));

	updateStatusBarItem(vscode.window.activeTextEditor);
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

function requestToUpdateFileHistory() {
	if (!fileHistoryTree.visible) {
		fileHistoryTree.description = '';
		return;
	}

	const editor = vscode.window.activeTextEditor;
	if (editor) {
		if (editor.document.uri.scheme !== 'file') {
			return;
		} else {
			const sourceControl = findSourceControl(editor.document.uri);
				
			if (sourceControl) {
				// don't update again if already displayed
				const resource = vscode.workspace.asRelativePath(editor.document.uri, false); 
				if (fileHistoryTree.description !== resource) {
					fileHistoryTree.message = '';
					fileHistoryTree.description = resource;
					fileHistory.refresh();
				}
			} else {
				fileHistory.refresh();
				fileHistoryTree.description = '';
				fileHistoryTree.message = 'The active editor is not part of any of the workspace folders. Unable to provide file history information.';
			}
		}
	} else {
		fileHistory.refresh();
		fileHistoryTree.description = '';
		fileHistoryTree.message = 'There are no editors open that can provide file history information.';
	}
}

async function updateFileHistory(): Promise<void> {
	if (fileHistoryTimeout) {
		clearTimeout(fileHistoryTimeout);
	}

	fileHistoryTimeout = setTimeout(() => requestToUpdateFileHistory(), 250);
}

async function updateStatusBarItem(textEditor: vscode.TextEditor | undefined): Promise<void> {
	if (textEditor) {
		if (textEditor.document.uri.scheme !== 'file') {
			return;
		} else {
			const sourceControl = findSourceControl(textEditor.document.uri);
				
			if (sourceControl) {
				let sourceFile = new SourceFile(textEditor.document.uri);

				await sourceControl.getCvsStatus(sourceFile);
			
				if (sourceFile.branch && sourceFile.workingRevision) {
					revStatusBarItem.text = `$(source-control-view-icon) ${sourceFile.branch}: ${sourceFile.workingRevision}`;
					revStatusBarItem.show();
				}
				else {
					revStatusBarItem.hide();
				}
			}
			else {
				revStatusBarItem.hide();
			}
		}
	} else {
		if (revStatusBarTimeout) {
			clearTimeout(revStatusBarTimeout);
		}

		revStatusBarTimeout = setTimeout(() => {
			if (vscode.window.activeTextEditor === undefined) {
				revStatusBarItem.hide();
			}
		}, 500);
	}
}

// this method is called when your extension is deactivated
export function deactivate() {}
