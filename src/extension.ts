// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { CvsSourceControl } from './cvsSourceControl';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "cvs-ext" is now active!');

	//const cvsSCM = vscode.scm.createSourceControl('cvs', 'CVS');
	//cvsSCM.inputBox.placeholder = 'cvs commit message';
	//var workingTree = cvsSCM.createResourceGroup('working-tree','Changes');
	const cvsSCM = new CvsSourceControl(context);


	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let start = vscode.commands.registerCommand('cvs-ext.start', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Starting CVS Extenstion');
		cvsSCM.getCvsState();
	});

	let status = vscode.commands.registerCommand('cvs-ext.status', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Status');

		const { exec } = require("child_process");

		exec("cvs status", {cwd: '/home/jon/workspace/code'}, (error: any, stdout: any, stderr: any) => {
			if (error) {
				console.log(`error: ${error.message}`);
				return;
			}
			console.log(`stderr:\n ${stderr}`);
			console.log(`stdout:\n ${stdout}`);
		});

	});
//vscode.commands.registerCommand("bla", (arg1: any, arg2: any) => {});
	let commit = vscode.commands.registerCommand('cvs-ext.commit', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Commit');
		cvsSCM.commitAll();
	});

	let revert = vscode.commands.registerCommand('cvs-ext.revert', (resource: vscode.SourceControlResourceState) => {
		console.log(resource.resourceUri);
		cvsSCM.revertFile(resource.resourceUri);

		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Revert');
	});


	let diff = vscode.commands.registerCommand('cvs-ext.diff', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Diffable');
	});


	context.subscriptions.push(start);
	context.subscriptions.push(diff);
	context.subscriptions.push(status);
	context.subscriptions.push(commit);
}

// this method is called when your extension is deactivated
export function deactivate() {}
