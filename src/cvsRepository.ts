import { QuickDiffProvider, Uri, CancellationToken, ProviderResult } from "vscode";
import { SourceFile, SourceFileState } from './sourceFile';
import { runCvsStrCmd } from './utility';


export class CvsFile {
	constructor(public uri: Uri, public version?: number, public text?: string, public state?: SourceFileState) { }
}

export const CVS_SCHEME = 'cvs-scm';

export class CvsRepository implements QuickDiffProvider {
	private sourceFiles: SourceFile[];

	constructor(private workspaceUri: Uri) {
		this.sourceFiles = []; 
	}

	provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
		if (token.isCancellationRequested) { return undefined; }

		return Uri.parse(`${CVS_SCHEME}:${uri.fsPath}`);
	}

	async getResources(): Promise<string> {
		let cvsCmd = `cvs -n -q update`;
		return await runCvsStrCmd(cvsCmd, this.workspaceUri.fsPath, true, true);
	}

	async parseResources(stdout: string): Promise<void> {
		const fs = require('fs/promises');
		this.sourceFiles = [];

		for (const element of stdout.split('\n')) {
		//await stdout.split('\n').forEach(async element => { should do promise all
			let state = element.substring(0, element.indexOf(' '));
			if (state.length === 1) {				
				const path = element.substring(element.indexOf(' ')+1, element.length);
				let sourceFile = new SourceFile(path);
				if ( state !== '?') {
					 await this.getStatusOfFile(sourceFile);
				}
				else {
					sourceFile.setState("Unknown");
					// is it a file or folder?
					var uri = Uri.joinPath(this.workspaceUri, path);
					const stat = await fs.lstat(uri.fsPath);
					if (!stat.isFile()) {
						sourceFile.isFolder = true;
					}			
				}
				this.sourceFiles.push(sourceFile);				
			} else if (element.includes('is no longer in the repository')) {
				// file has been remotely removed
				const path = element.substring(element.indexOf('`')+1, element.indexOf('\''));
				let sourceFile = new SourceFile(path);
				await this.getStatusOfFile(sourceFile);
				this.sourceFiles.push(sourceFile);
			}
		};
	}

	async getStatusOfFile(sourceFile: SourceFile): Promise<void> {
		const cvsCmd = `cvs status ${sourceFile.path}`;
		const status = await runCvsStrCmd(cvsCmd, this.workspaceUri.fsPath);

		for (const element of status.split('\n')) {
			if (element.includes('Status:')) {
				const state = element.trim().split('Status: ')[1];
				sourceFile.setState(state);
			}
			else if (element.includes('Working revision:')) {
				sourceFile.workingRevision = element.trim().split(/\s+/)[2];
			}
			else if (element.includes('Repository revision:')) {
				sourceFile.repoRevision = element.trim().split(/\s+/)[2];
			}
			else if (element.includes('Sticky Tag:')) {
				let branch = element.trim().split(/\s+/)[2];
				if (branch === '(none)') {
					branch = 'main';
				}
				sourceFile.branch = branch;
			}
		}

		// handle special case for locally deleted files
		if (sourceFile.state === SourceFileState.checkout &&
			sourceFile.workingRevision !== 'No') {
			sourceFile.setState("Locally Deleted");
		}
	}

	getChangesSourceFiles(): SourceFile[] {
		return this.sourceFiles;
	}
}

