import { QuickDiffProvider, Uri, CancellationToken, ProviderResult, WorkspaceFolder, workspace, window, env } from "vscode";
import * as path from 'path';
import { SourceFile, SourceFileState } from './sourceFile';

// export interface CvsResources {
// 	readonly resourceUri: Uri;
// }


export class CvsFile {
	constructor(public uri: Uri, public version?: number, public text?: string) { }
}

export const CVS_SCHEME = 'cvs';

export class CvsRepository implements QuickDiffProvider {
	private sourceFiles: SourceFile[];

	constructor(private workspaceUri: Uri) {
		this.sourceFiles = []; 
	}

	provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
		console.log('provideOriginalResource');
		
		// const { exec } = require("child_process");

		// let cvsCmd = `cvs -Q update -C -p ${path.basename(uri.fsPath)} > /tmp/${path.basename(uri.fsPath)}.HEAD`;
		// exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: any, stderr: any) => {
		// 	if (error) {
		// 		console.log(`error: ${error.message}`);
		// 		return;
		// 	}
		// });

		// return Uri.parse(`/tmp/${path.basename(uri.fsPath)}.HEAD`);

		return Uri.parse(`${CVS_SCHEME}:${path.basename(uri.fsPath)}`);
	}

	getHeadVersion(uri: Uri): Uri {
		const { exec } = require("child_process");

		let cvsCmd = `cvs -Q update -C -p ${path.basename(uri.fsPath)} > /tmp/${path.basename(uri.fsPath)}.HEAD`;
		exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: any, stderr: any) => {
			if (error) {
				console.log(`error: ${error.message}`);
				return;
			}
		});

		return Uri.parse(`/tmp/${path.basename(uri.fsPath)}.HEAD`);
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
		console.log('parseResources');
		const fs = require('fs/promises');
		this.sourceFiles = [];

		for (const element of stdout.split('\n')) {
		//await stdout.split('\n').forEach(async element => { should do promise all
			let state = element.substring(0, element.indexOf(' '));
			console.log(state);
			if (state.length === 1) {				
				const resource = element.substring(element.indexOf(' ')+1, element.length);
				const uri = Uri.joinPath(this.workspaceUri, resource);

				if(state === 'C' || state === 'U' || state === 'M') {
					
					state = await this.getStatusOfFile(resource);
				}
				
				console.log('state: ' + state + ' => resource: ' + resource);
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
					console.log(stdout);
					for (const element of stdout.split('\n')) {
						if (element.includes('Status:')) {
							result = element.split('Status: ')[1];
							console.log(result);
							resolve(result);
						}
					}
					resolve(result);
				}
			});
		});

		// Promise.
		// all([1, 2, 3].map(async() => {
		// 	await new Promise(resolve => setTimeout(resolve, 10));
		// 	throw new Error('Oops!');
		// })).
		// catch(err => {
		// 	err.message; // Oops!
		// });

		// for (const element of result.split('\n')) {
		// 	if (element.includes('Status:')) {
		// 		status = element.split('Status:')[1];
		// 		console.log(status);
		// 	}
		// }

		return status;
	}

	getChangesSourceFiles(): SourceFile[] {
		return this.sourceFiles;
	}
}

