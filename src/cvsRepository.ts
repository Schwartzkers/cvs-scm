import { QuickDiffProvider, Uri, CancellationToken, ProviderResult, WorkspaceFolder, workspace, window, env } from "vscode";
import * as path from 'path';
import { SourceFile, SourceFileState } from './sourceFile';


export class CvsFile {
	constructor(public uri: Uri, public version?: number, public text?: string) { }
}

export const CVS_SCHEME = 'jon';

export class CvsRepository implements QuickDiffProvider {
	private sourceFiles: SourceFile[];

	constructor(private workspaceUri: Uri) {
		this.sourceFiles = []; 
	}

	provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
		if (token.isCancellationRequested) { return undefined; }

		const relativePath = workspace.asRelativePath(uri.fsPath);

		console.log('provideOriginalResource: ' + Uri.parse(`${CVS_SCHEME}:${relativePath}`));

		return Uri.parse(`${CVS_SCHEME}:${relativePath}`);
	}

	getTmpVersion(uri: Uri): Uri {
		return Uri.parse(`/tmp/${path.basename(uri.fsPath)}.HEAD`);
	}

	async getResources(): Promise<String> {
		const { exec } = require("child_process");

		const result = await new Promise<String>((resolve, reject) => {
			let cvsCmd = `cvs -n -q update`;
			console.log(this.workspaceUri.fsPath);
			exec(cvsCmd, {cwd: this.workspaceUri.fsPath}, (error: any, stdout: string, stderr: any) => {
				// if (error) {
				// 	reject(error);
				// } else {					
				// 	resolve(stdout);
				// }
				resolve(stdout);
			});
		});

		return result;
	}

	async parseResources(stdout: String): Promise<void> {
		const fs = require('fs/promises');
		this.sourceFiles = [];

		for (const element of stdout.split('\n')) {
		//await stdout.split('\n').forEach(async element => { should do promise all
			let state = element.substring(0, element.indexOf(' '));
			if (state.length === 1) {				
				const resource = element.substring(element.indexOf(' ')+1, element.length);
				const uri = Uri.joinPath(this.workspaceUri, resource);

				if(state === 'C' || state === 'U' || state === 'M') {
					
					state = await this.getStatusOfFile(resource);
				}
				this.sourceFiles.push(new SourceFile(uri, state));
			}			
		};

		console.log(this.sourceFiles);
	}

	async getStatusOfFile(resource: string): Promise<string> {
		const { exec } = require("child_process");
		const status = await new Promise<string>((resolve, reject) => {
			let result = '?';
			const cvsCmd = `cvs status ${resource}`;
			console.log(cvsCmd);
			exec(cvsCmd, {cwd: this.workspaceUri.fsPath}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					reject(error);
				} else {
					for (const element of stdout.split('\n')) {
						if (element.includes('Status:')) {
							result = element.split('Status: ')[1];
							resolve(result);
						}
					}
					resolve(result);
				}
			});
		});

		return status;
	}

	getChangesSourceFiles(): SourceFile[] {
		return this.sourceFiles;
	}
}

