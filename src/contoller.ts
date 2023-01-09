import { Uri, workspace, TreeView, window, TextEditor } from "vscode";
import { CvsBranchProvider, BranchData } from './cvsBranchProvider';
import { findSourceControl } from './extension';


export class Controller {
    readonly _isEnabled: boolean = false;
    private _timer?: NodeJS.Timer;
    readonly _lockedWorkspaces: Uri[] = [];

    constructor(isEnabled: boolean) {
        this._isEnabled = isEnabled;
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

            this.update();
        } else {
            console.log('workspace not found');
        }
    }

    async updateRequest(): Promise<void> {
        if (!this._isEnabled) { return; }
    
        if (this._timer) {
            clearTimeout(this._timer);
        }
    
        this._timer = setTimeout(() => this.update(), 250);
    }

    protected async update(): Promise<void> {}
}