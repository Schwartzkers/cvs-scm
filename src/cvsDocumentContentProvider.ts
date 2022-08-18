import { CancellationToken, ProviderResult, TextDocumentContentProvider, Event, Uri, EventEmitter, Disposable, window, workspace, SourceControlResourceState } from "vscode";
import { CvsFile, CvsRepository, CVS_SCHEME } from './cvsRepository';
import * as path from 'path';

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

		console.log('resourceStates.length = ' + resourceStates.length);

		if (resourceStates.length > 0) {
			console.log('inside if');
			for (let i:number=0; i < resourceStates.length; i++) {
				console.log('inside if i=: ' + i);
				let cvsFIle = new CvsFile(resourceStates[i].resourceUri);
				cvsFIle.text = await this.getRepositoryRevision(resourceStates[i].resourceUri);

				const relativePath = workspace.asRelativePath(resourceStates[i].resourceUri.fsPath);
				this.sourceControlFiles.set(Uri.parse(`${CVS_SCHEME}:${relativePath}`).fsPath, cvsFIle);

				console.log('added to content provider: ' + Uri.parse(`${CVS_SCHEME}:${relativePath}`));			

				this._onDidChange.fire(Uri.parse(`${CVS_SCHEME}:${relativePath}`));
			}
		}

		this.sourceControlFiles.forEach(element => {
			console.log(element.uri);
			console.log(element.text);
		});
	}

	provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
        console.log('provideTextDocumentContent: ' + uri);

        if (token.isCancellationRequested) { return "Canceled"; }

		const resource = this.sourceControlFiles.get(uri.fsPath);
		if (!resource) {
			console.log('provideTextDocumentContent failed');
			return "Resource not found: " + uri.toString();
		}

		console.log(resource.text);
		return resource.text;
	}

    async getRepositoryRevision(uri: Uri): Promise<string> {
		const { exec } = require("child_process");

		return await new Promise<string>((resolve, reject) => {
			const cvsCmd = `cvs -Q update -C -p ${path.basename(uri.fsPath)}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					window.showErrorMessage("Error reverting files.");
					reject(error);
				} else {
					resolve(stdout);
				}
			});
		});
	}
}