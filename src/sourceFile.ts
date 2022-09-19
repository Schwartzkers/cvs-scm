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
    ["Locally Modified", SourceFileState.modified],
    ["Unknown", SourceFileState.untracked],
    ["Locally Added", SourceFileState.added],
    ["Locally Removed", SourceFileState.removed],
    ["Needs Checkout", SourceFileState.lost],
    ["Unresolved Conflict", SourceFileState.conflict],
    ["Needs Patch", SourceFileState.patch],
    ["Needs Merge", SourceFileState.merge],
    ["File had conflicts on merge", SourceFileState.conflict],
    ["Needs Checkout", SourceFileState.patch]
]);

export class SourceFile {
	public path: string;
    public state: SourceFileState | undefined;
    public branch: string | undefined;
    public workingRevision: string | undefined;
    public repoRevision: string | undefined;

	constructor(path: string) {
		this.path = path;
    }

    setState(state: string): void {
        if(myMap.has(state))
        {
            this.state = myMap.get(state);
        }
    }
}