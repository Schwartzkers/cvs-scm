/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Schwartzkers. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, TreeItem, TreeDataProvider, TreeItemCollapsibleState, Command, EventEmitter, Event, MarkdownString } from 'vscode';
import { basename, dirname } from 'path';
import { SourceFileState } from './sourceFile';
import { CVS_SCHEME_COMPARE } from './cvsRepository';

export class CvsCompareProvider implements TreeDataProvider<SourceFileItem> {
    private _onDidChangeTreeData: EventEmitter<SourceFileItem | undefined | null | void> = new EventEmitter<SourceFileItem | undefined | null | void>();
    readonly onDidChangeTreeData: Event<SourceFileItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private _enabled: boolean = false;
    private _sourceFiles: CompareData[] = [];
    private _workspace: Uri | undefined;
    
    constructor(enabled: boolean) { 
        this._enabled = enabled;
    }

    refresh(sourceFiles: CompareData[], workspace: Uri): any {
        this._sourceFiles = sourceFiles;
        this._workspace = workspace;
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: SourceFileItem): TreeItem {
      return element;
    }

    getChildren(element?: SourceFileItem): Thenable<SourceFileItem[]> {
        if (!this._enabled || element ) {  // there are no children with children in this tree
            return Promise.resolve([]);
        }

        if (this._sourceFiles.length > 0) {
            return Promise.resolve(this.getDeps());
        } else {
            return Promise.resolve([]);
        }
    }

    async getDeps(): Promise<SourceFileItem[]> {
        let sourceFileItems: SourceFileItem[] = [];

        this._sourceFiles.forEach(element => {
            if (element.uri && this._workspace) {
                sourceFileItems.push(new SourceFileItem(element, this._workspace));
            }
        });

        return sourceFileItems;
    }
}

export class CompareData {
    public compareBranch: string = '';

    constructor(public uri: Uri,
                public state: SourceFileState,
                public repository: string,
                public currentBranch: string,
                public incomingBranch: string) {}
}

export class SourceFileItem extends TreeItem {
    public currentBranch: string = '';
    public incomingBranch: string = '';

    constructor(
        public readonly sourceFile: CompareData,
        public readonly workspace: Uri
    ) {
        if (sourceFile.uri === undefined) { return; }
        super(basename(sourceFile.uri.fsPath), TreeItemCollapsibleState.None);

        this.currentBranch = sourceFile.currentBranch;
        this.incomingBranch = sourceFile.incomingBranch;

        this.description = dirname(sourceFile.uri.fsPath).split(this.workspace.fsPath).at(1)?.substring(1);
        this.id = sourceFile.uri.fsPath;

        const left = Uri.from({scheme: CVS_SCHEME_COMPARE, path: sourceFile.uri.path, query: `${this.currentBranch}`});
        const right = Uri.from({scheme: CVS_SCHEME_COMPARE, path: sourceFile.uri.path, query: `${this.incomingBranch}`});

        if (sourceFile.state === SourceFileState.added) {
            this.iconPath = { dark: __dirname + "/../resources/icons/dark/added.svg",
                              light: __dirname + "/../resources/icons/light/added.svg"};

            const command: Command =
            {
                title: "Open Branch Revision",
                command: "vscode.open",
                arguments: [right, [],`${basename(sourceFile.uri.fsPath)} (Compare) A`],
            };
            this.command = command;
        } else if (sourceFile.state === SourceFileState.removed) {
            this.iconPath = { dark: __dirname + "/../resources/icons/dark/removed.svg",
                              light: __dirname + "/../resources/icons/light/removed.svg"};

            const command: Command =
            {
                title: "Open Branch Revision",
                command: "vscode.open",
                arguments: [left, [], `${basename(sourceFile.uri.fsPath)} (Compare) R`],
            };
            this.command = command;
        } else if (sourceFile.state === SourceFileState.modified) {
            this.iconPath = { dark: __dirname + "/../resources/icons/dark/modified.svg",
                              light: __dirname + "/../resources/icons/light/modified.svg"};

            let branch1 = this.currentBranch;
            let branch2 = this.incomingBranch;

            if (branch1 === 'HEAD') { branch1 = 'main'; }
            if (branch2 === 'HEAD') { branch2 = 'main'; }

            const command: Command =
            {
                title: "Branch Diff",
                command: "vscode.diff",
                arguments: [left, right, `${basename(sourceFile.uri.fsPath)} (${branch1}) <-> (${branch2})`],
            };
            this.command = command;
        }
    }
}
