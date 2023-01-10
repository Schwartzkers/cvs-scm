import { workspace, TreeView, window } from "vscode";
import { CvsBranchProvider, BranchData } from './cvsBranchProvider';
import { findSourceControl } from './extension';
import { Controller } from './contoller';


export class BranchesController extends Controller {
    private _branchesProvider: CvsBranchProvider;
    private _branchesTree: TreeView<BranchData>;

    constructor(branchesProvider: CvsBranchProvider, branchesTree: TreeView<BranchData>, isEnabled: boolean) {
        super(isEnabled);
        this._branchesProvider = branchesProvider;
        this._branchesTree = branchesTree;
        if (!isEnabled) {
            this._branchesTree.message = 'Enable view in CVS settings.';
        }
    }

    protected async update(): Promise<void> {
        if (!this._branchesTree.visible) {
            this._branchesTree.description = '';
            return;
        }
    
        const editor = window.activeTextEditor;
        if (editor) {
            // check if workspace is locked
            const workspaceFolder = workspace.getWorkspaceFolder(editor.document.uri);
            if (workspaceFolder && this._lockedWorkspaces.findIndex(uri => uri.fsPath  === workspaceFolder.uri.fsPath) !== -1) {
                //console.log('workspace is currently locked');
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
