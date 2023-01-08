import { Uri, workspace, TreeView, window, TextEditor } from "vscode";
import { CvsRevisionProvider, CommitData } from './cvsRevisionProvider';
import { findSourceControl } from './extension';


export class FileHistoryController {
    private _isEnabled: boolean = false;
    private _fileHistoryProvider: CvsRevisionProvider;
    private _fileHistoryTree: TreeView<CommitData>;
    private _fileHistoryTimeout?: NodeJS.Timer;
    private _displayedFile?: Uri;
    private _lockedWorkspaces: Uri[] = [];

    constructor(fileHistoryProvider: CvsRevisionProvider, fileHistoryTree: TreeView<CommitData>, isEnabled: boolean) {
        this._isEnabled = isEnabled;
        this._fileHistoryProvider = fileHistoryProvider;
        this._fileHistoryTree = fileHistoryTree;
        if (!isEnabled) {
            this._fileHistoryTree.message = 'Enable view in CVS settings.';
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

            this.requestToUpdateFileHistory();
        } else {
            console.log('workspace not found');
        }
    }

    async updateFileHistoryTree(): Promise<void> {
        console.log('updateFileHistoryTree');
        if (!this._isEnabled) { return; }
    
        if (this._fileHistoryTimeout) {
            clearTimeout(this._fileHistoryTimeout);
        }
    
        this._fileHistoryTimeout = setTimeout(() => this.requestToUpdateFileHistory(), 250);
    }

    private requestToUpdateFileHistory() {
        if (!this._fileHistoryTree.visible) {
            this._fileHistoryTree.description = '';
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
                    // FIX ME: don't update again if already displayed
                    const resource = workspace.asRelativePath(editor.document.uri, false); 
                    this._fileHistoryTree.message = '';
                    this._fileHistoryTree.description = resource;
                    this._fileHistoryProvider.refresh();
                } else {
                    this._fileHistoryProvider.refresh();
                    this._fileHistoryTree.description = '';
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