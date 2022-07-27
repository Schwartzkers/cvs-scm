import { QuickDiffProvider, Uri, CancellationToken, ProviderResult, WorkspaceFolder, workspace, window, env } from "vscode";
import * as path from 'path';


export class CvsRepository implements QuickDiffProvider {

	//constructor(private workspaceFolder: WorkspaceFolder) { }

    constructor() { }

	provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
		//const relativePath = workspace.asRelativePath(uri.fsPath);

        const { exec } = require("child_process");

		exec("cvs -Q update -C -p README > /tmp/cvsdiff", {cwd: uri.fsPath}, (error, stdout, stderr) => {
			if (error) {
				console.log(`error: ${error.message}`);
				return;
			}
			console.log(`stderr:\n ${stderr}`);
			console.log(`stdout:\n ${stdout}`);
		});

		return Uri.parse(`tmp/cvsdiff`);
	}
}
