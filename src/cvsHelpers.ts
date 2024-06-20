/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Schwartzkers. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';
import { readFile } from './utility';


export async function readCvsRepoFile(workspaceUri: Uri): Promise<string> {
    const file = Uri.joinPath(workspaceUri, 'CVS/Repository');
    let repo = await readFile(file.fsPath);

    if (repo) {
        return repo.trim();
    } else{
        return '?';
    }
}

export async function readCvsTagFile(workspaceUri: Uri): Promise<string> {
    const file = Uri.joinPath(workspaceUri, 'CVS/Tag');
    let tag = await readFile(file.fsPath);

    if (tag) {
        return tag.substring(1).trim();
    } else{
        return 'main';
    }
}
