/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Schwartzkers. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, workspace, ConfigurationChangeEvent, ExtensionContext, Disposable, commands, Event } from "vscode";

const GLOB_IGNORE_CVS_FOLDER = '**/CVS';
const GLOB_IGNORE_CVS_VERSION_FILES = '**/.#*';

export class ConfigManager {
    private _ignoreFolders: string[];
    private _enableFileHistory: boolean;
    private _enableFileBranches: boolean;
    private _enableBranches: boolean;
    private _timeout: number;

    constructor() {
        this._ignoreFolders = [];
        this._enableFileHistory = false;
        this._enableFileBranches = false;
        this._enableBranches = false;
        this._timeout = 60;

        this.loadConfiguration();

        //workspace.onDidChangeConfiguration(event => this.configurationChange(event), context.subscriptions);
    }

    loadConfiguration(): void {
        this.readIgnoreFolders();
        this.readFileHistorySetting();
        this.readFileBranchesSetting();
        this.readBranchesSetting();
        this.readTimeoutSetting();
    }

    async configurationChange(event: ConfigurationChangeEvent): Promise<void> {
        if (event.affectsConfiguration("update.ignoreFolders")) {
            this.readIgnoreFolders();
            await commands.executeCommand<Uri>("cvs-scm.refresh", undefined);
        } else if (event.affectsConfiguration("views.fileHistory.enable")) {
            this.readFileHistorySetting();
            return;
        } else if (event.affectsConfiguration("views.fileBranches.enable")) {
            this.readFileBranchesSetting();
            return;
        } else if (event.affectsConfiguration("views.branches.enable")) {
            this.readBranchesSetting();
            return;
        } else if (event.affectsConfiguration("server.timeout")) {
            this.readTimeoutSetting();
            return;
        }
    }

    getIgnoreFolders(): string[] {
        return this._ignoreFolders;
    }

    getFileHistoryEnableFlag(): boolean {
        return this._enableFileHistory;
    }

    getFileBranchesEnableFlag(): boolean {
        return this._enableFileBranches;
    }

    getBranchesEnableFlag(): boolean {
        return this._enableBranches;
    }

    getTimeoutValue(): number {
        return this._timeout;
    }

    async updateIgnoreFolders(folderRelativePath: string): Promise<void> {
        this.readIgnoreFolders(); // refresh list to enusre nothing is missing
        this._ignoreFolders.push(folderRelativePath);
        await workspace.getConfiguration("update").update("ignoreFolders", this._ignoreFolders);
    }

    private readIgnoreFolders(): void {
        let config = workspace.getConfiguration("update").get("ignoreFolders");
        if (config !== undefined) {
            this._ignoreFolders = config as Array<string>;
        }
    }

    private readFileBranchesSetting(): void {
        let config = workspace.getConfiguration("views.fileBranches").get("enable");
        if (config !== undefined) {
            this._enableFileBranches = config as boolean;
        }
    }

    private readBranchesSetting(): void {
        let config = workspace.getConfiguration("views.branches").get("enable");
        if (config !== undefined) {
            this._enableBranches = config as boolean;
        }
    }

    private readFileHistorySetting(): void {
        let config = workspace.getConfiguration("views.fileHistory").get("enable");
        if (config !== undefined) {
            this._enableFileHistory = config as boolean;
        }
    }

    private readTimeoutSetting(): void {
        let config = workspace.getConfiguration("server").get("timeout");
        if (config !== undefined) {
            this._timeout = config as number;
        }
    }
}