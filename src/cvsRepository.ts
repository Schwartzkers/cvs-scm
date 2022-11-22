import { QuickDiffProvider, Uri, CancellationToken, ProviderResult } from "vscode";
import { SourceFile, SourceFileState } from './sourceFile';
import { execCmd } from './utility';
import { ConfigManager} from './configManager';
import { basename, dirname } from 'path';



export const CVS_SCHEME = 'cvs-scm';

export class CvsRepository implements QuickDiffProvider {
	private _sourceFiles: SourceFile[];
	private _configManager: ConfigManager;

	constructor(private workspaceUri: Uri, configManager: ConfigManager) {
		this._sourceFiles = [];
		this._configManager = configManager;
	}

	provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
		if (token.isCancellationRequested) { return undefined; }
		return Uri.parse(`${CVS_SCHEME}:${uri.fsPath}`);
	}

	async getResources(): Promise<void> {
		let cvsCmd = `cvs -n -q update -d`;
		const update = await execCmd(cvsCmd, this.workspaceUri.fsPath, true);

		this._sourceFiles = []; // reset source files
		const sourceFilePromises = update.output.split(/\r?\n|\r|\n/g).map(async (line) => await this.parseCvsUpdateOutput(line));
		await Promise.all(sourceFilePromises);
	}

	async parseCvsUpdateOutput(output: string): Promise<void> {
		const fs = require('fs/promises');
				
		const cvsResourceState = output.trim().substring(0, output.indexOf(' '));

		if (cvsResourceState.length === 1) {				
			const cvsResourceRelPath = output.substring(output.indexOf(' ')+1, output.length);
			const sourceFile = new SourceFile(Uri.joinPath(this.workspaceUri, cvsResourceRelPath));
			if ( cvsResourceState !== '?') {
					await this.getStatusOfFile(sourceFile);
			} else {
				sourceFile.setState("Unknown");
				// check if resource is a file or a folder?
				var uri = Uri.joinPath(this.workspaceUri, cvsResourceRelPath);
				const stat = await fs.lstat(uri.fsPath);
				if (!stat.isFile()) {
					sourceFile.isFolder = true;
				}			
			}
			this._sourceFiles.push(sourceFile);				
		} else if (output.includes('is no longer in the repository')) {
			// example output = cvs update: `tree/trunk1.cpp' is no longer in the repository
			const cvsResourceRelPath = output.substring(output.indexOf('`')+1, output.indexOf('\''));
			let sourceFile = new SourceFile(Uri.joinPath(this.workspaceUri, cvsResourceRelPath));
			await this.getStatusOfFile(sourceFile);
			this._sourceFiles.push(sourceFile);
		} else if (output.includes(`cvs update: New directory`)) {
			// example output = "cvs update: New directory `NewFolder2' -- ignored"
			let folderRelPath = output.slice(output.indexOf("`")+1, output.indexOf("'"));
			if (!this._configManager.getIgnoreFolders().includes(folderRelPath)) {
				let sourceFile = new SourceFile(Uri.joinPath(this.workspaceUri, folderRelPath));
				sourceFile.isFolder = true;
				sourceFile.setState("New Directory");
				this._sourceFiles.push(sourceFile);
			}
		}
	}

	async getStatusOfFile(sourceFile: SourceFile): Promise<void> {
		const cvsCmd = `cvs status ${basename(sourceFile.uri.fsPath)}`;
		const status = await execCmd(cvsCmd, dirname(sourceFile.uri.fsPath));

		if (status.result && !status.output.includes("Status: Unknown")) {
			const sourceFileStatusPromises = status.output.split(/\r?\n|\r|\n/g).map(async (line) => await this.parseCvsStatusOutput(line, sourceFile));
			await Promise.all(sourceFileStatusPromises);
	
			// handle special case for locally deleted files
			if (sourceFile.state === SourceFileState.checkout &&
				sourceFile.workingRevision !== 'No') {
				sourceFile.setState("Locally Deleted");
			}
		}
	}

	async parseCvsStatusOutput(output: string, sourceFile: SourceFile): Promise<void> {
		// cvs status example outout
		// ===================================================================
		// File: Makefile          Status: Needs Patch

		// Working revision:    1.1     2022-11-03 08:15:12 -0600
		// Repository revision: 1.2     /home/user/.cvsroot/schwartzkers/cvs-scm-example/Makefile,v
		// Commit Identifier:   1006377FE10849CE253
		// Sticky Tag:          (none)
		// Sticky Date:         (none)
		// Sticky Options:      (none)

		if (output.includes('Status:')) {
			const state = output.trim().split('Status: ')[1];
			sourceFile.setState(state);
		}
		else if (output.includes('Working revision:')) {
			sourceFile.workingRevision = output.trim().split(/\s+/)[2];
		}
		else if (output.includes('Repository revision:')) {
			sourceFile.repoRevision = output.trim().split(/\s+/)[2];
		}
		else if (output.includes('Sticky Tag:')) {
			let branch = output.trim().split(/\s+/)[2];
			if (branch === '(none)') {
				branch = 'main';
			}
			sourceFile.branch = branch;
		}
	}

	getChangesSourceFiles(): SourceFile[] {
		return this._sourceFiles;
	}
}

