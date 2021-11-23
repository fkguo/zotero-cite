// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const bibtexParse = require('@orcid/bibtex-parse-js');

const json_rpc = 'http://localhost:23119/better-bibtex/json-rpc';
const cayw = 'http://localhost:23119/better-bibtex/cayw';

function showStatusMessage(message){
    vscode.window.setStatusBarMessage(message, 1500);
}

function showErrorMessage(message){
    vscode.window.showErrorMessage(message);
}

function showInformationMessage(message){
    vscode.window.showInformationMessage(message);
}

function bibliograpyStyle() {
    return vscode.workspace.getConfiguration('zotero-cite').get('bibliograpyStyle', 'http://www.zotero.org/styles/apa');
}


function defaultBibName(){
    return vscode.workspace.getConfiguration('zotero-cite').get('defaultBibName', 'ref.bib');
}


/**
 * 根据pattern，从当前文档，获取regex的key列表
 * @param {*} RegExp 
 * @returns Key列表
 */
function getKeysFromDocument(re){
    const editor = vscode.window.activeTextEditor;
    const content = editor.document.getText();

    let m;
    var keys = new Array();

    do {
        m = re.exec(content);

        if(m){
            keys = keys.concat(m[1].split(',').map(k => k.trim()));
        }
    }while(m);

    return keys;
}


// 根据latex和markdown环境的不同，导出所有的bibliography到文件中
async function exportBibLatex(){
    try{
        const editor = vscode.window.activeTextEditor;
        var currentlyOpenTabfilePath = editor.document.uri.fsPath;
        var bibName;
    
        // Current file tab is not saved.
        if(currentlyOpenTabfilePath.indexOf('Untitled')!=-1){
            throw new Error('Please SAVE Current Tab.');
        }
        
        // Ask for bib file name
        await vscode.window.showInputBox({value: defaultBibName(), prompt: 'File Name:'}).then(value => {
            bibName = value;
        });
        
        if (bibName === undefined){
            throw new Error('Cancelled.');
        }

        if (bibName.length < 5 || path.extname(bibName)!='.bib'){
            throw new Error('bibName is invalid or its length is less than 5.');
        }

        // Create bib Path
        var parentDir = path.dirname(currentlyOpenTabfilePath);
        var bibPath = path.join(parentDir, bibName);
        
        // 获取键列表
        var re;

        if (editor.document.languageId == 'markdown'){
            re = new RegExp(/\[[@^]([^\]]+)\]/g);
        }else{
            re = new RegExp(/\\cite\{([a-zA-Z,\s\d]+)\}/g);
        }

        const keys = getKeysFromDocument(re);

        // 去除重复的问题
        var uniqueKeys = Array.from(new Set(keys));

        // No keys detected.
        if(uniqueKeys.length == 0){
            throw new Error('No key detected.');
        }

        getBibliography(uniqueKeys)
        .then(res => {
            fs.writeFileSync(bibPath, res, {
                "encoding": "utf-8"
            });
            showStatusMessage('Export Successfully.');
        })
        .catch((err) => {
            showErrorMessage(err.message);
        });
    }catch(err){
        showErrorMessage(err.message);
    }
}

/**
 * 输入位置
 * @param {string} text 插入文字
 * @param {bool} end 是否插入结尾
 */
function enterText(text, end=false) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        editor.edit(editBuilder => {
            if(end){
                const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
                editBuilder.insert(
                    new vscode.Position(lastLine.lineNumber + 1, 0),
                    text
                );
            }else{
                editBuilder.insert(editor.selection.active, text);
            }
        });
    }
}


// 根据对话到选择目标key。
async function pickCiteKey(){
    // https://stackoverflow.com/questions/44182951/axios-chaining-multiple-api-requests

    var citeKey;

    await axios({
        method: 'get',
        url: cayw,
        params: {
            "format": "pandoc",
            "brackets": "1",
            "minimize": 'true'
        }
    })
    .then(res => {
        const pattern = /\[@([^\]]+)\]/g;
        let m = pattern.exec(res.data);
        
        if(m){
            citeKey = m[1];
        }
    })
    .catch(err => {
        showErrorMessage(err.message);
    });

    // 代表没有选择item，抛出异常。
    if (citeKey === undefined){
        throw new Error('No item is selected.');
    }

    return citeKey;
}


// 基于markdown的书写规则，插入引用[^key]
async function citeMarkdownBibliography(){
    try{
        // 获取键列表
        var re = new RegExp(/\[\^([a-zA-Z\d]+)\]:\s/g);
        var keys = getKeysFromDocument(re);
    
        // 获取键值
        var citeKey = await pickCiteKey(); 
    
        // insert markdown citation
        const citeData = '[^'+citeKey+']';
        enterText(citeData);
    
        if (keys.includes(citeKey)){
            console.log(`${citeKey} exists.`)
            return;
        }
    
        const pyload = JSON.stringify({
            "jsonrpc": "2.0",
            "method": "item.bibliography",
            "params": [
                ["@"+citeKey], 
                {"id": bibliograpyStyle()}
            ]
        });
        
        // http://axios-js.com/zh-cn/docs/index.html
        axios({
            method: 'post',
            url: json_rpc,
            headers: {
                'Content-Type': 'application/json'
            },
            data: pyload
        })
        .then(res => {
            const data = res.data;
    
            if('error' in data){
                let err = data['error'];
                throw new Error(err['message']);
            }
    
            const result = data['result'];
            const bibliographyText = citeData + ": " + result + "\n";
            
            // enter text to the file end.
            enterText(bibliographyText, true);
        })
        .catch(err => {
            showErrorMessage(err.message);
        });
    }catch(err){
        showErrorMessage(err.message);
    }
}


function getBibliographyKey(bibPath){
    // 代表文件不存在，返回空数组
    if (!fs.existsSync(bibPath)){
        return new Array();
    }

    var content = fs.readFileSync(bibPath, {
        encoding:"utf8"
    });

    var jsonBibs = bibtexParse.toJSON(content);

    return jsonBibs.map(jb => jb["citationKey"]);
}


/**
 * 仅仅添加citekey，而不添加bibentry。
 */
async function addCitation(){
    try{
        const editor = vscode.window.activeTextEditor;
        
        // 获取键值
        var citeKey = await pickCiteKey();

        // 如果是markdown，则输入[@key]，如果是latex，则输入key。
        // 其中\cite命令需要自己输入。
        if(editor.document.languageId == 'latex'){
            enterText(citeKey);
        }else{
            // insert markdown citation
            enterText('[@'+citeKey+']');
        }
    }catch(err){
        showErrorMessage(err.message);
    }
}


// 根据latex和markdown环境的不同，插入citation到当前位置
// 以及bibliography到默认的bib文件中。
async function citeBibliography(){
    try{
        const editor = vscode.window.activeTextEditor;
        var currentlyOpenTabfilePath = editor.document.uri.fsPath;

        // Current file tab is not saved.
        if (currentlyOpenTabfilePath.indexOf('Untitled')!=-1){
            throw new Error('Please SAVE Current Tab.');
        }

        // 得到bib文件的默认文件名
        const bibName = defaultBibName();

        if (bibName.length < 5 || path.extname(bibName)!='.bib'){
            throw new Error('bibName is invalid or its length is less than 5.');
        }

        // Create bib Path
        var parentDir = path.dirname(currentlyOpenTabfilePath);
        var bibPath = path.join(parentDir, bibName);
        
        // 获取键值
        var citeKey = await pickCiteKey();

        // 如果是markdown，则输入[@key]，如果是latex，则输入key。
        // 其中\cite命令需要自己输入。
        if(editor.document.languageId == 'latex'){
            enterText(citeKey);
        }else{
            // insert markdown citation
            enterText('[@'+citeKey+']');
        }

        // 根据bib文件，而不是cite去获取keys。
        var bibKeys = getBibliographyKey(bibPath);

        // 如果已经包含了键，代表已经加入到bib文件中，不需要重新加入。
        if (bibKeys.includes(citeKey)){
            console.log(citeKey);
            return;
        }
        
        // 添加bibliography
        getBibliography([citeKey])
        .then(res => {
            fs.writeFileSync(
                bibPath, res, {
                    flag: 'a',
                    encoding: 'utf8'
            });
        })
        .catch(err => {
            showErrorMessage(err.message);
        }) 
    }catch(err){
        showErrorMessage(err.message);
    }
}


// 根据引用的key列表获取bibliography列表
async function getBibliography(keys){
    let pyload = JSON.stringify({
        "jsonrpc": "2.0",
        "method": "item.export",
        "params": [
            keys, "biblatex"
        ]
    });

    // requests bibliography
    return axios({
        method: 'post',
        url: json_rpc,
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
        }
        return data['result'][2];
    });
}


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "zotero-cite" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
    const commands = [
        {
            "id": "zotero-cite.exportBibLatex",
            "command": exportBibLatex
        },
        {
            "id": "zotero-cite.addCitation",
            "command": addCitation
        },
        {
            "id": "zotero-cite.citeBibliography",
            "command": citeBibliography
        },
        {
            "id": "zotero-cite.citeMarkdownBibliography",
            "command": citeMarkdownBibliography
        }
    ]

    commands.forEach( command => {
        let disposable = vscode.commands.registerCommand(command.id, command.command);
        context.subscriptions.push(disposable);
    });
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
