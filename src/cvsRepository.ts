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
		return await runCvsStrCmd(cvsCmd, this.workspaceUri.fsPath);
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
				}
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
				console.log(state);
				sourceFile.setState(state);
				console.log(sourceFile.state);
			}
			else if (element.includes('Working revision:')) {
				sourceFile.workingRevision = element.trim().split(/\s+/)[2];
				console.log(sourceFile.workingRevision);
			}
			else if (element.includes('Repository revision:')) {
				sourceFile.repoRevision = element.trim().split(/\s+/)[2];
				console.log(sourceFile.repoRevision);
			}
			else if (element.includes('Sticky Tag:')) {
				let branch = element.trim().split(/\s+/)[2];
				if (branch === '(none)') {
					branch = 'trunk';
				}
				sourceFile.branch = branch;
				console.log(sourceFile.branch);
			}
		}
	}

	getChangesSourceFiles(): SourceFile[] {
		return this.sourceFiles;
	}
}

