import { Uri, TreeItem, TreeDataProvider, TreeItemCollapsibleState, window, ThemeIcon, EventEmitter, Event } from 'vscode';
import { basename } from 'path';
import { EOL } from 'os';
import { readCvsRepoFile, readCvsTagFile } from './cvsHelpers';
import { configManager, cvsCommandLog } from './extension';

export class CvsBranchProvider implements TreeDataProvider<BranchData> {
    private _onDidChangeTreeData: EventEmitter<BranchData | undefined | null | void> = new EventEmitter<BranchData | undefined | null | void>();
    readonly onDidChangeTreeData: Event<BranchData | undefined | null | void> = this._onDidChangeTreeData.event;
    private _enabled: boolean = false;
    private _startup: boolean = true;
    private _workspace: Uri | undefined = undefined;
    
    constructor(enabled: boolean) { 
        this._enabled = enabled;
    }

    refresh(workspaceUri: Uri | undefined): any {
        this._workspace = workspaceUri;
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

        if (this._workspace) {
            if (this._workspace) {
                return Promise.resolve(this.getDeps(this._workspace));
            } else {
                return Promise.resolve([]);
            }
        }

        return Promise.reject();
    }

    async getDeps(uri: Uri): Promise<BranchData[]> {
        let branchData: BranchData[] = [];

        const repo = await readCvsRepoFile(uri); 
        const tag = await readCvsTagFile(uri);
        let branches = await this.readCvsLog(uri);

        branches = branches.filter(function(elem, index, self) { return index === self.indexOf(elem); });

        // manually add main branch (e.g. trunk)
        branchData.push(new BranchData('main', uri, tag === 'main', repo));

        branches.forEach(element => {
            branchData.push(new BranchData(element, uri, tag === element, repo));
        });

        return branchData;
    }

    async readCvsLog(uri: Uri): Promise<string[]> {
        let branches: string[] = [];

        const cvsCommand = `cvs -z5 log -l -h`;
        cvsCommandLog.info(cvsCommand);
    
        const { spawn } = require("child_process");
        const result = await new Promise<boolean>((resolve) => {

            const options = {
                cwd: uri.fsPath,
                shell: true,
                timeout: configManager.getTimeoutValue() * 1000,
            };

            const cmd = spawn(cvsCommand, [""], options);
            cmd.stdout.setEncoding('utf8');
            cmd.stderr.setEncoding('utf8');
    
            cmd.stdout.on("data", (data: any) => {
                data.split(EOL).map(async (line: string) => {
                    let branch = line.match(/^\t.+:\s\d+\..*\.0\.\d+$/)?.[0];
                    if (branch) {
                        branches.push(branch.substring(0,branch.indexOf(':')).trim());
                    }
                });
            });
    
            cmd.stderr.on("data", (data: any) => {
                cvsCommandLog.debug(data);
            });
    
            cmd.on('error', (error: any) => {
                cvsCommandLog.error(error.message);
                resolve(false);
            });
    
            cmd.on("close", (code: any) => {
                if (code === 0) {
                    resolve(true);
                }
                else {
                    cvsCommandLog.warn(`cvs command '${cvsCommand}' exited with code ${code}`);
                    resolve(false);
                }
            });
        });

        if (!result) {
            branches = [];
            window.showErrorMessage(`Failed to obtain cvs log for resource: ${basename(uri.fsPath)}`);
        }

        return branches;
    }
}


export class BranchData extends TreeItem {
    constructor(
        public readonly branchName: string,
        public readonly uri: Uri,
        public readonly isActive: boolean,
        public readonly repository: string
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
        this.id = this.branchName;

        if (isActive) {
            this.contextValue = "active_branch";
        } else {
            this.contextValue = "branch";
        }
    }
}
