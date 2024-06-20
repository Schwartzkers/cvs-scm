/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Schwartzkers. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as Mocha from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as CvsRepository from '../../cvsRepository';
import * as ConfigManager from '../../configManager';
import * as SourceFile from '../../sourceFile';
import * as extension from '../../extension';


suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	let ext: vscode.Extension<any> | undefined;
	let configManager: ConfigManager.ConfigManager;
	let cvsRepository: CvsRepository.CvsRepository;
	const workspace = vscode.Uri.parse('/home/jon/src/schwartzkers/cvs-scm-example');
	let resourceMap = new Map();

	suiteSetup(async () => {  
		ext = vscode.extensions.getExtension("Schwartzkers.cvs-scm");

		if(ext) {
			await ext.activate();
			configManager = extension.configManager;			
			cvsRepository = new CvsRepository.CvsRepository(workspace, configManager);

			resourceMap.set("src/foo.cpp", SourceFile.SourceFileState.modified);
			resourceMap.set("src/addedFile.cpp", SourceFile.SourceFileState.added);
			resourceMap.set("untrackedFolder", SourceFile.SourceFileState.untracked);
			resourceMap.set("untrackedFile.log", SourceFile.SourceFileState.untracked);
			resourceMap.set("INSTALL.md", SourceFile.SourceFileState.removed);
			resourceMap.set("interface/subfolder/Ifoo.hpp", SourceFile.SourceFileState.deleted);
			resourceMap.set("Makefile", SourceFile.SourceFileState.patch);
			resourceMap.set("gtest/testFile.cpp", SourceFile.SourceFileState.merge);
			resourceMap.set("gtest/reports/report.xml", SourceFile.SourceFileState.checkout);
			resourceMap.set("tree/folder7-0", SourceFile.SourceFileState.directory);
			resourceMap.set("tree/trunk1.cpp", SourceFile.SourceFileState.removedFromRepo);
			resourceMap.set("src/main.cpp", SourceFile.SourceFileState.conflict);
		}
	});

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Confirm all changes found', async () => {
		await cvsRepository.getResources();

		if (cvsRepository.getChangesSourceFiles().length === 0) {
			assert.fail('No changes found in test repository: ' + cvsRepository.getChangesSourceFiles().length);
		}
		
		assert.strictEqual(cvsRepository.getChangesSourceFiles().length, 12); // expecting 12 changes in repo

		resourceMap.forEach((value: SourceFile.SourceFileState, key: string) => {
			let foundChange = false;
			for(const change of cvsRepository.getChangesSourceFiles()) {
				if (change.uri?.fsPath.includes(key)) {
					foundChange = true;
					assert.strictEqual(change.state, value);

					if (key === 'untrackedFolder' || key === 'tree/folder7-0') {
						assert.strictEqual(change.isFolder, true);
					} else {
						assert.strictEqual(change.isFolder, false);
					}
				}
			}
			assert.strictEqual(foundChange, true); //must find all changes
		});
	});

});
