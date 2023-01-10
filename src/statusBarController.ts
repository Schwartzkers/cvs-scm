import { workspace, window, StatusBarItem } from "vscode";
import { findSourceControl } from './extension';
import { Controller } from './contoller';


export class StatusBarController extends Controller {
    private _statusBarItem: StatusBarItem;

    constructor(statusBarItem: StatusBarItem, isEnabled: boolean) {
        super(isEnabled);
        this._statusBarItem = statusBarItem;
    }

    protected async update(): Promise<void> {
        const textEditor = window.activeTextEditor;
        if (textEditor) {
            const workspaceFolder = workspace.getWorkspaceFolder(textEditor.document.uri);
            if (workspaceFolder && this._lockedWorkspaces.findIndex(uri => uri.fsPath  === workspaceFolder.uri.fsPath) !== -1) {
                //console.log('workspace is currently locked');
                return;
            } else 
            if (textEditor.document.uri.scheme !== 'file') {
                return;
            } else {
                const sourceControl = findSourceControl(textEditor.document.uri);
                    
                if (sourceControl) {
                    const sourceFile = await sourceControl.getSourceFile(textEditor.document.uri);
                
                    if (sourceFile.branch && sourceFile.workingRevision) {
                        this._statusBarItem.text = `$(source-control-view-icon) ${sourceFile.branch}: ${sourceFile.workingRevision}`;
                        this._statusBarItem.show();
                    }
                    else {
                        this._statusBarItem.hide();
                    }
                }
                else {
                    this._statusBarItem.hide();
                }
            }
        } else {
            this._statusBarItem.hide();
        }
    }
}