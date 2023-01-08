import { Uri, workspace, TreeView, window, TextEditor } from "vscode";
import { CvsBranchProvider, BranchData } from './cvsBranchProvider';
import { findSourceControl } from './extension';


export class BranchesController {
    private _isEnabled: boolean = false;
    private _branchesProvider: CvsBranchProvider;
    private _branchesTree: TreeView<BranchData>;
    private _branchesTimeout?: NodeJS.Timer;
    private _displayedFile?: Uri;
    private _lockedWorkspaces: Uri[] = [];

    constructor(branchesProvider: CvsBranchProvider, branchesTree: TreeView<BranchData>, isEnabled: boolean) {
        this._isEnabled = isEnabled;
        this._branchesProvider = branchesProvider;
        this._branchesTree = branchesTree;
        if (!isEnabled) {
            this._branchesTree.message = 'Enable view in CVS settings.';
        }
    }

    lockEvent(workspaceUri: Uri): void {
        if (this._lockedWorkspaces.findIndex(uri => uri.fsPath  === workspaceUri.fsPath) === -1) {
            this._lockedWorkspaces.push(workspaceUri);
            console.log('locked: ' + workspaceUri.fsPath);
        } else {
            console.log('workspace already locked');
        }
    }

    unlockEvent(workspaceUri: Uri): void {
        const locked = this._lockedWorkspaces.findIndex(uri => uri.fsPath  === workspaceUri.fsPath);
        if (locked !== -1) {
            this._lockedWorkspaces.splice(locked, 1);
            console.log('unlocked: ' + workspaceUri.fsPath);

            this.requestToUpdateBranches();
        } else {
            console.log('workspace not found');
        }
    }

    async updateBranchesTree(): Promise<void> {
        if (!this._isEnabled) { return; }
    
        if (this._branchesTimeout) {
            clearTimeout(this._branchesTimeout);
        }
    
        this._branchesTimeout = setTimeout(() => this.requestToUpdateBranches(), 250);
    }

    private requestToUpdateBranches() {
        if (!this._branchesTree.visible) {
            this._branchesTree.description = '';
            return;
        }
    
        const editor = window.activeTextEditor;
        if (editor) {
            // check if workspace is locked
            const workspaceFolder = workspace.getWorkspaceFolder(editor.document.uri);
            if (workspaceFolder && this._lockedWorkspaces.findIndex(uri => uri.fsPath  === workspaceFolder.uri.fsPath) !== -1) {
                console.log('workspace is currently locked');
                return;
            } else if (editor.document.uri.scheme !== 'file') {
                return;
            } else {
                const sourceControl = findSourceControl(editor.document.uri);
                    
                if (sourceControl) {
                    // don't update again if already displayed
                    const resource = workspace.asRelativePath(editor.document.uri, false); 
                    this._branchesProvider.refresh();
                    this._branchesTree.description = resource;
                    this._branchesTree.message = '';
                } else {
                    this._branchesProvider.refresh();
                    this._branchesTree.description = '';
                    this._branchesTree.message = 'The active editor is not part of any of the workspace folders. Unable to provide branch information.';
                }
            }
        } else {
            this._branchesProvider.refresh();
            this._branchesTree.description = '';
            this._branchesTree.message = 'There are no editors open that can provide branch information.';
        }
    }
}