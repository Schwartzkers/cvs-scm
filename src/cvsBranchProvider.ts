import { Uri, TreeItem, TreeDataProvider, TreeItemCollapsibleState, window, ThemeIcon, EventEmitter, Event } from 'vscode';
import { basename, dirname } from 'path';
import { spawnCmd, readFile } from './utility';
import { EOL } from 'os';

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

        const repo = await this.readCvsRepoFile(uri); 
        const tag = await this.readCvsTagFile(uri);
        const log = await this.readCvsLog(uri);
        const branches = await this.getBranches(log);

        // manually add main branch (e.g. trunk)
        branchData.push(new BranchData('main', uri, tag === 'main', repo));

        branches.forEach(element => {
            branchData.push(new BranchData(element, uri, tag === element, repo));
        });

        return branchData;
    }

    async readCvsRepoFile(uri: Uri): Promise<string> {
        const file = Uri.joinPath(uri, 'CVS/Repository');
        let repo = await readFile(file.fsPath);

        if (repo) {
            return repo.trim();
        } else{
            return '?';
        }
    }

    async readCvsTagFile(uri: Uri): Promise<string> {
        const file = Uri.joinPath(uri, 'CVS/Tag');
        let tag = await readFile(file.fsPath);

        if (tag) {
            return tag.substring(1).trim();
        } else{
            return 'main';
        }
    }

    async readCvsLog(uri: Uri): Promise<string> {
        const cvsCmd = `cvs log -h`;
        const result = await spawnCmd(cvsCmd, uri.fsPath);
        
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

        branches = branches.filter(function(elem, index, self) { return index === self.indexOf(elem); });
        
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
