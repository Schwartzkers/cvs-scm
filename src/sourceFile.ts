import { Uri } from "vscode";

export enum SourceFileState {
    unknown,
    modified,
    untracked,
    added,
    removed,
    checkout,
    conflict,
    patch,
    merge,
    deleted,
    removedFromRepo,
    directory
}

const stateMap = new Map<string, SourceFileState>([
    ["Locally Modified", SourceFileState.modified],
    ["Unknown", SourceFileState.untracked],
    ["Locally Added", SourceFileState.added],
    ["Locally Removed", SourceFileState.removed],
    ["Needs Checkout", SourceFileState.checkout],
    ["Unresolved Conflict", SourceFileState.conflict],
    ["Needs Patch", SourceFileState.patch],
    ["Needs Merge", SourceFileState.merge],
    ["File had conflicts on merge", SourceFileState.conflict],
    ["Locally Deleted", SourceFileState.deleted],
    ["Entry Invalid", SourceFileState.removedFromRepo],
    ["New Directory", SourceFileState.directory],
]);

export class SourceFile {
    public state: SourceFileState | undefined;
    public branch: string | undefined;
    public workingRevision: string | undefined;
    public repoRevision: string | undefined;
    public isFolder: boolean=false;

	constructor(public uri: Uri) {
		this.uri = uri;
    }

    setState(state: string): void {
        if(stateMap.has(state))
        {
            this.state = stateMap.get(state);
        }
    }
}