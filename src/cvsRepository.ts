import { QuickDiffProvider, Uri, CancellationToken, ProviderResult, WorkspaceFolder, workspace, window, env } from "vscode";
import * as path from 'path';
import { SourceFile, SourceFileState } from './sourceFile';

export interface CvsResources {
	readonly resourceUri: Uri;
}

export class CvsRepository implements QuickDiffProvider {
	private sourceFiles: SourceFile[];

	constructor(private workspaceUri: Uri) {
		this.sourceFiles = []; 
	}

	provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
		
		//const relativePath = workspace.asRelativePath(uri.fsPath);

        const { exec } = require("child_process");
		
		exec("cvs -Q update -C -p README > cvsdiff", {cwd: '/home/jon/workspace/code/cvs-sandbox'/*uri.fsPath*/}, (error: any, stdout: any, stderr: any) => {
			if (error) {
				console.log(`error: ${error.message}`);
				return;
			}
			console.log(`stderr:\n ${stderr}`);
			console.log(`stdout:\n ${stdout}`);
		});

		return Uri.parse(`cvsdiff`);
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

	async getResources(): Promise<String> {
		const { exec } = require("child_process");

		const result = await new Promise<String>((resolve, reject) => {
			let cvsCmd = `cvs -n -q update`;
			console.log(this.workspaceUri.fsPath);
			exec(cvsCmd, {cwd: this.workspaceUri.fsPath}, (error: any, stdout: string, stderr: any) => {
				if (error) {
					reject(error);
				} else {					
					resolve(stdout);
				}
			});
		});

		return result;
	}

	parseResources(stdout: String): void {
		console.log('parseResources');
		const fs = require('fs/promises');
		this.sourceFiles = [];

		stdout.split('\n').forEach(element => {
			let line = element.substring(element.indexOf(' ')+1, element.length);
			let state = element.substring(0, element.indexOf(' '));
			console.log(state);
			if (line.length !== 0) {
				const uri = Uri.joinPath(this.workspaceUri, element.substring(element.indexOf(' ')+1, element.length));
				this.sourceFiles.push(new SourceFile(uri, state));
			}			
		});

		console.log(this.sourceFiles);
	}


	getChangesSourceFiles(): SourceFile[] {
		return this.sourceFiles;
	}
}

