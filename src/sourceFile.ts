import * as vscode from 'vscode';

export enum SourceFileState {
    unknown,
    modified,
    untracked,
}

const myMap = new Map<string, SourceFileState>([
    ["M", SourceFileState.modified],
    ["?", SourceFileState.untracked]
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