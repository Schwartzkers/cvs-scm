import { Uri, TreeItem, TreeDataProvider, TreeItemCollapsibleState, window, ThemeIcon, EventEmitter, Event, Command, workspace, TreeItemLabel } from 'vscode';
import { basename, dirname } from 'path';
import { spawnCmd } from './utility';
import { EOL } from 'os';
import { CVS_SCHEME_COMPARE } from './cvsRepository';
import { SourceFile, SourceFileState } from './sourceFile';
import { findSourceControl } from "./extension";

export class CvsBranchProvider implements TreeDataProvider<BranchData> {
    private _onDidChangeTreeData: EventEmitter<BranchData | undefined | null | void> = new EventEmitter<BranchData | undefined | null | void>();
    readonly onDidChangeTreeData: Event<BranchData | undefined | null | void> = this._onDidChangeTreeData.event;
    private _enabled: boolean = false;
    private _startup: boolean = true;
    
    constructor(enabled: boolean) { 
        this._enabled = enabled;
    }

    refresh(): any {
        this._onDidChangeTreeData.fire(undefined);
      }

    getTreeItem(element: BranchData): TreeItem {
      return element;
    }

    getChildren(element?: BranchData): Thenable<BranchData[]> {
        if (!this._enabled || element || this._startup) {  // there are no children with children in this tree
            this._startup = false; // ignore on startup because it will be refreshed by seperate event on boot
            return Promise.resolve([]);
        }
        const textEditor = window.activeTextEditor;

        if (textEditor) {
            if (workspace.getWorkspaceFolder(textEditor.document.uri)) {
                return Promise.resolve(this.getDeps(textEditor.document.uri));
            } else {
                return Promise.resolve([]);
            }
        }

        return Promise.reject();
    }

    async getDeps(uri: Uri): Promise<BranchData[]> {
        const sourceFile = await findSourceControl(uri)?.getSourceFile(uri);

        let branchData: BranchData[] = [];

        if (sourceFile) {
            // no logs for added or untracked
            if (sourceFile.state === SourceFileState.untracked ||
                sourceFile.state === SourceFileState.added) {
                    return branchData;
            }

            if (sourceFile.branches) {
                return sourceFile.branches;
            }
            else {
                const log = await this.readCvsLog(uri);
                const branches = await this.getBranches(log);
        
                branchData.push(new BranchData('main', uri, sourceFile.branch === 'main'));
        
                branches.forEach(element => {
                    branchData.push(new BranchData(element, uri, sourceFile.branch === element));
                });

                sourceFile.branches = branchData;
            }
        }

        return branchData;
    }

    async readCvsLog(uri: Uri): Promise<string> {
        const cvsCmd = `cvs log -h ${basename(uri.fsPath)}`;
        const result = await spawnCmd(cvsCmd, dirname(uri.fsPath));
        
        if (!result.result || result.output.length === 0) {
            window.showErrorMessage(`Failed to obtain cvs log for resource: ${basename(uri.fsPath)}`);
            return "";
        }

        return result.output;
    }

    async getBranches(log: string): Promise<string[]> {
        let branches: string[] = [];
        const branchPromises = log.split(EOL).map(async (line) => {
            let branch = line.match(/^\t.+:\s\d+\..*\.0\.\d+$/)?.[0]; //element.search(/^\t.*0.{2}$/) !== -1
            if (branch) {
                branches.push(branch.substring(0,branch.indexOf(':')).trim());
            }
        });
        await Promise.all(branchPromises);
        
        return branches;
    }
}


export class BranchData extends TreeItem {
    constructor(
        public readonly branchName: string,
        public readonly uri: Uri,
        public readonly isActive: boolean
    ) {
        let label: any;
        if (isActive) {
            label = {label: branchName, highlights: [[0,branchName.length]]};
        } else {
            label = branchName;
        }

        super(label, TreeItemCollapsibleState.None);
        this.tooltip = branchName;
        this.iconPath = new ThemeIcon("git-branch");
        this.contextValue = "branch";
        this.id = this.branchName;
        this.resourceUri = uri;

        const left = Uri.parse(`${CVS_SCHEME_COMPARE}:${this.resourceUri.fsPath}__rev_${this.branchName}`);
        const right = this.resourceUri;

        const command: Command =
        {
            title: "File History",
            command: "vscode.diff",
            arguments: [left, right, `${basename(this.resourceUri.fsPath)} (${this.branchName}) <-> (working})`],
        };
        this.command = command;
    }
}
