import { Uri, workspace, ConfigurationChangeEvent, ExtensionContext, Disposable, commands, Event } from "vscode";

const GLOB_IGNORE_CVS_FOLDER = '**/CVS';
const GLOB_IGNORE_CVS_VERSION_FILES = '**/.#*';

export class ConfigManager {
	private _ignoreFolders: string[];
    private _enableFileHistory: boolean;

    constructor() {
		this._ignoreFolders = [];
        this._enableFileHistory = false;

		this.loadConfiguration();

        //workspace.onDidChangeConfiguration(event => this.configurationChange(event), context.subscriptions);
	}

	loadConfiguration(): void {
        this.readIgnoreFolders();
        this.readFileHistorySetting();
	}

    async configurationChange(event: ConfigurationChangeEvent): Promise<void> {
		if (event.affectsConfiguration("update.ignoreFolders")) {
			this.readIgnoreFolders();
		} else if (event.affectsConfiguration("fileHistory.enable")) {
            this.readFileHistorySetting();
            return;
        }
        await commands.executeCommand<Uri>("cvs-scm.refresh", undefined);
	}

    getIgnoreFolders(): string[] {
        return this._ignoreFolders;
    }

    getFileHistoryEnableFlag(): boolean {
        return this._enableFileHistory;
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

    private readFileHistorySetting(): void {
        let config = workspace.getConfiguration("fileHistory").get("enable");
		if (config !== undefined) {
			this._enableFileHistory = config as boolean;
		}
    }
}