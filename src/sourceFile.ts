import * as vscode from 'vscode';

export enum SourceFileState {
    unknown,
    modified,
    untracked,
    added,
    removed,
    lost,
    conflict,
    patch,
    merge
}

const myMap = new Map<string, SourceFileState>([
    ["M", SourceFileState.modified],
    ["?", SourceFileState.untracked],
    ["A", SourceFileState.added],
    ["R", SourceFileState.removed],
    ["Needs Checkout", SourceFileState.lost],
    ["Unresolved Conflict", SourceFileState.conflict],
    ["Needs Patch", SourceFileState.patch],
    ["Needs Merge", SourceFileState.merge],    
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