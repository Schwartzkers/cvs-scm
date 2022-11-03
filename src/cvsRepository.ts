import { QuickDiffProvider, Uri, CancellationToken, ProviderResult, workspace } from "vscode";
import { SourceFile, SourceFileState } from './sourceFile';
import { runCvsCmd } from './utility';
import { ConfigManager} from './configManager';
import { basename, dirname } from 'path';


export class CvsFile {
	constructor(public uri: Uri, public version?: number, public text?: string, public state?: SourceFileState) { }
}

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
		const result = await runCvsCmd(cvsCmd, this.workspaceUri.fsPath, true);
		await this.parseResources(result.output);
	}

	async parseResources(stdout: string): Promise<void> {
		const fs = require('fs/promises');
		this._sourceFiles = [];

		for (const element of stdout.split('\n').map(e=>e.trim())) {
		//await stdout.split('\n').forEach(async element => { should do promise all
			let state = element.substring(0, element.indexOf(' '));
			if (state.length === 1) {				
				const path = element.substring(element.indexOf(' ')+1, element.length);
				let sourceFile = new SourceFile(Uri.joinPath(this.workspaceUri, path));
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
				this._sourceFiles.push(sourceFile);				
			} else if (element.includes('is no longer in the repository')) {
				// file has been removed from repository
				const path = element.substring(element.indexOf('`')+1, element.indexOf('\''));
				let sourceFile = new SourceFile(Uri.joinPath(this.workspaceUri, path));
				await this.getStatusOfFile(sourceFile);
				this._sourceFiles.push(sourceFile);
			} else if (element.includes(`cvs update: New directory`)) {
				// example output = "cvs update: New directory `NewFolder2' -- ignored"
				let folder = element.slice(element.indexOf("`")+1, element.indexOf("'"));
				if (!this._configManager.getIgnoreFolders().includes(folder)) {
					let sourceFile = new SourceFile(Uri.joinPath(this.workspaceUri, folder));
					sourceFile.isFolder = true;
					sourceFile.setState("New Directory");
					this._sourceFiles.push(sourceFile);
				}
			}
		};
	}

	async getStatusOfFile(sourceFile: SourceFile): Promise<void> {
		const cvsCmd = `cvs status ${basename(sourceFile.uri.fsPath)}`;
		const status = await runCvsCmd(cvsCmd, dirname(sourceFile.uri.fsPath));

		if (status.result && !status.output.includes("Status: Unknown")) {
			for (const element of status.output.split('\n').map(e=>e.trim())) {

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
	}

	getChangesSourceFiles(): SourceFile[] {
		return this._sourceFiles;
	}
}

