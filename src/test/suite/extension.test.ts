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

	suiteSetup(async () => {  
		ext = vscode.extensions.getExtension("Schwartzkers.cvs-scm");

		if(ext) {
			await ext.activate();
			configManager = extension.configManager;			
			cvsRepository = new CvsRepository.CvsRepository(workspace, configManager);
		}
	});

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Confirm all changes found', async () => {
		await cvsRepository.getResources();

		if (cvsRepository.getChangesSourceFiles().length === 0) {
			assert.fail('No changes found in test repository');
		}

		for(const change of cvsRepository.getChangesSourceFiles()) {
			if( change.uri.fsPath.includes('src/foo.cpp')) {
				assert.strictEqual(change.state, SourceFile.SourceFileState.modified);
			} else if( change.uri.fsPath.includes('src/lala.cpp')) {
				assert.strictEqual(change.state, SourceFile.SourceFileState.added);
			} else if( change.uri.fsPath.includes('src/testFolder.cpp')) {
				assert.strictEqual(change.state, SourceFile.SourceFileState.untracked);
				assert.strictEqual(change.isFolder, true);
			} else if( change.uri.fsPath.includes('src/testFile.log')) {
				assert.strictEqual(change.state, SourceFile.SourceFileState.untracked);
				assert.strictEqual(change.isFolder, false);
			} else if( change.uri.fsPath.includes('src/wtf.cpp')) {
				assert.strictEqual(change.state, SourceFile.SourceFileState.untracked);
			}
		}
	});

});
