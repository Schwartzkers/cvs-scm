import { QuickDiffProvider, Uri, CancellationToken, ProviderResult, WorkspaceFolder, workspace, window, env } from "vscode";
import * as path from 'path';


export class CvsRepository implements QuickDiffProvider {

	//constructor(private workspaceFolder: WorkspaceFolder) { }

    constructor() { }

	provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
		//const relativePath = workspace.asRelativePath(uri.fsPath);

        const { exec } = require("child_process");

		exec("cvs -Q update -C -p README > cvsdiff", {cwd: '/home/jon/workspace/code/cvs-sandbox'/*uri.fsPath*/}, (error, stdout, stderr) => {
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
		console.log(uri.fsPath);
		console.log(path.dirname(uri.fsPath));
		console.log(path.basename(uri.fsPath));

		const { exec } = require("child_process");

		let cvsCmd = `cvs -Q update -C -p ${path.basename(uri.fsPath)} > cvsdiff`;
		exec(cvsCmd, {cwd: path.dirname(uri.fsPath)}, (error: any, stdout: any, stderr: any) => {
			if (error) {
				console.log(`error: ${error.message}`);
				return;
			}
			console.log(`stderr:\n ${stderr}`);
			console.log(`stdout:\n ${stdout}`);
		});

		return Uri.parse(`${path.dirname(uri.fsPath)}/cvsdiff`);
	}
}

