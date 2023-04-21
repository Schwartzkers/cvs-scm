import * as vscode from 'vscode';
import { basename } from 'path';
import { CvsSourceControl, onResouresLocked, onResouresUnlocked } from './cvsSourceControl';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';
import { CVS_SCHEME, CVS_SCHEME_COMPARE } from './cvsRepository';
import { ConfigManager} from './configManager';
import { CvsRevisionProvider, CommitData } from './cvsRevisionProvider';
import { CvsCompareContentProvider } from './cvsCompareContentProvider';
import { CvsFileBranchesProvider, FileBranchData } from './cvsFileBranchesProvider';
import { CvsBranchProvider, BranchData } from './cvsBranchProvider';
import { FileHistoryController } from './fileHistoryController';
import { FileBranchesController } from './fileBranchesController';
import { BranchesController } from './branchesController';
import { StatusBarController } from './statusBarController';

export let cvsDocumentContentProvider: CvsDocumentContentProvider;
export let configManager: ConfigManager;
let fileHistoryProvider: CvsRevisionProvider;
let fileHistoryTree: vscode.TreeView<CommitData>;
let fileHistoryController: FileHistoryController;
let fileBranchesProvider: CvsFileBranchesProvider;
let branchesProvider: CvsBranchProvider;
let fileBranchesTree:  vscode.TreeView<FileBranchData>;
let branchesTree:  vscode.TreeView<BranchData>;
let fileBranchesController: FileBranchesController;
let branchesController: BranchesController;
let cvsCompareProvider: CvsCompareContentProvider;
let statusBarItem: vscode.StatusBarItem;
let statusBarController: StatusBarController;
export let cvsCommandLog: vscode.LogOutputChannel;

export const cvsSourceControlRegister = new Map<vscode.Uri, CvsSourceControl>();

export function activate(context: vscode.ExtensionContext) {
	
	console.log('"cvs-scm" is now active');

	cvsCommandLog = vscode.window.createOutputChannel('CVS', {log: true});

	//vscode.window.showInformationMessage(`Ensure CVS client can connect/login to CVS Server before using CVS extension`);

	cvsDocumentContentProvider = new CvsDocumentContentProvider();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(CVS_SCHEME, cvsDocumentContentProvider));

	configManager = new ConfigManager();
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => configManager.configurationChange(event), context.subscriptions));
	
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarController = new StatusBarController(statusBarItem, true);
	context.subscriptions.push(statusBarItem);
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => statusBarController.updateRequest(), context.subscriptions));
	context.subscriptions.push(onResouresLocked.event(uri => statusBarController.lockEvent(uri), context.subscriptions));
	context.subscriptions.push(onResouresUnlocked.event(uri => statusBarController.unlockEvent(uri), context.subscriptions));

	cvsCompareProvider = new CvsCompareContentProvider();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(CVS_SCHEME_COMPARE, cvsCompareProvider));

	fileHistoryProvider = new CvsRevisionProvider(configManager.getFileHistoryEnableFlag());
	fileHistoryTree = vscode.window.createTreeView('cvs-file-revisions', { treeDataProvider: fileHistoryProvider, canSelectMany: false} );
	fileHistoryController =  new FileHistoryController(fileHistoryProvider, fileHistoryTree, configManager.getFileHistoryEnableFlag());
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => fileHistoryController.updateRequest(), context.subscriptions));
	context.subscriptions.push(fileHistoryTree.onDidChangeVisibility(() => fileHistoryController.updateRequest(), context.subscriptions));
	context.subscriptions.push(onResouresLocked.event(uri => fileHistoryController.lockEvent(uri), context.subscriptions));
	context.subscriptions.push(onResouresUnlocked.event(uri => fileHistoryController.unlockEvent(uri), context.subscriptions));

	fileBranchesProvider = new CvsFileBranchesProvider(configManager.getBranchesEnableFlag());
	fileBranchesTree = vscode.window.createTreeView('cvs-file-branches', { treeDataProvider: fileBranchesProvider, canSelectMany: false} );
	fileBranchesController = new FileBranchesController(fileBranchesProvider, fileBranchesTree, configManager.getBranchesEnableFlag());
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => fileBranchesController.updateRequest(), context.subscriptions));
	context.subscriptions.push(fileBranchesTree.onDidChangeVisibility(() => fileBranchesController.updateRequest(), context.subscriptions));
	context.subscriptions.push(onResouresLocked.event(uri => fileBranchesController.lockEvent(uri), context.subscriptions));
	context.subscriptions.push(onResouresUnlocked.event(uri => fileBranchesController.unlockEvent(uri), context.subscriptions));

	branchesProvider = new CvsBranchProvider(configManager.getBranchesEnableFlag());
	branchesTree = vscode.window.createTreeView('cvs-branches', { treeDataProvider: branchesProvider, canSelectMany: false} );
	branchesController = new BranchesController(branchesProvider, branchesTree, configManager.getBranchesEnableFlag());
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => branchesController.updateRequest(), context.subscriptions));
	context.subscriptions.push(branchesTree.onDidChangeVisibility(() => branchesController.updateRequest(), context.subscriptions));
	context.subscriptions.push(onResouresLocked.event(uri => branchesController.lockEvent(uri), context.subscriptions));
	context.subscriptions.push(onResouresUnlocked.event(uri => branchesController.unlockEvent(uri), context.subscriptions));

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
						await sourceControl.removeResource(resource.resourceUri);
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
						await sourceControl.recoverResource(resource.resourceUri);
					} else if (resource.contextValue === "removed") {
						await sourceControl.addResource(resource.resourceUri);
						await sourceControl.recoverResource(resource.resourceUri);
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
					await sourceControl.addResource(resource.resourceUri);
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
						await sourceControl.addResource(resource.resourceUri);
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
						await sourceControl.removeResource(resource.resourceUri);
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
				// TODO lock resources until updates are done?
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
							await sourceControl.revertFile(resource.resourceUri);
						} else if (resource.contextValue === 'added') {
							await sourceControl.undoAdd(resource.resourceUri);
						} else if (resource.contextValue === 'removed') {
							await sourceControl.addResource(resource.resourceUri);
						} else if (resource.contextValue === 'deleted') {
							await sourceControl.recoverResource(resource.resourceUri);
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
							await sourceControl.checkoutFolder(resource.resourceUri);
						} else if (resource.contextValue === 'removedFromRepo' ||
								   resource.contextValue === 'checkout' ||
								   resource.contextValue === 'patch' ||
								   resource.contextValue === 'merge') {
							await sourceControl.mergeLatest(resource.resourceUri);
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

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.switch-file-to-branch', async (branchData: FileBranchData) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to switch the file to branch ${branchData.branchName}? All uncommited changes will be lost.`, { modal: true }, `Yes`);
			if (option === `Yes`) {
			const sourceControl = findSourceControl(branchData.uri);
			
			if (sourceControl) {
				sourceControl.switchFileToBranch(branchData);
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.checkout-branch', async (branchData: FileBranchData) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to switch the workspace to branch ${branchData.branchName}? All uncommited changes will be lost.`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(branchData.uri);
			
			if (sourceControl) {
				branchesController.setItchy();
				sourceControl.switchWorkspaceToBranch(branchData);
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.switch-file-to-revision', async (commitData: CommitData) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to switch the working file to revision ${commitData.revision}? All uncommited changes will be lost.`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(commitData.uri);
			
			if (sourceControl) {
				sourceControl.switchFileToRevision(commitData);
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.update-file-to-revision', async (commitData: CommitData) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to replace the contents of the working file with the contents from revision ${commitData.revision}? All uncommited changes will be lost.`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(commitData.uri);
			
			if (sourceControl) {
				sourceControl.revertFileToRevision(commitData);
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.switch-file-to-head', async (commitData: CommitData) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to switch the working file to the head revision? This action will remove all sticky tags and all uncommited changes will be lost.`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(commitData.uri);
			
			if (sourceControl) {
				sourceControl.revertFileToHead(commitData);
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.merge-branch-to-working', async (branchData: FileBranchData) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to merge branch ${branchData.branchName} into the workspace branch? If previously merged the action may have undesired effects. All uncommited changes will be lost.`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(branchData.uri);
			
			if (sourceControl) {
				const sourceFile = await sourceControl.getSourceFile(branchData.uri);
				sourceControl.mergeBranch(sourceFile, branchData);
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('cvs-scm.merge-branch-to-working-file', async (branchData: FileBranchData) => {
		const option = await vscode.window.showWarningMessage(`Are you sure you want to merge branch ${branchData.branchName} into ${basename(branchData.uri.fsPath)}? If previously merged the action may have undesired effects. All uncommited changes will be lost.`, { modal: true }, `Yes`);
		if (option === `Yes`) {
			const sourceControl = findSourceControl(branchData.uri);
			
			if (sourceControl) {
				const sourceFile = await sourceControl.getSourceFile(branchData.uri);
				sourceControl.mergeBranchToFile(sourceFile, branchData);
			}
		}
	}));

	vscode.commands.executeCommand('setContext', 'cvs-scm.enabled', true);
}

export function findSourceControl(resource: vscode.Uri): CvsSourceControl | undefined  {
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
export function deactivate() {
	vscode.commands.executeCommand('setContext', 'cvs-scm.enabled', false);
}
