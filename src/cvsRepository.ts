import { QuickDiffProvider, Uri, CancellationToken, ProviderResult, workspace } from "vscode";
import { SourceFile, SourceFileState } from './sourceFile';
import { execCmd, spawnCmd } from './utility';
import { ConfigManager} from './configManager';
import { basename, dirname } from 'path';
import { EOL } from 'os';

export const CVS_SCHEME = 'cvs-scm';
export const CVS_SCHEME_COMPARE = 'cvs-scm-compare';

export class CvsRepository implements QuickDiffProvider {
	private _sourceFiles: SourceFile[];
	private _configManager: ConfigManager;

	constructor(private workspaceUri: Uri, configManager: ConfigManager) {
		this._sourceFiles = [];
		this._configManager = configManager;
	}

	provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
		if (token.isCancellationRequested) { return undefined; }

		if (workspace.getWorkspaceFolder(uri)) {
			return Uri.parse(`${CVS_SCHEME}:${uri.fsPath}`);
		}

		return undefined;
	}

	async getResources(): Promise<void> {
		let cvsCmd = `cvs -n -q update -d`;
		const update = await execCmd(cvsCmd, this.workspaceUri.fsPath, true);

		this._sourceFiles = []; // reset source files
		const sourceFilePromises = update.output.split(EOL).map(async (line) => await this.parseCvsUpdateOutput(line));
		await Promise.all(sourceFilePromises);
	}

	async parseCvsUpdateOutput(output: string): Promise<void> {
		const fs = require('fs/promises');
				
		const cvsResourceState = output.trim().substring(0, output.indexOf(' '));

		if (cvsResourceState.length === 1) {
			const cvsResourceRelPath = output.substring(output.indexOf(' ')+1, output.length);
			const sourceFile = new SourceFile(Uri.joinPath(this.workspaceUri, cvsResourceRelPath));
			if ( cvsResourceState !== '?') {
					await this.status(sourceFile);
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
			await this.status(sourceFile);
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

	async status(sourceFile: SourceFile): Promise<void> {
		const cvsCmd = `cvs status ${basename(sourceFile.uri.fsPath)}`;
		const status = await execCmd(cvsCmd, dirname(sourceFile.uri.fsPath));

		if (status.result && !status.output.includes("Status: Unknown")) {
			const sourceFileStatusPromises = status.output.split(/\r?\n|\r|\n/g).map(async (line) => await parseCvsStatusOutput(line, sourceFile));
			await Promise.all(sourceFileStatusPromises);
	
			// handle special case for locally deleted files
			if (sourceFile.state === SourceFileState.checkout &&
				sourceFile.workingRevision !== 'No') {
				sourceFile.setState("Locally Deleted");
			}
		}
	}

	async commit(message: string, changes: Uri[]): Promise<boolean> {
		// need sting of chnaged files relative to the workspace root
		let files= '';
		changes.forEach(uri => {
			files = files.concat(workspace.asRelativePath(uri, false) + ' ');
		});

		return (await spawnCmd(`cvs commit -m "${message}" ${files}`, this.workspaceUri.fsPath)).result;
	}

	async add(uri: Uri): Promise<boolean> {
		return (await spawnCmd(`cvs add ${basename(uri.fsPath)}`, dirname(uri.fsPath))).result;
	}

	async remove(uri: Uri): Promise<boolean> {
		return (await spawnCmd(`cvs remove -f ${basename(uri.fsPath)}`, dirname(uri.fsPath))).result;
	}

	async update(uri: Uri): Promise<boolean> {
		return (await spawnCmd(`cvs update ${basename(uri.fsPath)}`, dirname(uri.fsPath))).result;
	}

	async updateToRevision(uri: Uri | undefined, revision: string): Promise<boolean> {
		if (uri) {
			return (await spawnCmd(`cvs update -r ${revision} ${basename(uri.fsPath)}`, dirname(uri.fsPath))).result;
		} else {
			return (await spawnCmd(`cvs update -r ${revision}`, this.workspaceUri.fsPath)).result;
		}
	}

	async revert(uri: Uri | undefined): Promise<boolean> {
		if (uri) {
			return (await spawnCmd(`cvs update -C ${basename(uri.fsPath)}`, dirname(uri.fsPath))).result;
		} else {
			return (await spawnCmd(`cvs update -C`, this.workspaceUri.fsPath)).result;
		}
	}

	async updateBuildDirs(uri: Uri): Promise<boolean> {
		return (await spawnCmd(`cvs update -d ${basename(uri.fsPath)}`, dirname(uri.fsPath))).result;
	}

	async removeSticky(uri: Uri | undefined): Promise<boolean> {
		if (uri) {
			return (await spawnCmd(`cvs update -A ${basename(uri.fsPath)}`, dirname(uri.fsPath))).result;
		} else {
			return (await spawnCmd(`cvs update -A`, this.workspaceUri.fsPath)).result;
		}
	}

	getChangesSourceFiles(): SourceFile[] {
		return this._sourceFiles;
	}
}


export async function parseCvsStatusOutput(output: string, sourceFile: SourceFile): Promise<void> {
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
