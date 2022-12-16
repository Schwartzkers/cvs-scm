import { Uri, TreeItem, TreeDataProvider, TreeItemCollapsibleState, window, ThemeIcon, EventEmitter, Event, Command } from 'vscode';
import { basename, dirname } from 'path';
import { spawnCmd } from './utility';
import { EOL } from 'os';
import { CVS_SCHEME_COMPARE } from './cvsRepository';

export class CvsRevisionProvider implements TreeDataProvider<CommitData> {
    private _onDidChangeTreeData: EventEmitter<CommitData | undefined | null | void> = new EventEmitter<CommitData | undefined | null | void>();
    readonly onDidChangeTreeData: Event<CommitData | undefined | null | void> = this._onDidChangeTreeData.event;
    
    constructor() { }

    refresh(): any {
        this._onDidChangeTreeData.fire(undefined);
      }

    getTreeItem(element: CommitData): TreeItem {
      return element;
    }

    getChildren(element?: CommitData): Thenable<CommitData[]> {
        let textEditor = window.activeTextEditor;
        if (textEditor) {
            return Promise.resolve(this.getDeps(textEditor.document.uri));
        }

        return Promise.reject();
    }

    async getDeps(uri: Uri): Promise<CommitData[]> {
        const log = await this.readCvsLog(uri);

        return this.parseCvsLog(log, uri);
    }

    async readCvsLog(resource: Uri): Promise<string> {
        // TODO get status to get branch and repo version to feed into log
        // then use branch name to get any commits
        // then use repo version to get remainder of commits 
        const cvsCmd = `cvs log -N ${basename(resource.fsPath)}`;
        const result = await spawnCmd(cvsCmd, dirname(resource.fsPath));
        
        if (!result.result || result.output.length === 0) {
            window.showErrorMessage(`Failed to obtain cvs log for resource: ${basename(resource.fsPath)}`);
            return "";
        }

        return result.output;
    }

    parseCvsLog(log: string, uri: Uri): CommitData[] {
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
            commits.push(new CommitData(shortMsg, uri, commitMsg, revision, author, date));
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
        private date: string
    ) {
        super(revision + "  " + shortMsg.slice(0, 50), TreeItemCollapsibleState.None);
        this.resourceUri = Uri.parse(`${CVS_SCHEME_COMPARE}:${uri.fsPath}_${this.revision}`);
        this.tooltip = this.commitMsg;
        this.description = this.author + ", " + this.date;
        this.iconPath = new ThemeIcon("git-commit");
        this.contextValue = "revision";

        // 1.51 or 1.51.2.3
        const revIndex = this.revision.lastIndexOf('.') + 1;
        let revNum = parseInt(this.revision.substring(revIndex));

        if (revNum > 1) {
            const previousRevision = this.revision.slice(0, revIndex) + (--revNum).toString();

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
