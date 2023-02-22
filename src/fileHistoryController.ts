import { workspace, TreeView, window } from "vscode";
import { CvsRevisionProvider, CommitData } from './cvsRevisionProvider';
import { findSourceControl } from './extension';
import { Controller } from './contoller';


export class FileHistoryController extends Controller {
    private _fileHistoryProvider: CvsRevisionProvider;
    private _fileHistoryTree: TreeView<CommitData>;

    constructor(fileHistoryProvider: CvsRevisionProvider, fileHistoryTree: TreeView<CommitData>, isEnabled: boolean) {
        super(isEnabled);
        this._fileHistoryProvider = fileHistoryProvider;
        this._fileHistoryTree = fileHistoryTree;
        if (!isEnabled) {
            this._fileHistoryTree.message = 'Enable view in CVS settings.';
        }
    }

    protected async update(): Promise<void> {
        if (!this._fileHistoryTree.visible) {
            this._fileHistoryTree.description = '';
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
                    // FIX ME: don't update again if already displayed
                    const resource = workspace.asRelativePath(editor.document.uri, false);
                    this._fileHistoryTree.message = undefined;
                    this._fileHistoryTree.description = resource;
                    this._fileHistoryProvider.refresh();
                } else {
                    this._fileHistoryProvider.refresh();
                    this._fileHistoryTree.description = undefined;
                    this._fileHistoryTree.message = 'The active editor is not part of any of the workspace folders. Unable to provide file history information.';
                }
            }
        } else {
            this._fileHistoryProvider.refresh();
            this._fileHistoryTree.description = '';
            this._fileHistoryTree.message = 'There are no editors open that can provide file history information.';
        }
    }
}