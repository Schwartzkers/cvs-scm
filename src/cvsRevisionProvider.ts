import { Uri, TreeItem, TreeDataProvider, TreeItemCollapsibleState, window, ThemeIcon, EventEmitter, Event, Command } from 'vscode';
import { basename, dirname } from 'path';
import { spawnCmd } from './utility';
import { EOL } from 'os';
import { CVS_SCHEME_COMPARE, parseCvsStatusOutput } from './cvsRepository';
import { SourceFile } from './sourceFile';

export class CvsRevisionProvider implements TreeDataProvider<CommitData> {
    private _onDidChangeTreeData: EventEmitter<CommitData | undefined | null | void> = new EventEmitter<CommitData | undefined | null | void>();
    readonly onDidChangeTreeData: Event<CommitData | undefined | null | void> = this._onDidChangeTreeData.event;
    private _enabled: boolean = false;
    
    constructor(enabled: boolean) { 
        this._enabled = enabled;
    }

    refresh(): any {
        this._onDidChangeTreeData.fire(undefined);
      }

    getTreeItem(element: CommitData): TreeItem {
      return element;
    }

    getChildren(element?: CommitData): Thenable<CommitData[]> {
        if (!this._enabled || element) { return Promise.resolve([]); } // there are no children with children

        let textEditor = window.activeTextEditor;
        if (textEditor) {
            return Promise.resolve(this.getDeps(textEditor.document.uri));
        }

        return Promise.reject();
    }

    async getDeps(uri: Uri): Promise<CommitData[]> {
        // 1. get status of file to find branch and repo version
        const sourceFile = new SourceFile(uri);
        await this.getStatusOfFile(sourceFile);

        let commits: CommitData[];
        commits = [];
        if (sourceFile.branch === 'main' && sourceFile.repoRevision) {
            const log = await this.readCvsLog(uri, sourceFile.repoRevision);
            commits = this.parseCvsLog(log, uri, false);
        } else if (sourceFile.repoRevision && sourceFile.branch) { // 
            // 2. use branch name to get any commits on branch
            const branchLog = await this.readCvsLog(uri, sourceFile.branch);
            commits = this.parseCvsLog(branchLog, uri, true);

            if (commits.length === 0) {
                // 3a. use repo version to get remainder of commits
                const trunkLog = await this.readCvsLog(uri, sourceFile.repoRevision);
                commits = commits.concat(this.parseCvsLog(trunkLog, uri, false));
            } else { // branch has commits, need to determine parent rev 
                // e.g 1.3.2.2 -> 1.3
                const rev = sourceFile.repoRevision.substring(0, sourceFile.repoRevision.length - 4);
                const trunkLog = await this.readCvsLog(uri, rev);
                commits = commits.concat(this.parseCvsLog(trunkLog, uri, false));
            }
        }

        return commits;
    }

    async readCvsLog(resource: Uri, revision: string): Promise<string> {
        const cvsCmd = `cvs log -r:${revision} ${basename(resource.fsPath)}`;
        const result = await spawnCmd(cvsCmd, dirname(resource.fsPath));
        
        if (!result.result || result.output.length === 0) {
            window.showErrorMessage(`Failed to obtain cvs log for resource: ${basename(resource.fsPath)}`);
            return "";
        }

        return result.output;
    }

    async getStatusOfFile(sourceFile: SourceFile): Promise<void> {
        const cvsCmd = `cvs status ${basename(sourceFile.uri.fsPath)}`;
        const status = await spawnCmd(cvsCmd, dirname(sourceFile.uri.fsPath));

        if (!status.result || status.output.length === 0) {
            window.showErrorMessage(`Failed to obtain cvs status for resource: ${basename(sourceFile.uri.fsPath)}`);
            return;
        }

        if (!status.output.includes("Status: Unknown") && !status.output.includes("Status: Locally Added")) {
            const sourceFileStatusPromises = status.output.split(EOL).map(async (line) => await parseCvsStatusOutput(line, sourceFile));
            await Promise.all(sourceFileStatusPromises);
        }
    }

    parseCvsLog(log: string, uri: Uri, isBranchCommit: boolean): CommitData[] {
        // remove last line "=======""
        let revs = log.split(/\r?\n[=]+\r?\n/)[0].split(/\r?\n[-]+\r?\n/);

        let commits = [];
        let shortMsg = '';
        let commitMsg = '';
        let revision = '';
        let author = '';
        let date = '';

        for (let rev = 1; rev < revs.length; rev++) {
            let commitLines = 0;
            let revSet = false;
            for (const line of revs[rev].split(EOL)) {
                if ( line.includes("revision") && revSet === false) {
                    revision = line.split(/revision/)[1].trim();
                    revSet = true;
                } else if ( line.includes("date:") && line.includes("author:") ) {
                    let matcher = line.match(/author:\s(.*?);/);
                    if (matcher) { author = matcher[1]; }

                    matcher = line.match(/date:\s(.{10})\s/);
                    if (matcher) { date = matcher[1]; }
                } else if ( line.includes("branches:") ) { 
                    // TODO ignore for now
                    continue;
                }
                else {
                    if (commitLines < 2) {
                        shortMsg += line.trimEnd() + "  ";
                        commitLines++;
                    }
                    commitMsg += line  + EOL;
                }
            }
            commits.push(new CommitData(shortMsg, uri, commitMsg, revision, author, date, isBranchCommit));
            shortMsg = '';
            commitMsg = '';
        }
        return commits;
    }
}

export class CommitData extends TreeItem {
    constructor(
        public readonly shortMsg: string,
        public readonly uri: Uri,
        private commitMsg: string,
        public readonly revision: string,
        private author: string,
        private date: string,
        private isBranchCommit: boolean
    ) {
        super(revision + "  " + shortMsg.slice(0, 50), TreeItemCollapsibleState.None);
        this.resourceUri = Uri.parse(`${CVS_SCHEME_COMPARE}:${uri.fsPath}_${this.revision}`);
        this.tooltip = this.commitMsg;
        this.description = this.author + ", " + this.date;
        this.iconPath = new ThemeIcon("git-commit");
        this.contextValue = "revision";
        this.id = revision;

        // 1.51 or 1.51.2.3
        const revIndex = this.revision.lastIndexOf('.') + 1;
        let revNum = parseInt(this.revision.substring(revIndex));

        let shouldDiff = false;
        let previousRevision = "";
        if (revNum > 1) {
            previousRevision = this.revision.slice(0, revIndex) + (--revNum).toString();
            shouldDiff = true;
        }
        else if (isBranchCommit && revNum === 1) {
            // get parent revision
            previousRevision = this.revision.substring(0, this.revision.length - 4);
            shouldDiff = true;
        }

        if (shouldDiff) {
            const left = Uri.parse(`${CVS_SCHEME_COMPARE}:${uri.fsPath}_${previousRevision}`);
            const right = this.resourceUri;
    
            const command: Command =
            {
                title: "File History",
                command: "vscode.diff",
                arguments: [left, right, `${basename(uri.fsPath)} (${previousRevision}) <-> (${this.revision})`],
            };
            this.command = command;
        }
    }
}
