import { workspace, TreeView, window, Uri } from "vscode";
import { CvsBranchProvider, BranchData } from './cvsBranchProvider';
import { Controller } from './contoller';
import { basename } from "path";


export class BranchesController extends Controller {
    private _branchesProvider: CvsBranchProvider;
    private _branchesTree: TreeView<BranchData>;
    private _currentWorkspace: Uri | undefined;
    private _itchy: boolean;

    constructor(branchesProvider: CvsBranchProvider, branchesTree: TreeView<BranchData>, isEnabled: boolean) {
        super(isEnabled);
        this._branchesProvider = branchesProvider;
        this._branchesTree = branchesTree;
        this._currentWorkspace = undefined;
        this._itchy = true;
        if (!isEnabled) {
            this._branchesTree.message = 'Enable view in CVS settings.';
        }
    }

    public setItchy() {
        this._itchy = true;
    }

    public getWorkspace(): Uri | undefined {
       return this._currentWorkspace;
    }

    protected async update(): Promise<void> {
        if (!this._branchesTree.visible) {
            this._branchesTree.description = '';
            return;
        }

        // 1. get active workspace
        const editor = window.activeTextEditor;
        let newWorkspace: Uri | undefined = undefined;
        if (editor) {
            newWorkspace = workspace.getWorkspaceFolder(editor.document.uri)?.uri;
        // no active editor
        } else if (workspace.workspaceFolders) { 
            if (this._currentWorkspace === undefined) {
                // get first workspace on boot
                newWorkspace = workspace.workspaceFolders.at(0)?.uri;
            } else {
                // use last known workspace (e.g. all active editors closed)
                newWorkspace = this._currentWorkspace;
            }
        }

        // 2. check if the newWorkspace branches are currently displayed
        if (newWorkspace) {
            if (newWorkspace.fsPath === this._currentWorkspace?.fsPath && this._itchy === false) {
                console.log('workspace has not changed');
                return;
            }
        } else {
            this._itchy = false;
            this._currentWorkspace = undefined;

            this._branchesProvider.refresh(undefined);
            this._branchesTree.description = '';
            this._branchesTree.message = 'There are no workspaces available to provide branch information.';

            return;
        }

        // 3. get branches for newWorkspace
        if (this._lockedWorkspaces.findIndex(uri => uri.fsPath  === newWorkspace?.fsPath) !== -1) {
            // check if workspace is locked
            console.log('workspace is currently locked');
            return;
        } else {
            this._itchy = false;
            this._currentWorkspace = newWorkspace;

            const name = basename(newWorkspace.fsPath);

            this._branchesProvider.refresh(newWorkspace);
            this._branchesTree.description = name;
            this._branchesTree.message = '';
            
        }
    }
}
