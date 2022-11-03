import { CancellationToken, ProviderResult, TextDocumentContentProvider, Event, Uri, EventEmitter, Disposable, workspace, SourceControlResourceState } from "vscode";
import { CvsFile, CVS_SCHEME } from './cvsRepository';
import { basename, dirname } from 'path';
import { runCvsCmd } from './utility';

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
		this.sourceControlFiles.clear();

		if (resourceStates.length > 0) {
			for (let i:number=0; i < resourceStates.length; i++) {

				let cvsFIle = new CvsFile(resourceStates[i].resourceUri);
				if (resourceStates[i].contextValue !== 'conflict') { // cannot get repo revision if conflicts exist
					cvsFIle.text = await this.getRepositoryRevision(resourceStates[i].resourceUri);
				}

				const relativePath = workspace.asRelativePath(resourceStates[i].resourceUri.fsPath);
				this.sourceControlFiles.set(Uri.parse(`${CVS_SCHEME}:${relativePath}`).fsPath, cvsFIle);
				this._onDidChange.fire(Uri.parse(`${CVS_SCHEME}:${relativePath}`));
			}
		}
	}

	provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
		if (token.isCancellationRequested) { return "Canceled"; }
		const resource = this.sourceControlFiles.get(uri.fsPath);
		if (!resource) {
			return new Promise((resolve) => {
					resolve(this.getRepositoryRevision(uri));
			});
		}

		return resource.text;
	}

    async getRepositoryRevision(uri: Uri): Promise<string> {
		const cvsCmd = `cvs -Q update -C -p ${basename(uri.fsPath)}`;
		return (await runCvsCmd(cvsCmd, dirname(uri.fsPath), true)).output;
	}
}