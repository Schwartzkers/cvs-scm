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

	// var listener1 = function(event: vscode.FileCreateEvent)  {
	// 	console.log('FileCreateEvent', event);
	// 	const changedResources: vscode.SourceControlResourceState[] = [];
	// 	for(let i = 0; i < event.files.length; i++) {
	// 		const resourceState: vscode.SourceControlResourceState = {resourceUri: event.files[i]};
	// 		changedResources.push(resourceState);
	// 		//workingTree.resourceStates = changedResources;
	// 		workingTree.resourceStates = workingTree.resourceStates.concat(changedResources);
	// 		console.log(workingTree.resourceStates.push());
	// 	}
	//   };

	// var listener2 = function(event: vscode.TextDocumentWillSaveEvent) {
	// 	console.log(event.document.fileName);
	// 	const changedResources: vscode.SourceControlResourceState[] = [];
	// 	const resourceState: vscode.SourceControlResourceState = {resourceUri: vscode.Uri.parse(event.document.fileName)};
	// 	changedResources.push(resourceState);
	// 	workingTree.resourceStates = workingTree.resourceStates.concat(changedResources);
	// 	//console.log(workingTree.resourceStates.push({resourceUri: vscode.Uri.parse(event.document.fileName)}));
	// 	console.log(workingTree.resourceStates.length);
	// };

	  
	// start listening
	// var subscription1 = vscode.workspace.onDidCreateFiles(listener1, context.subscriptions);
	// var subscription2 = vscode.workspace.onWillSaveTextDocument(listener2, context.subscriptions);


	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let start = vscode.commands.registerCommand('cvs-ext.start', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Starting CVS Extenstion');
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

	let compare = vscode.commands.registerCommand('cvs-ext.compare', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Compare');

        const { exec } = require("child_process");

		exec("cvs -Q update -C -p README > cvsdiff", {cwd: '/home/jon/workspace/code/cvs-sandbox'}, (error: any, stdout: any, stderr: any) => {
			if (error) {
				console.log(`error: ${error.message}`);
				return;
			}
			console.log(`stderr:\n ${stderr}`);
			console.log(`stdout:\n ${stdout}`);
		});

		let left = vscode.Uri.file('/home/jon/workspace/code/cvs-sandbox/cvsdiff');
		let right = vscode.Uri.file('/home/jon/workspace/code/cvs-sandbox/README');

		vscode.commands.executeCommand('vscode.diff', left, right);

	});

	let diff = vscode.commands.registerCommand('cvs-ext.diff', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Diffable');
	});


	context.subscriptions.push(start);
	context.subscriptions.push(diff);
	context.subscriptions.push(status);
	context.subscriptions.push(compare);
}

// this method is called when your extension is deactivated
export function deactivate() {}
