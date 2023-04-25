import { Uri, TreeItem, TreeDataProvider, TreeItemCollapsibleState, window, ThemeIcon, EventEmitter, Event } from 'vscode';
import { basename, dirname } from 'path';
import { spawnCmd, readFile } from './utility';
import { SourceFile, SourceFileState } from './sourceFile';
import { EOL } from 'os';

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
                public repository: string) {}
}

export class SourceFileItem extends TreeItem {
    constructor(
        public readonly sourceFile: CompareData,
        public readonly workspace: Uri
    ) {
        if (sourceFile.uri === undefined) { return; }

        super(basename(sourceFile.uri.fsPath), TreeItemCollapsibleState.None);
        //this.tooltip = sourceFileName;
        this.description = dirname(sourceFile.uri.fsPath).split(this.workspace.fsPath).at(1)?.substring(1);
        this.id = sourceFile.uri.fsPath;

        if (sourceFile.state === SourceFileState.added) {
            this.iconPath = { dark: __dirname + "/../resources/icons/dark/added.svg",
                              light: __dirname + "/../resources/icons/light/added.svg"};
        } else if (sourceFile.state === SourceFileState.removed) {
            this.iconPath = { dark: __dirname + "/../resources/icons/dark/removed.svg",
                              light: __dirname + "/../resources/icons/light/removed.svg"};
        } else if (sourceFile.state === SourceFileState.modified) {
            this.iconPath = { dark: __dirname + "/../resources/icons/dark/modified.svg",
                              light: __dirname + "/../resources/icons/light/modified.svg"};
        }
    }
}
