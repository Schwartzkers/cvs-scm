import { scm, SourceControl, SourceControlResourceGroup, SourceControlResourceState,
         CancellationTokenSource, Uri, ExtensionContext, Command, Disposable,
         workspace, RelativePattern, window, commands, EventEmitter, Event } from 'vscode';
import { promises as fsPromises } from 'fs';
import { CvsRepository } from './cvsRepository';
import { SourceFileState, SourceFile } from './sourceFile';
import { CvsDocumentContentProvider } from './cvsDocumentContentProvider';
import { readDir, readFile, writeFile, deleteUri, createDir } from './utility';
import { dirname, basename } from 'path';
import { ConfigManager} from './configManager';
import { EOL } from 'os';
import { CommitData } from './cvsRevisionProvider';
import { BranchData } from './cvsBranchProvider';


export let onResouresLocked: EventEmitter<Uri> = new EventEmitter<Uri>();
export let onResouresUnlocked: EventEmitter<Uri> = new EventEmitter<Uri>();

export class CvsSourceControl implements Disposable {
    private cvsScm: SourceControl;
    private workspacefolder: Uri;
    private cvsDocumentContentProvider: CvsDocumentContentProvider;
    private stagedResources: SourceControlResourceGroup;
    private changedResources: SourceControlResourceGroup;
    private repositoryResources: SourceControlResourceGroup;
    private conflictResources: SourceControlResourceGroup;
    private unknownResources: SourceControlResourceGroup;
    private cvsRepository: CvsRepository;
    private timeout?: NodeJS.Timer;
    private stagedFiles: string[];
    private configManager: ConfigManager;
    private _startup: boolean = true;
    private _resourcesDirty: boolean = false;


    constructor(context: ExtensionContext,
            worspacefolder: Uri,
            cvsDocumentContentProvider: CvsDocumentContentProvider,
            configManager: ConfigManager) {
        this.cvsScm = scm.createSourceControl('cvs', 'CVS', worspacefolder);
        this.workspacefolder = worspacefolder;
        this.cvsDocumentContentProvider = cvsDocumentContentProvider;
        this.configManager = configManager;
        this.stagedResources = this.cvsScm.createResourceGroup('stagingTree', 'Staged Changes');
        this.changedResources = this.cvsScm.createResourceGroup('changeTree', 'Changes');
        this.repositoryResources = this.cvsScm.createResourceGroup('repositoryTree', 'Repository Changes');
        this.conflictResources = this.cvsScm.createResourceGroup('conflictTree', 'Conflicts');
        this.unknownResources = this.cvsScm.createResourceGroup('untrackedTree', 'Untracked');

        this.stagedResources.hideWhenEmpty = true;
        this.changedResources.hideWhenEmpty = true;
        this.repositoryResources.hideWhenEmpty = true;
        this.conflictResources.hideWhenEmpty = true;
        this.unknownResources.hideWhenEmpty = true;

        this.stagedFiles = [];
        
        this.cvsRepository = new CvsRepository(this.workspacefolder, this.configManager);
        this.cvsScm.quickDiffProvider = this.cvsRepository;
        this.cvsScm.inputBox.placeholder = 'Commit Message';

        const fileSystemWatcher = workspace.createFileSystemWatcher(new RelativePattern(this.workspacefolder, '**/*'));
        fileSystemWatcher.onDidChange(uri => this.onResourceChange(uri, false), context.subscriptions); // do not refresh diff for a save
        fileSystemWatcher.onDidCreate(uri => this.onResourceChange(uri), context.subscriptions);
        fileSystemWatcher.onDidDelete(uri => this.onResourceChange(uri), context.subscriptions);

        context.subscriptions.push(this.cvsScm);
        context.subscriptions.push(fileSystemWatcher);
    }

    getWorkspaceFolder(): Uri {
        return this.workspacefolder;
    }

    getCvsState(): void {
        this.onResourceChange(this.workspacefolder);
    }

    onResourceChange(uri: Uri, dirty: boolean = true): void {
        //console.log('onResourceChange: ' + uri.fsPath);

        let isDirty = false;

        if (!dirty) {
            // check if uri includes CVS folders
            // if a file has been saved there is no point in refreshing
            // unless not included in SCM yet
            if (uri.fsPath.includes('CVS/')) {
                isDirty = true;
            } else {
                let foundResource = false;
                const resources = this.changedResources.resourceStates.concat(this.stagedResources.resourceStates,
                                                                              this.unknownResources.resourceStates);
                for (const resource of resources) {
                    if (resource.resourceUri.fsPath === uri.fsPath) {
                        foundResource = true;
                        break;
                    }
                }
                
                if (!foundResource) {
                    isDirty = true;
                }
            } 
        }
        else {
            isDirty = true;
        }

        if (isDirty) {
            this._resourcesDirty = true;
            if (this.timeout) { clearTimeout(this.timeout); }
            this.timeout = setTimeout(() => this.getResourceChanges(uri), 300);
        }
    }

    async getResourceChanges(uri: Uri): Promise<void> {
        // emmit event to stop update of trees, status bar
        onResouresLocked.fire(this.workspacefolder);

        // add, delete, first local change or a CVS/ folder event
        await this.cvsRepository.getResources(); // only get resourcs on CVS changes?
        this.refreshScm();
        this._resourcesDirty = false;

        // update any diff editors currently opened as files may have been commited
        if (this._startup) {
            this._startup = false; // there's nothing to update on startup
        } else {
            const resources = this.changedResources.resourceStates.concat(this.conflictResources.resourceStates,
                                                                            this.stagedResources.resourceStates,
                                                                            this.repositoryResources.resourceStates);
            this.cvsDocumentContentProvider.updated(resources);
        }

        onResouresUnlocked.fire(this.workspacefolder);
    }

    refreshScm(): void {
        const stagedResources: SourceControlResourceState[] = [];
        const changedResources: SourceControlResourceState[] = [];
        const repositoryResources: SourceControlResourceState[] = [];
        const conflictResources: SourceControlResourceState[] = [];
        const unknownResources: SourceControlResourceState[] = [];
        
        this.cvsRepository.getChangesSourceFiles().forEach(element => {

            if (element.uri === undefined) { return; }

            // check if resource is staged
            let isStaged = false;            
            this.stagedFiles.forEach(resource => {
                if (resource === element.uri?.fsPath) {
                    isStaged = true;
                }
            });

            if(element.state === SourceFileState.modified)
            {
                const token = new CancellationTokenSource();
                const left = this.cvsRepository.provideOriginalResource!(element.uri, token.token);
                let right = element.uri;

                const command: Command =
                {
                    title: "Show changes",
                    command: "vscode.diff",
                    arguments: [left, right, `${basename(element.uri.fsPath)} (${this.changedResources.label})`],
                    tooltip: "Diff your changes"
                };

                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,
                    command: command,
                    contextValue: 'modified',
                    decorations: {
                        strikeThrough: false,
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/modified.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/modified.svg",
                        },
                        tooltip: "Locally Modified"
                    }};
                
                if (isStaged) {
                    stagedResources.push(resourceState);
                } else {
                    changedResources.push(resourceState);
                }
            } else if (element.state === SourceFileState.untracked)
            {
                let type = "untracked_file";
                let tip = "Unknown File";
                if (element.isFolder) {
                    type = "untracked_folder";
                    tip = "Unknown Folder";
                }

                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,
                    contextValue: type,
                    decorations: {
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/untracked.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/untracked.svg",
                        },
                        tooltip: tip
                    }};

                unknownResources.push(resourceState);
            } else if (element.state === SourceFileState.added) {
                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,
                    contextValue: "added",
                    decorations: {
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/added.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/added.svg",
                        },
                        tooltip: "Locally Added"
                    }};

                if (isStaged) {
                    stagedResources.push(resourceState);
                } else {
                    changedResources.push(resourceState);
                }
            } else if (element.state === SourceFileState.removed) {
                // cannot provide diff once "cvs remove" executed
                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,                    
                    contextValue: "removed",
                    decorations: {
                        strikeThrough: true,                        
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/removed.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/removed.svg",
                        },
                        tooltip: "Locally Removed"
                    }};

                if (isStaged) {
                    stagedResources.push(resourceState);
                } else {
                    changedResources.push(resourceState);
                }
            } else if (element.state === SourceFileState.deleted) {
                const token = new CancellationTokenSource();
                let left = this.cvsRepository.provideOriginalResource!(element.uri, token.token);
                let right = "";

                const command: Command =
                {
                    title: "Show changes",
                    command: "vscode.diff",
                    arguments: [left, right, `${basename(element.uri.fsPath)} (${this.changedResources.label})`],
                    tooltip: "View remote changes"
                };

                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,                    
                    contextValue: "deleted",
                    command: command,            
                    decorations: {
                        strikeThrough: true,                        
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/deleted.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/deleted.svg",
                        },
                        tooltip: "Deleted"
                    }};

                changedResources.push(resourceState);
            } else if (element.state === SourceFileState.conflict) {                
                const command: Command =
                {
                    title: "View conflicts",
                    command: "vscode.open",
                    arguments: [element.uri],
                    tooltip: "Open file"
                };

                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,
                    contextValue: "conflict",
                    command: command,
                    decorations: {
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/conflict.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/conflict.svg",
                        },
                        tooltip: "Contains Conflicts"
                    }};

                conflictResources.push(resourceState);
            } else if (element.state === SourceFileState.patch) {
                const token = new CancellationTokenSource();
                let left = this.cvsRepository.provideOriginalResource!(element.uri, token.token);
                let right = element.uri;

                const command: Command =
                {
                    title: "Show changes",
                    command: "vscode.diff",
                    arguments: [left, right, `${basename(element.uri.fsPath)} (${this.repositoryResources.label})`],
                    tooltip: "View remote changes"
                };

                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,
                    command: command,                
                    contextValue: "patch",
                    decorations: {                        
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/patch.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/patch.svg",
                        },
                        tooltip: "Needs Patch"
                    }};

                repositoryResources.push(resourceState);
            } else if (element.state === SourceFileState.merge) {
                const token = new CancellationTokenSource();
                let left = this.cvsRepository.provideOriginalResource!(element.uri, token.token);
                let right = element.uri;

                const command: Command =
                {
                    title: "Show changes",
                    command: "vscode.diff",
                    arguments: [left, right, `${basename(element.uri.fsPath)} (${this.repositoryResources.label})`],
                    tooltip: "View remote changes"
                };

                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,
                    command: command,
                    contextValue: "merge",
                    decorations: {                        
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/merge.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/merge.svg",
                        },
                        tooltip: "Needs Merge"
                    }};

                repositoryResources.push(resourceState);
            } else if (element.state === SourceFileState.checkout) {
                const token = new CancellationTokenSource();
                let left = this.cvsRepository.provideOriginalResource!(element.uri, token.token);
                let right = "";

                const command: Command =
                {
                    title: "Show changes",
                    command: "vscode.diff",
                    arguments: [left, right, `${basename(element.uri.fsPath)} (${this.repositoryResources.label})`],
                    tooltip: "View remote changes"
                };

                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,
                    command: command,
                    contextValue: "checkout",
                    decorations: {
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/checkout.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/checkout.svg",
                        },
                        tooltip: "Needs Checkout"
                    }};

                repositoryResources.push(resourceState);
            }
            else if (element.state === SourceFileState.removedFromRepo) {
                const token = new CancellationTokenSource();
                let left = "";
                let right = element.uri;

                const command: Command =
                {
                    title: "Show changes",
                    command: "vscode.diff",
                    arguments: [left, right, `${basename(element.uri.fsPath)} (${this.repositoryResources.label})`],
                    tooltip: "View remote changes"
                };

                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,
                    command: command,
                    contextValue: "removedFromRepo",
                    decorations: {
                        strikeThrough: true,
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/removed.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/removed.svg",
                        },
                        tooltip: "Removed from Repository"
                    }};

                repositoryResources.push(resourceState);
            } else if (element.state === SourceFileState.directory) {
                const resourceState: SourceControlResourceState = {
                    resourceUri: element.uri,
                    contextValue: "directory",
                    decorations: {
                        dark:{
                            iconPath: __dirname + "/../resources/icons/dark/folder.svg",
                        },
                        light: {
                            iconPath: __dirname + "/../resources/icons/light/folder.svg",
                        },
                        tooltip: "Folder found in Repository"
                    }};

                repositoryResources.push(resourceState);
            }        
        });
        
        this.stagedResources.resourceStates = stagedResources;
        this.changedResources.resourceStates = changedResources;
        this.repositoryResources.resourceStates = repositoryResources;
        this.conflictResources.resourceStates = conflictResources;
        this.unknownResources.resourceStates = unknownResources;
    }

    async commitAll(): Promise<void> {
        if (!this.stagedResources.resourceStates.length) {
            window.showErrorMessage("There are no staged changes to commit.");
            return;
        }
        else if (this.cvsScm.inputBox.value.length === 0) {
            window.showErrorMessage("Missing commit message.");
            return;
        }

        let changes: Uri[] = [];
        this.stagedResources.resourceStates.forEach(element => {
            changes.push(element.resourceUri);
        });

        const response = await this.cvsRepository.commit(this.cvsScm.inputBox.value, changes);
        if (response.result) {
            this.stagedFiles = [];
            this.cvsScm.inputBox.value = '';
        } else if (response.stderr.includes("Up-to-date check failed")) {
            window.showWarningMessage(`Unable to commit changes. Refresh of repository required. CVS ERROR "${response.stderr}"`);
        } else {
            window.showErrorMessage(`Failed to commit changes to repository. CVS ERROR "${response.stderr}"`);
        };
    }

    async stageFile(uri: Uri, refresh: boolean=true): Promise<void> {
        if (!this.stagedFiles.includes(uri.fsPath)) {
            // add to staging cache
            this.stagedFiles.push(uri.fsPath);
        }

        if (refresh) {
            this.refreshScm();
        }
    }

    async unstageFile(uri: Uri, refresh: boolean=true): Promise<void> {
        if (this.stagedFiles.includes(uri.fsPath)) {
            // remove from staging cache
            let index = this.stagedFiles.indexOf(uri.fsPath, 0);
            if (index > -1) {
                this.stagedFiles.splice(index, 1);
            }
        }

        if (refresh) {
            this.refreshScm();
        }
    }

    async stageAll(): Promise<void> {
        if (this.changedResources.resourceStates.length === 0) {
            window.showErrorMessage("There are no changes to stage.");
            return;
        }

        for (const resource of this.changedResources.resourceStates) {
            // automatically "cvs remove" any deleted files
            if (resource.contextValue === 'deleted') {
                await this.removeResource(resource.resourceUri);
            }
            this.stageFile(resource.resourceUri, false);
        };

        this.refreshScm();
    }

    async unstageAll(): Promise<void> {
        if (this.stagedResources.resourceStates.length === 0) {
            window.showErrorMessage("There are no changes to unstage.");
            return;
        }

        this.stagedFiles = [];
        this.refreshScm();
    }

    async forceRevert(uri: Uri): Promise<void> {
        if (await deleteUri(uri)) {
            await this.revertFile(uri);
        } else {
            window.showErrorMessage(`Failed to revert file to HEAD: ${basename(uri.fsPath)}`);
        }
    }

    async addResource(uri: Uri): Promise<void>  {
        const response = await this.cvsRepository.add(uri);
        if (!response.result) {
            window.showErrorMessage(`Failed to schedule file for addition: ${basename(uri.fsPath)}. CVS ERROR: "${response.stderr}"`);
        }
    }

    async removeResource(uri: Uri): Promise<void>  {
        const response = await this.cvsRepository.remove(uri);
        if (!response.result) {
            window.showErrorMessage(`Failed to schedule file for removal: ${basename(uri.fsPath)}. CVS ERROR: "${response.stderr}"`);
        }
    }

    async recoverResource(uri: Uri): Promise<void>  {
        this.unstageFile(uri, false); // in case staged

        const response = await this.cvsRepository.update(uri);
        if (!response.result) {
            window.showErrorMessage(`Failed to recover deleted file: ${basename(uri.fsPath)}. CVS ERROR: "${response.stderr}"`);
        }
    }

    async revertFile(uri: Uri): Promise<void> {
        this.unstageFile(uri, false); // in case staged

        const response = await this.cvsRepository.revert(uri);
        if(!response.result ) {
            window.showErrorMessage(`Failed to revert file to HEAD: ${basename(uri.fsPath)}. CVS ERROR: "${response.stderr}"`);
        }
    }

    async mergeLatest(uri: Uri): Promise<void>  {
        // cvs update will report output to stderr if merge results in conflicts
        // but will return pass (0 return code)
        //   rcsmerge: warning: conflicts during merge
        //   cvs update: conflicts found in newfile3.cpp
        // no errors with patching
        // no errors on checkout new file
        // stderr on removal "cvs update: `nov17.cpp' is no longer in the repository"
        const response = await this.cvsRepository.update(uri);
        if(!response.result) {
            window.showErrorMessage(`Failed to merge repository changes for file: ${basename(uri.fsPath)}. CVS ERROR: "${response.stderr}"`);
        }
    }

    // can only do this if file was untracked by repository
    async undoAdd(uri: Uri): Promise<void>  {
        this.unstageFile(uri, false); // in case staged

        let success = false;

        // 1. remove temp CVS file (e.g. 'test.txt,t') file may not exist on older cvs versions
        const files = await readDir(dirname(uri.fsPath) + '/CVS');
        if (files.length > 0) {
            for (const file of files) {
                if (file.includes(basename(uri.fsPath))) {
                    if (!(await deleteUri(Uri.parse(dirname(uri.fsPath) + '/CVS/' + file)))) {
                        console.warn('Failed to delete temp cvs file');
                    }
                    break;
                }
            }

            // 2. get lines from Entries to add to the new Entries file
            let newEntries = '';
            const lines = await readFile(dirname(uri.fsPath) + '/CVS/Entries');
            if (lines && lines.length > 0) {
                for (const line of lines.split(EOL)) {
                    // do not include the line in Entries to be discarded
                    if (line.includes(basename(uri.fsPath)) === false) {
                        newEntries = newEntries.concat(line + EOL);
                    }
                }
                success = true;
            }
            else {
                console.warn('Failed to read CVS/Entires');
            }

            // 3. create new Entries file and remove old Entires
            if (success) {
                success = false; // reset for next block of logic

                if (await writeFile(dirname(uri.fsPath) + '/CVS/Entries.out', newEntries) &&
                    await fsPromises.rename(dirname(uri.fsPath) + '/CVS/Entries', dirname(uri.fsPath) + '/CVS/Entries.bak') === undefined) {
                    if (await fsPromises.rename(dirname(uri.fsPath) + '/CVS/Entries.out', dirname(uri.fsPath) + '/CVS/Entries') === undefined) {
                        await fsPromises.unlink(dirname(uri.fsPath) + '/CVS/Entries.bak');
                        success = true;
                    }
                    else {
                        // attempt to revert to old Entries
                        await fsPromises.rename(dirname(uri.fsPath) + '/CVS/Entries.bak', dirname(uri.fsPath) + '/CVS/Entries');
                    }
                }

                if (!success) {
                    console.warn('Failed to update CVS/Entires');
                }
            }
        }

        if (!success) {
            window.showErrorMessage(`Failed to discard add of file: ${basename(uri.fsPath)}`);
        }
    }

    async deleteResource(uri: Uri): Promise<void>  {
        if (!(await deleteUri(uri))) {
            window.showErrorMessage(`Failed to delete: ${basename(uri.fsPath)}`);
        }
    }

    async ignoreFolder(uri: Uri): Promise<void>  {
        await this.configManager.updateIgnoreFolders(workspace.asRelativePath(uri, false));
    }

    async checkoutFolder(uri: Uri, isRecursive: boolean=true): Promise<void>  {
        let success = false;
        if ((await createDir(uri)) &&  // 1. make folder
            ((await this.cvsRepository.add(uri)).result)) { // 2. cvs add folder
                // 3. cvs update folder
                if (isRecursive){
                    success = (await this.cvsRepository.updateBuildDirs(uri)).result;
                } else {
                    success = (await this.cvsRepository.update(uri)).result;
                }
        }
        
        if (!success) {
            window.showErrorMessage(`Failed to checkout folder: ${basename(uri.fsPath)}`);
        }
    }

    async compareRevToWorkingFile(commitData: CommitData): Promise<void> {
        await commands.executeCommand('vscode.diff',
                                      commitData.resourceUri, commitData.uri,
                                      `${basename(commitData.uri.fsPath)} (${commitData.revision}) <-> (working)`
                                      );
    }

    async openRev(commitData: CommitData): Promise<void> {
        await commands.executeCommand('vscode.open',
                                      commitData.resourceUri,
                                       {},
                                      `${basename(commitData.uri.fsPath)} (${commitData.revision})`
                                      );
    }

    async switchFileToBranch(branchData: BranchData): Promise<void> {
        let result = (await this.cvsRepository.revert(branchData.uri)).result;

        if (result) {
            if (branchData.branchName === 'main') {
                result = (await this.cvsRepository.removeSticky(branchData.uri)).result;
            } else {
                result = (await this.cvsRepository.updateToRevision(branchData.uri, branchData.branchName)).result;
            }
        }

        if(!result) {
            window.showErrorMessage(`Failed to switch file: ${basename(branchData.uri.fsPath)} to branch: ${branchData.branchName}`);
        }
    }

    async switchWorkspaceToBranch(branchData: BranchData): Promise<void> {
        let result = (await this.cvsRepository.revert(undefined)).result;

        if (result) {
            if (branchData.branchName === 'main') {
                result = (await this.cvsRepository.removeSticky(undefined)).result;
            } else {
                result = (await this.cvsRepository.updateToRevision(undefined, branchData.branchName)).result;
            }
        }

        if(!result) {
            window.showErrorMessage(`Failed to switch workspace to branch: ${branchData.branchName}`);
        }
    }

    async switchFileToRevision(commitData: CommitData): Promise<void> {
        let result = (await this.cvsRepository.revert(commitData.uri)).result;

        if (result) {
            result = (await this.cvsRepository.updateToRevision(commitData.uri, commitData.revision)).result;
        }

        if(!result) {
            window.showErrorMessage(`Failed to switch file to revision: ${commitData.revision}`);
        }
    }

    async revertFileToRevision(commitData: CommitData): Promise<void> {
        let result = (await this.cvsRepository.revert(commitData.uri)).result;

        if (result) {
            result = (await this.cvsRepository.revertToRevision(commitData.uri, commitData.revision)).result;
        }

        if(!result) {
            window.showErrorMessage(`Failed to revert working file to revision: ${commitData.revision}`);
        }
    }

    async revertFileToHead(commitData: CommitData): Promise<void> {
        let result = (await this.cvsRepository.revert(commitData.uri)).result;

        if (result) {
            result = (await this.cvsRepository.removeSticky(commitData.uri)).result;
        }

        if(!result) {
            window.showErrorMessage(`Failed to revert working file to head revision: ${commitData.revision}`);
        }
    }

    async mergeBranch(sourceFile: SourceFile ,branchData: BranchData): Promise<void> {
        let result = (await this.cvsRepository.revert(undefined)).result;

        if (result && sourceFile.branch) {
            if (branchData.branchName === 'main') {
                result = (await this.cvsRepository.merge(sourceFile.branch,'HEAD')).result;
            } else {
                result = (await this.cvsRepository.merge(sourceFile.branch, branchData.branchName)).result;
            }
        }

        if(!result) {
            window.showErrorMessage(`Failed to merge workspace with branch: ${branchData.branchName}`);
        }
    }

    async getSourceFile(uri: Uri): Promise<SourceFile> {
        let sourceFile = this.cvsRepository.findSourceFile(uri);

        if (sourceFile === undefined) {
            sourceFile = await this.cvsRepository.createSourceFile(uri);
        }

        return sourceFile;
    }

    dispose() {
        this.cvsScm.dispose();
    }
}