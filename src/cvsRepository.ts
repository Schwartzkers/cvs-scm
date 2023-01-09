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
    private _sourceFilesCache = new Map</*relative workspace path*/ string, SourceFile>;

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
        this._sourceFiles = []; // reset cached source files

        let cvsCmd = `cvs -n -q update -d`;
        const response = await execCmd(cvsCmd, this.workspaceUri.fsPath, true);
        
        let tempFiles: SourceFile[] = [];
        const sourceFilePromises = response.output.split(EOL).map(async (line) => await this.parseCvsUpdateOutput(line, tempFiles));
        await Promise.all(sourceFilePromises);

        console.log(tempFiles.length);

        if (tempFiles.length > 0) {
            // get status for "most" files returned
            let resources: Uri[] = [];
            tempFiles.forEach(file => {
                if (file.uri &&
                    file.state !== SourceFileState.directory &&
                    file.state !== SourceFileState.untracked &&
                    file.state !== SourceFileState.added) {
                    resources.push(file.uri);
                } else {
                    this._sourceFiles.push(file);
                }
            });

            
            for (const resource of resources) {
                const status = await this.status(resource);
                
                if (status.length > 0) {
                    let sourceFile = new SourceFile(resource);
                    this.parseCvsStatusOutput(status, sourceFile);

                    // handle special case for locally deleted files
                    if (sourceFile.state === SourceFileState.checkout && sourceFile.workingRevision !== 'No') {
                        sourceFile.setState("Locally Deleted");
                    }
                    this._sourceFiles.push(sourceFile);
                }
            }
        }
    }

    // Example output from `cvs -n -q update -d`
    // R INSTALL.md
    // U Makefile
    // ? untrackedFile.log
    // ? untrackedFolder
    // RCS file: /home/jon/.cvsroot/schwartzkers/cvs-scm-example/gtest/testFile.cpp,v
    // retrieving revision 1.2
    // retrieving revision 1.3
    // Merging differences between 1.2 and 1.3 into testFile.cpp
    // rcsmerge: warning: conflicts during merge
    // cvs update: conflicts found in gtest/testFile.cpp
    // C gtest/testFile.cpp
    // U gtest/reports/report.xml
    // cvs update: warning: `interface/subfolder/Ifoo.hpp' was lost
    // U interface/subfolder/Ifoo.hpp
    // A src/addedFile.cpp
    // M src/foo.cpp
    // C src/main.cpp
    // cvs update: `tree/trunk1.cpp' is no longer in the repository
    // cvs update: New directory `tree/folder7-0' -- ignored
    async parseCvsUpdateOutput(output: string, sourceFiles: SourceFile[]): Promise<void> {
        const fs = require('fs/promises');
                
        const cvsResourceState = output.trim().substring(0, output.indexOf(' '));

        if (cvsResourceState.length === 1) {
            const cvsResourceRelPath = output.substring(output.indexOf(' ')+1, output.length);
            const sourceFile = new SourceFile(Uri.joinPath(this.workspaceUri, cvsResourceRelPath));
            if ( cvsResourceState === 'A') {
                sourceFile.setState("Locally Added");
            }
            else if ( cvsResourceState === '?') {
                sourceFile.setState("Unknown");
                // check if resource is a file or a folder?
                const uri = Uri.joinPath(this.workspaceUri, cvsResourceRelPath);
                const stat = await fs.lstat(uri.fsPath);
                if (!stat.isFile()) {
                    sourceFile.isFolder = true;
                }
            }
            sourceFiles.push(sourceFile);
        } else if (output.includes('is no longer in the repository')) {
            // example output = cvs update: `tree/trunk1.cpp' is no longer in the repository
            const cvsResourceRelPath = output.substring(output.indexOf('`')+1, output.indexOf('\''));
            let sourceFile = new SourceFile(Uri.joinPath(this.workspaceUri, cvsResourceRelPath));
            sourceFile.setState('Entry Invalid');
            sourceFiles.push(sourceFile);
        } else if (output.includes(`cvs update: New directory`)) {
            // example output = "cvs update: New directory `NewFolder2' -- ignored"
            let folderRelPath = output.slice(output.indexOf("`")+1, output.indexOf("'"));
            if (!this._configManager.getIgnoreFolders().includes(folderRelPath)) {
                let sourceFile = new SourceFile(Uri.joinPath(this.workspaceUri, folderRelPath));
                sourceFile.isFolder = true;
                sourceFile.setState("New Directory");
                sourceFiles.push(sourceFile);
            }
        }
    }

    findSourceFile(uri: Uri): SourceFile | undefined {
        for (const file of this._sourceFiles) {
            if (file.uri?.fsPath === uri.fsPath) {
                return file;
            }
        };
    }

    async createSourceFile(uri: Uri): Promise<SourceFile> {
        console.log('createSourceFile');
        let sourceFile = new SourceFile(uri);
        this.parseCvsStatusOutput(await this.status(uri), sourceFile);

        this._sourceFiles.push(sourceFile);
        return sourceFile;
    }

    async status(uri: Uri): Promise<string> {
        // need string file relative to the workspace root
        let file = workspace.asRelativePath(uri, false);

        const cvsCmd = `cvs status ${file}`;
        return (await spawnCmd(cvsCmd, this.workspaceUri.fsPath)).output;
    }

    async commit(message: string, changes: Uri[]): Promise<boolean> {
        // need sting of changed files relative to the workspace root
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

    parseCvsStatusOutput(output: string, sourceFile: SourceFile) {
        // ===================================================================
        // File: Makefile          Status: Needs Patch
    
        // Working revision:    1.1     2022-11-03 08:15:12 -0600
        // Repository revision: 1.2     /home/user/.cvsroot/schwartzkers/cvs-scm-example/Makefile,v
        // Commit Identifier:   1006377FE10849CE253
        // Sticky Tag:          (none)
        // Sticky Date:         (none)
        // Sticky Options:      (none)

        // cvs status: `tree/trunk1.cpp' is no longer in the repository
        // ===================================================================
        // File: trunk1.cpp        Status: Entry Invalid
        
        //    Working revision:    1.1     2022-11-08 09:03:45 -0700
        //    Repository revision: 1.2     /home/jon/.cvsroot/schwartzkers/cvs-scm-example/tree/Attic/trunk1.cpp,v
        //    Commit Identifier:   1006377FE10849CE253
        //    Sticky Tag:          (none)
        //    Sticky Date:         (none)
        //    Sticky Options:      (none)
    
        for (const line of output.split(EOL)) {
            if (line.includes('Status:')) {
                const state = line.trim().split('Status: ')[1];
                sourceFile.setState(state);

                if (sourceFile.state === SourceFileState.untracked ||
                    sourceFile.state === SourceFileState.added) {
                        break;
                }

                continue;
            }
            else if (line.includes('Working revision:')) {
                sourceFile.workingRevision = line.trim().split(/\s+/)[2];
                continue;
            }
            else if (line.includes('Repository revision:')) {
                const repoLine = line.trim().split(/\s+/);
                sourceFile.repoRevision = repoLine[2];
                continue;
            }
            else if (line.includes('Sticky Tag:')) {
                let branch = line.trim().split(/\s+/)[2];
                if (branch === '(none)') {
                    branch = 'main';
                }
                sourceFile.branch = branch;
                continue;
            }
        }
    }
}
