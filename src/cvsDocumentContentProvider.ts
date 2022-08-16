import { CancellationToken, ProviderResult, TextDocumentContentProvider, Event, Uri, EventEmitter, Disposable, window } from "vscode";
import { CvsFile, CvsRepository, CVS_SCHEME } from './cvsRepository';
import * as path from 'path';

/**
 * Provides the content of the JS Fiddle documents as fetched from the server i.e.  without the local edits.
 * This is used for the source control diff.
 */
export class CvsDocumentContentProvider implements TextDocumentContentProvider, Disposable {
	private _onDidChange = new EventEmitter<Uri>();
	private sourceControlFiles = new Map<string, CvsFile>(); // this assumes each file is only opened once per workspace

	get onDidChange(): Event<Uri> {
        console.log('onDidChange');
		return this._onDidChange.event;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	async updated(resource: CvsFile): Promise<void> {
        resource.text = await this.getRepositoryRevision(resource.uri);
		this.sourceControlFiles.set(path.basename(resource.uri.fsPath), resource);
        console.log(Uri.parse(`${CVS_SCHEME}:${resource.uri.fsPath}`));
		this._onDidChange.fire(Uri.parse(`${CVS_SCHEME}:${resource.uri.fsPath}`));
	}

	provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
        console.log('provideTextDocumentContent');

        if (token.isCancellationRequested) { return "Canceled"; }

		const resource = this.sourceControlFiles.get(path.basename(uri.fsPath));
		if (!resource) { return "Resource not found: " + uri.toString(); }

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