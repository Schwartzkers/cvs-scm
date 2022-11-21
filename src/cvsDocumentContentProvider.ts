import { CancellationToken, ProviderResult, TextDocumentContentProvider, Event,
		 Uri, EventEmitter, Disposable, workspace, SourceControlResourceState,
		 window, TabInputTextDiff } from "vscode";
import { CVS_SCHEME } from './cvsRepository';
import { basename, dirname } from 'path';
import { execCmd, spawnCmd } from './utility';

export class CvsFile {
	constructor(public cvsUri: Uri, public originalText: string="", public originalTextUpdated: boolean=false, ) { }
}

/**
 * Provides the content of the CVS files per the server version i.e.  without the local edits.
 * This is used for the source control diff.
 */
export class CvsDocumentContentProvider implements TextDocumentContentProvider, Disposable {
	private _onDidChange = new EventEmitter<Uri>();
	private sourceControlFiles = new Map<string, CvsFile>(); // this assumes each file is only opened once per workspace

	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	async updated(resourceStates: SourceControlResourceState[]): Promise<void> {
		// clear cache of originals
		this.sourceControlFiles.clear();

		// get all diff editors currently opened, some may need to be updated
		let openDiffs: Uri[];
		openDiffs = [];
		for (const tabGroup of window.tabGroups.all) {
			for (const tab of tabGroup.tabs) {
				if (tab.input instanceof TabInputTextDiff) {
					openDiffs.push(tab.input.original);
				}
			}
		}

		resourceStates.forEach(resource => {
			let cvsFIle = new CvsFile(resource.resourceUri);
			const cvsUri = Uri.parse(`${CVS_SCHEME}:${resource.resourceUri.fsPath}`);
			this.sourceControlFiles.set(cvsUri.fsPath, cvsFIle);
		});

		// update open diff editors of any changes to repository version
		this.sourceControlFiles.forEach(resource => {
			for (const diff of openDiffs)
			{
				if(resource.cvsUri.fsPath === diff.fsPath) {
					this._onDidChange.fire(resource.cvsUri);
					break;
				}
			}	
		});
	}

	provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
		if (token.isCancellationRequested) {
			// TODO cancel getting repository revision
			// currently it will timeout after 5 secs
			return "Canceled";
		}

		const resource = this.sourceControlFiles.get(uri.fsPath);
		if (resource && resource.originalTextUpdated) {
			return resource.originalText;
		} else {
			return new Promise((resolve) => {
				resolve(this.getRepositoryRevision(uri));
			});
		}
	}

    async getRepositoryRevision(uri: Uri): Promise<string> {
		let originalText = "";
		const cvsCmd = `cvs -Q update -C -p ${basename(uri.fsPath)}`;
		const result = await spawnCmd(cvsCmd, dirname(uri.fsPath));

		if (!result.result) {
			window.showErrorMessage(`Failed to obtain HEAD revision from repository: ${basename(uri.fsPath)}`);
			return "";
		}

		originalText = result.output;
		if (originalText.length === 0) { originalText = " "; } // quick diff won't work with empty original

		const resource = this.sourceControlFiles.get(uri.fsPath);
		if (resource) {
			resource.originalText = originalText;
			resource.originalTextUpdated = true;
		} 

		return originalText;
	}
}