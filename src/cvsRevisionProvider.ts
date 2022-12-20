import { Uri, TreeItem, TreeDataProvider, TreeItemCollapsibleState, window, ThemeIcon, EventEmitter, Event, Command, workspace } from 'vscode';
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

    async getDeps(uri: Uri): Promise<CommitData[]> {
        // get status of file to repo version
        const sourceFile = new SourceFile(uri);
        await this.getStatusOfFile(sourceFile);

        let commits: CommitData[];
        commits = [];
        if (sourceFile.repoRevision) {
            let revision = sourceFile.repoRevision;
            let loops = 1; // add protection, after 10 loops exit and warn user to avoid infinte loop
            while (true) { // must handle nested branches
                const log = await this.readCvsLog(uri, revision);
                commits = commits.concat(this.parseCvsLog(log, uri));

                if (revision.search(/^(\d+\.\d+){1}$/) !== -1) { // exit after finding root revision (e.g. 1.3)
                    break;
                }

                // this file has branch commits, need to determine parent revision
                // e.g 1.3.2.2 -> 1.3 or 1.3.20.2 -> 1.3 or 1.3.2.2.2.1 -> 1.3.2.2 -> 1.3
                // get location of second last '.'
                const parentRevIndex = revision.substring(0, revision.lastIndexOf('.')).lastIndexOf('.');
                revision = revision.substring(0, parentRevIndex);

                if (loops === 10) {
                    window.showErrorMessage("Error getting cvs log. Too many nested branches.");
                    break;
                }
                loops += 1;
            }
        }

        return commits;
    }

    async readCvsLog(uri: Uri, revision: string): Promise<string> {
        const cvsCmd = `cvs log -r:${revision} ${basename(uri.fsPath)}`;
        const result = await spawnCmd(cvsCmd, dirname(uri.fsPath));
        
        if (!result.result || result.output.length === 0) {
            window.showErrorMessage(`Failed to obtain cvs log for resource: ${basename(uri.fsPath)}`);
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

    parseCvsLog(log: string, uri: Uri): CommitData[] {
        // remove last line "=======""
        let revs = log.split(/\r?\n[=]+\r?\n/)[0].split(/\r?\n-{10,}\r?\nrevision\s/);

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
                if ( revSet === false) {
                    revision = line.trim();
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
        private date: string,
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
        else if (revNum === 1) {
            if (revision.search(/^(\d+\.\d+){1}$/) === -1) { // check if at root revision (1.3)
                // get parent revision
                const parentRevIndex = this.revision.substring(0, revision.lastIndexOf('.')).lastIndexOf('.');
                previousRevision = this.revision.substring(0, parentRevIndex);
                shouldDiff = true;
            }
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
