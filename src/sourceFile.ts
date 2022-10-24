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
    invalid
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
    ["Entry Invalid", SourceFileState.invalid],
]);

export class SourceFile {
	public path: string;
    public state: SourceFileState | undefined;
    public branch: string | undefined;
    public workingRevision: string | undefined;
    public repoRevision: string | undefined;
    public isStaged: boolean;
    public isFolder: boolean=false;

	constructor(path: string) {
		this.path = path;
        this.isStaged = false;
    }

    setState(state: string): void {
        if(stateMap.has(state))
        {
            this.state = stateMap.get(state);
        }
    }
}