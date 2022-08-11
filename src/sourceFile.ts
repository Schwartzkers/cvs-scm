import * as vscode from 'vscode';

export enum SourceFileState {
    unknown,
    modified,
    untracked,
    added,
    removed,
    lost,
    conflict
}

const myMap = new Map<string, SourceFileState>([
    ["M", SourceFileState.modified],
    ["?", SourceFileState.untracked],
    ["A", SourceFileState.added],
    ["R", SourceFileState.removed],
    ["U", SourceFileState.lost],
    ["C", SourceFileState.conflict]
]);

export class SourceFile {
	public resource: vscode.Uri;
    public state: SourceFileState | undefined;

	constructor(resource: vscode.Uri, state: string) {
		this.resource = resource;

        if(myMap.has(state))
        {
            this.state = myMap.get(state);
        }
    
	}
}