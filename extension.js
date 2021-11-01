// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const axios = require('axios');
const path = require('path');
const fs = require('fs');


function showStatusMessage(message){
    vscode.window.setStatusBarMessage(message, 1500);
}

async function exportEntries(){
    try{
        const editor = vscode.window.activeTextEditor;
        const url = 'http://localhost:23119/better-bibtex/json-rpc';

        var currentlyOpenTabfilePath = editor.document.uri.fsPath;
        var bibName;
    
        // Current file tab is not saved.
        if(currentlyOpenTabfilePath.indexOf('Untitled')!=-1){
            throw new Error('Please SAVE Current Tab.');
        }
        
        // Ask for bib file name
        await vscode.window.showInputBox({prompt: 'File Name:', placeHolder: 'ref.bib'}).then(value => {
            bibName = value;
        });

        if (bibName === undefined){
            throw new Error('Cancelled.');
        }
    
        // Create bib Path
        var parentDir = path.dirname(currentlyOpenTabfilePath);
        var bibPath = path.join(parentDir, bibName);
    
        // Get the document text
        const content = editor.document.getText();
        const refPattern = /\[@(\w+)\]/g;
        // const url = 'http://127.0.0.1:23119/better-bibtex/cayw?format=formatted-bibliography'+
    
        var m;
        var keys = new Array();
    
        do {
            m = refPattern.exec(content);
            if(m){
                var key = m[1];
                keys.push(key);
            }
        }while(m);
        
        // No keys detected.
        if(keys.length == 0){
            throw new Error('No key detected.');
        }
    
        let pyload = JSON.stringify({
            "jsonrpc": "2.0",
            "method": "item.export",
            "params": [
                keys, "biblatex"
            ]
        });
    
        // requests bibliography
        axios({
            method: 'post',
            url: url,
            headers: {
                'Content-Type': 'application/json'
            },
            data: pyload
        })
        .then((res) => {
            let data = res.data;
            if('error' in data){
                let err = data['error'];
                throw new Error(err['message']);
            }else{
                let bib = data['result'][2];
                fs.writeFileSync(bibPath, bib, {
                    "encoding": "utf-8"
                });
                showStatusMessage('Export Successfully.');
            }
        });
    }catch(err){
        vscode.window.showErrorMessage(err.message);
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "zotero-export" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('zotero-export.exportEntries', exportEntries);

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
