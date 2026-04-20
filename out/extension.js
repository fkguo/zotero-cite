"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
const i18n_1 = require("./i18n");
const bibtexParse = require("@orcid/bibtex-parse-js");
const CONFIG_SECTION = "zotero-cite";
let latestBibName = "";
const outputChannel = vscode.window.createOutputChannel("Zotero Cite");
function getConfiguration() {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
}
function showStatusMessage(message) {
    const duration = Number(getConfiguration().get("statusMessageDuration", 1500));
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1500;
    vscode.window.setStatusBarMessage(message, safeDuration);
}
function showErrorMessage(message) {
    void vscode.window.showErrorMessage(message);
}
function showInformationMessage(message) {
    void vscode.window.showInformationMessage(message);
}
function bibliographyStyle() {
    return getConfiguration().get("bibliograpyStyle", "http://www.zotero.org/styles/apa");
}
function latexBibStyle() {
    return getConfiguration().get("latexBibStyle", "bibtex");
}
function defaultBibName() {
    if (latestBibName === "") {
        latestBibName = getConfiguration().get("defaultBibName", "ref.bib");
    }
    return latestBibName;
}
function minimizeZotero() {
    return getConfiguration().get("minimizeZotero", "");
}
function jsonRpcUrl() {
    return getConfiguration().get("jsonRpcUrl", "http://localhost:23119/better-bibtex/json-rpc");
}
function caywUrl() {
    return getConfiguration().get("caywUrl", "http://localhost:23119/better-bibtex/cayw");
}
function getActiveEditor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        throw new Error((0, i18n_1.t)("error.noActiveEditor"));
    }
    return editor;
}
function validateBibName(bibName) {
    if (bibName.length < 5 || path.extname(bibName) !== ".bib") {
        throw new Error((0, i18n_1.t)("error.invalidBibName"));
    }
}
function applyBibTemplateVariables(template, filePath) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const replacements = {
        "${workspaceFolder}": workspaceFolder,
        "${fileBasename}": path.basename(filePath),
        "${fileBasenameNoExtension}": path.parse(filePath).name,
        "${fileDirname}": path.dirname(filePath),
        "${fileExtname}": path.extname(filePath),
    };
    let result = template;
    Object.keys(replacements).forEach((key) => {
        result = result.split(key).join(replacements[key]);
    });
    return result;
}
function resolveBibPath(currentFileUri, bibNameTemplate) {
    const replaced = applyBibTemplateVariables(bibNameTemplate, currentFileUri.fsPath);
    if (path.isAbsolute(replaced)) {
        const localFileUri = vscode.Uri.file(replaced);
        if (currentFileUri.scheme === "file") {
            return localFileUri;
        }
        return currentFileUri.with({
            path: localFileUri.path,
        });
    }
    return vscode.Uri.joinPath(currentFileUri, "..", replaced);
}
/**
 * 获取文档中引用的键列表
 */
function getDocumentCiteKeys() {
    const editor = getActiveEditor();
    let content = editor.document.getText();
    const cjkRegex = /[\u4e00-\u9fa5]/;
    if (cjkRegex.test(content)) {
        content = content.replace(/，/g, ",");
    }
    let pattern;
    if (editor.document.languageId === "markdown") {
        pattern = /\[([@^][\w-:\d]+(;| ){0,2})+\]/g;
    }
    if (editor.document.languageId === "latex") {
        pattern = /cite[tp]?(\[[^\]]*\])?\{([\w-:\d]+(,| ){0,2})+\}/g;
    }
    if (!pattern) {
        return [];
    }
    const matches = getMatchList(pattern, content);
    return getCiteKeyList(matches);
}
// 根据latex和markdown环境的不同，导出所有的bibliography到文件中
async function exportBibLatex() {
    try {
        const editor = getActiveEditor();
        if (editor.document.isUntitled) {
            showErrorMessage((0, i18n_1.t)("error.saveCurrentFileBeforeExport"));
            return;
        }
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            showErrorMessage((0, i18n_1.t)("error.noWorkspaceFolder"));
            return;
        }
        const currentFileUri = editor.document.uri;
        const bibName = await vscode.window.showInputBox({
            value: defaultBibName(),
            prompt: (0, i18n_1.t)("input.fileNamePrompt"),
        });
        if (bibName === undefined) {
            throw new Error((0, i18n_1.t)("error.cancelled"));
        }
        validateBibName(bibName);
        const bibPath = vscode.Uri.joinPath(currentFileUri, "..", bibName);
        const keys = getDocumentCiteKeys();
        const uniqueKeys = Array.from(new Set(keys));
        if (uniqueKeys.length === 0) {
            throw new Error((0, i18n_1.t)("error.noKeyDetected"));
        }
        const bibliography = await getBibliography(uniqueKeys);
        await vscode.workspace.fs.writeFile(bibPath, Buffer.from(bibliography + "\n", "utf-8"));
        showStatusMessage((0, i18n_1.t)("status.exportSuccess"));
        latestBibName = bibName;
    }
    catch (error) {
        if (error instanceof vscode.CancellationError) {
            showStatusMessage((0, i18n_1.t)("status.exportCancelled"));
            return;
        }
        showErrorMessage((0, i18n_1.errorToMessage)(error));
    }
}
/**
 * 将文字输入到目标位置
 * @param text 要输入的文字
 * @param location 输入的位置，-1代表当前位置，-2代表最尾行，其他的代表目标位置
 */
function insertText(text, location = -1) {
    const editor = getActiveEditor();
    void editor.edit((editBuilder) => {
        if (location === -1) {
            editBuilder.insert(editor.selection.active, text);
        }
        else if (location === -2) {
            const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
            editBuilder.insert(new vscode.Position(lastLine.lineNumber + 1, 0), text);
        }
        else {
            const position = editor.document.positionAt(location);
            editBuilder.insert(position, text);
        }
    });
}
async function insertTextAsync(text, location = -1) {
    const editor = getActiveEditor();
    await editor.edit((editBuilder) => {
        if (location === -1) {
            editBuilder.insert(editor.selection.active, text);
        }
        else if (location === -2) {
            const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
            editBuilder.insert(new vscode.Position(lastLine.lineNumber + 1, 0), text);
        }
        else {
            const position = editor.document.positionAt(location);
            editBuilder.insert(position, text);
        }
    });
}
/**
 * https://stackoverflow.com/questions/44182951/axios-chaining-multiple-api-requests
 * https://retorque.re/zotero-better-bibtex/citing/cayw/
 * 返回key数组
 */
async function pickCiteKeys() {
    const citeKeys = [];
    try {
        const response = await (0, axios_1.default)({
            method: "get",
            url: caywUrl(),
            params: {
                format: "pandoc",
                brackets: "1",
                minimize: minimizeZotero(),
            },
        });
        const pattern = /@([\w-:\d]+)/g;
        const dataText = String(response.data ?? "");
        let match;
        while ((match = pattern.exec(dataText)) !== null) {
            citeKeys.push(match[1]);
        }
    }
    catch (error) {
        showErrorMessage((0, i18n_1.errorToMessage)(error));
    }
    if (citeKeys.length === 0) {
        throw new Error((0, i18n_1.t)("error.noItemSelected"));
    }
    return citeKeys;
}
/**
 * 对于markdown文件的书写，选择key，然后插入bibliography，
 * key的格式为：[^k1][^k2]
 * bibliography的格式：
 *   [^k1]: content
 *   [^k2]: content
 */
async function citeMarkdownBibliography() {
    try {
        const existingKeys = getDocumentCiteKeys();
        const citeKeys = await pickCiteKeys();
        insertText("[^" + citeKeys.join("][^") + "]");
        citeKeys.forEach((key) => {
            if (!existingKeys.includes(key)) {
                void insertMarkdownBibliography(key);
            }
        });
    }
    catch (error) {
        showErrorMessage((0, i18n_1.errorToMessage)(error));
    }
}
/**
 * 根据item的key，插入markdown格式的bibliography
 */
async function insertMarkdownBibliography(citeKey) {
    const payload = JSON.stringify({
        jsonrpc: "2.0",
        method: "item.bibliography",
        params: [
            ["@" + citeKey],
            {
                id: bibliographyStyle(),
            },
        ],
    });
    try {
        const response = await (0, axios_1.default)({
            method: "post",
            url: jsonRpcUrl(),
            headers: {
                "Content-Type": "application/json",
            },
            data: payload,
        });
        const data = response.data;
        if (data.error) {
            throw new Error(data.error.message || "Unknown Zotero error");
        }
        const bibliographyText = "[^" + citeKey + "]: " + (data.result || "");
        insertText(bibliographyText, -2);
    }
    catch (error) {
        showErrorMessage((0, i18n_1.errorToMessage)(error));
    }
}
/**
 * 根据bib文件的路径，获取其中的bibentry的key数组
 */
async function getBibliographyKeyFromFile(bibPath) {
    try {
        const fileBytes = await vscode.workspace.fs.readFile(bibPath);
        const content = Buffer.from(fileBytes).toString("utf8");
        const jsonBibs = bibtexParse.toJSON(content);
        return jsonBibs.map((entry) => String(entry.citationKey));
    }
    catch (_error) {
        return [];
    }
}
/**
 * 给pandoc以及latex添加citation，不添加bibentry
 */
async function addCitation() {
    try {
        const citeKeys = await pickCiteKeys();
        insertCiteKeys(citeKeys);
    }
    catch (error) {
        showErrorMessage((0, i18n_1.errorToMessage)(error));
    }
}
/**
 * 在pandoc以及latex文档编写过程中，将key数组插入到文档中
 */
function insertCiteKeys(keyList) {
    const editor = getActiveEditor();
    const addLocation = getKeyEnvOffset();
    if (editor.document.languageId === "latex") {
        if (addLocation === null) {
            insertText("\\cite{" + keyList.join(", ") + "}");
        }
        else {
            insertText(", " + keyList.join(", "), addLocation - 1);
        }
    }
    if (editor.document.languageId === "markdown") {
        if (addLocation === null) {
            insertText("[" + keyList.map((v) => "@" + v).join("; ") + "]");
        }
        else {
            insertText("; " + keyList.map((v) => "@" + v).join("; "), addLocation - 1);
        }
    }
}
/**
 * 给pandoc以及latex添加citation以及bibliography
 */
async function citeBibliography() {
    try {
        const editor = getActiveEditor();
        const currentFileUri = editor.document.uri;
        if (editor.document.isUntitled) {
            throw new Error((0, i18n_1.t)("error.saveCurrentTab"));
        }
        const bibName = defaultBibName();
        validateBibName(bibName);
        const bibPath = resolveBibPath(currentFileUri, bibName);
        const citeKeys = await pickCiteKeys();
        insertCiteKeys(citeKeys);
        const bibKeys = await getBibliographyKeyFromFile(bibPath);
        const uniqueKeys = citeKeys.filter((key) => !bibKeys.includes(key));
        if (uniqueKeys.length === 0) {
            return;
        }
        const newEntries = await getBibliography(uniqueKeys);
        let existingContent = "";
        try {
            const fileData = await vscode.workspace.fs.readFile(bibPath);
            existingContent = Buffer.from(fileData).toString("utf-8");
        }
        catch (error) {
            const errorCode = error.code;
            if (errorCode !== "FileNotFound" && errorCode !== "EntryNotFound") {
                showErrorMessage((0, i18n_1.t)("error.readBibliographyFile", {
                    file: bibPath.fsPath,
                    message: (0, i18n_1.errorToMessage)(error),
                }));
            }
        }
        const contentToWrite = existingContent.trim() === ""
            ? newEntries
            : existingContent.trimEnd() + "\n\n" + newEntries.trimStart();
        await vscode.workspace.fs.writeFile(bibPath, Buffer.from(contentToWrite + "\n", "utf-8"));
        showStatusMessage((0, i18n_1.t)("status.bibliographyUpdated", {
            count: uniqueKeys.length,
            file: path.basename(bibPath.fsPath),
        }));
    }
    catch (error) {
        if (error instanceof vscode.CancellationError) {
            showStatusMessage((0, i18n_1.t)("status.exportCancelled"));
            return;
        }
        showErrorMessage((0, i18n_1.errorToMessage)(error));
    }
}
/**
 * 获取用户在 Zotero 中拥有的组（group，也称为libraries）
 */
async function getGroups() {
    const payload = JSON.stringify({
        jsonrpc: "2.0",
        method: "user.groups",
    });
    const response = await (0, axios_1.default)({
        method: "post",
        url: jsonRpcUrl(),
        headers: {
            "Content-Type": "application/json",
        },
        data: payload,
    });
    const data = response.data;
    if (data.error) {
        throw new Error(data.error.message || "Unknown Zotero error");
    }
    const groups = {};
    (data.result || []).forEach((item) => {
        groups[item.name] = String(item.id);
    });
    return groups;
}
/**
 * 根据 key 获取 item 所在组的名称
 */
async function getItemGroupName(key) {
    const payload = JSON.stringify({
        jsonrpc: "2.0",
        method: "item.search",
        params: [key],
    });
    const response = await (0, axios_1.default)({
        method: "post",
        url: jsonRpcUrl(),
        headers: {
            "Content-Type": "application/json",
        },
        data: payload,
    });
    const data = response.data;
    if (data.error) {
        throw new Error(data.error.message || "Unknown Zotero error");
    }
    for (const item of data.result || []) {
        if (item["citation-key"] === key) {
            return item.library;
        }
    }
    throw new Error((0, i18n_1.t)("error.itemNotFound", { key }));
}
/**
 * 根据key列表和组ID获取bibliography列表
 */
async function getBibliographyInGroup(keys, groupId) {
    const payload = JSON.stringify({
        jsonrpc: "2.0",
        method: "item.export",
        params: [keys, latexBibStyle(), groupId],
    });
    const response = await (0, axios_1.default)({
        method: "post",
        url: jsonRpcUrl(),
        headers: {
            "Content-Type": "application/json",
        },
        data: payload,
    });
    const data = response.data;
    if (data.error) {
        throw new Error(data.error.message || "Unknown Zotero error");
    }
    return data.result || "";
}
/**
 * 根据key列表获取bibliography列表
 */
async function getBibliography(keys) {
    const groups = await getGroups();
    const groupNames = Object.keys(groups);
    if (groupNames.length === 1) {
        return getBibliographyInGroup(keys, groups[groupNames[0]]);
    }
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: (0, i18n_1.t)("progress.exportBibliography"),
        cancellable: true,
    }, async (progress, token) => {
        const totalProgress = groupNames.length + keys.length;
        progress.report({ increment: 0 });
        const groupItems = {};
        const allErrors = [];
        for (const itemKey of keys) {
            if (token.isCancellationRequested) {
                throw new vscode.CancellationError();
            }
            progress.report({
                increment: 0,
                message: (0, i18n_1.t)("progress.fetchingItemGroup", { itemKey }),
            });
            try {
                const groupName = await getItemGroupName(itemKey);
                if (!groupItems[groupName]) {
                    groupItems[groupName] = [];
                }
                groupItems[groupName].push(itemKey);
            }
            catch (error) {
                const message = (0, i18n_1.errorToMessage)(error);
                outputChannel.appendLine(message);
                if (message && !message.includes("is not found")) {
                    allErrors.push(message);
                }
            }
            progress.report({ increment: 100 / totalProgress });
        }
        const bibs = [];
        const groupedNames = Object.keys(groupItems);
        for (const groupName of groupedNames) {
            if (token.isCancellationRequested) {
                throw new vscode.CancellationError();
            }
            progress.report({
                increment: 0,
                message: (0, i18n_1.t)("progress.fetchingGroupBibliography", { groupName }),
            });
            const groupId = groups[groupName];
            const bib = await getBibliographyInGroup(groupItems[groupName], groupId);
            bibs.push(bib);
            progress.report({ increment: 100 / totalProgress });
        }
        if (allErrors.length > 0) {
            showInformationMessage((0, i18n_1.t)("info.exportSuccessWithErrors"));
        }
        else {
            showStatusMessage((0, i18n_1.t)("status.exportBibliographySuccess"));
        }
        return bibs.join("\n\n");
    });
}
/**
 * 输入一段正则表达式以及文字，导出匹配的列表
 */
function getMatchList(pattern, text) {
    const matchList = [];
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        matchList.push(match);
    }
    return matchList;
}
/**
 * 根据key的匹配列表，返回key列表
 */
function getCiteKeyList(keyMatchList) {
    const citeKeyList = [];
    keyMatchList.forEach((value) => {
        const cleaned = value[0].replace(/^cite[tp]?/, "");
        const keyPattern = /[\w-:\d]+/g;
        const keyMatches = getMatchList(keyPattern, cleaned);
        keyMatches.forEach((keyMatch) => {
            citeKeyList.push(keyMatch[0]);
        });
    });
    return citeKeyList;
}
/**
 * 判断鼠标是否在键的环境中，是的话，返回环境的end index，否则为null
 */
function getKeyEnvOffset() {
    const editor = getActiveEditor();
    const data = getCursorRoundText();
    if (!data) {
        return null;
    }
    const cursorLocation = editor.document.offsetAt(editor.selection.active);
    let pattern;
    if (editor.document.languageId === "markdown") {
        pattern = /\[([@^][\w-:\d]+(;| ){0,2})+\]/g;
    }
    if (editor.document.languageId === "latex") {
        pattern = /cite[tp]?\{([\w-:\d]+(,|，| ){0,2})+\}/g;
    }
    if (!pattern) {
        return null;
    }
    const matches = getMatchList(pattern, data.content);
    for (const match of matches) {
        const startIndex = match.index + data.startIndex;
        const endIndex = match.index + match[0].length + data.startIndex;
        if (cursorLocation >= startIndex && cursorLocation <= endIndex) {
            return endIndex;
        }
    }
    return null;
}
/**
 * 获取鼠标前后目标长度的文字内容
 */
function getCursorRoundText(length = 50) {
    const editor = getActiveEditor();
    const textLength = editor.document.getText().length;
    if (!editor.selection.isEmpty) {
        return undefined;
    }
    const cursorPosition = editor.selection.active;
    const cursorIndex = editor.document.offsetAt(cursorPosition);
    const startIndex = Math.max(cursorIndex - length, 0);
    const endIndex = Math.min(cursorIndex + length, textLength);
    const startPos = editor.document.positionAt(startIndex);
    const endPos = editor.document.positionAt(endIndex);
    const range = new vscode.Range(startPos, endPos);
    const text = editor.document.getText(range);
    return {
        startIndex,
        content: text,
    };
}
function makeId(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i += 1) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
// 将超链接设置为引用
async function addHyperLinkCitation() {
    const editor = getActiveEditor();
    const clipboardContent = await vscode.env.clipboard.readText();
    if (clipboardContent === "") {
        showErrorMessage((0, i18n_1.t)("error.noClipboardData"));
        return;
    }
    const key = makeId(8);
    const keyContent = `[^${key}]`;
    const appContent = `\n[^${key}]: <${clipboardContent}>`;
    if (editor.document.languageId === "markdown") {
        await insertTextAsync(keyContent);
        await insertTextAsync(appContent, -2);
    }
}
async function getBibtexFromZotero(citeKey) {
    try {
        const response = await axios_1.default.post(jsonRpcUrl(), {
            jsonrpc: "2.0",
            method: "item.export",
            params: [[citeKey], "bibtex"],
        });
        if (response.data && response.data.result) {
            return String(response.data.result);
        }
        showErrorMessage((0, i18n_1.t)("error.noResultFromZotero"));
        return null;
    }
    catch (error) {
        showErrorMessage((0, i18n_1.t)("error.fetchFromZoteroFailed", {
            message: (0, i18n_1.errorToMessage)(error),
        }));
        return null;
    }
}
function getBibPath() {
    const editor = getActiveEditor();
    const bibName = defaultBibName();
    validateBibName(bibName);
    return resolveBibPath(editor.document.uri, bibName);
}
async function updateBibEntries() {
    const bibPath = getBibPath();
    try {
        const fileBytes = await vscode.workspace.fs.readFile(bibPath);
        const data = Buffer.from(fileBytes).toString("utf8");
        const parsedData = bibtexParse.toJSON(data);
        const total = parsedData.length;
        let processedCount = 0;
        const missingKeys = [];
        const serializedEntries = [];
        let updated = false;
        outputChannel.appendLine((0, i18n_1.t)("log.updateBibEntriesHeader"));
        for (const entry of parsedData) {
            const citeKey = String(entry.citationKey);
            const result = await getBibtexFromZotero(citeKey);
            if (result === null) {
                missingKeys.push(citeKey);
                outputChannel.appendLine((0, i18n_1.t)("log.notFoundBibEntry", { key: citeKey }));
                serializedEntries.push(bibtexParse.toBibtex([entry], false));
                continue;
            }
            processedCount += 1;
            updated = true;
            serializedEntries.push(result);
        }
        if (updated) {
            const updatedBibtexData = serializedEntries.join("\n") + "\n";
            await vscode.workspace.fs.writeFile(bibPath, Buffer.from(updatedBibtexData, "utf8"));
        }
        if (missingKeys.length > 0) {
            outputChannel.show(true);
            const selection = await vscode.window.showInformationMessage((0, i18n_1.t)("info.missingBibEntries", { count: missingKeys.length }), (0, i18n_1.t)("action.showList"), (0, i18n_1.t)("action.copyList"));
            if (selection === (0, i18n_1.t)("action.showList")) {
                outputChannel.show(true);
            }
            else if (selection === (0, i18n_1.t)("action.copyList")) {
                await vscode.env.clipboard.writeText(missingKeys.join("\n"));
                showInformationMessage((0, i18n_1.t)("info.missingKeysCopied"));
            }
        }
        showInformationMessage((0, i18n_1.t)("info.bibEntriesUpdated", {
            processed: processedCount,
            total,
        }));
    }
    catch (error) {
        showErrorMessage((0, i18n_1.t)("error.updateBibtexFailed", {
            message: (0, i18n_1.errorToMessage)(error),
        }));
    }
}
/**
 * Smart entrypoint for the editor title button:
 * - markdown: cite + footnote bibliography
 * - latex: cite + update .bib file
 */
async function citeSmart() {
    try {
        const editor = getActiveEditor();
        const lang = editor.document.languageId;
        if (lang === "markdown") {
            await citeMarkdownBibliography();
            return;
        }
        if (lang === "latex") {
            await citeBibliography();
            return;
        }
        showErrorMessage((0, i18n_1.t)("error.unsupportedLanguage", { lang }));
    }
    catch (error) {
        showErrorMessage((0, i18n_1.errorToMessage)(error));
    }
}
function activate(context) {
    console.log((0, i18n_1.t)("activate.message"));
    const commands = [
        {
            id: "zotero-cite.citeSmart",
            command: citeSmart,
        },
        {
            id: "zotero-cite.exportBibLatex",
            command: exportBibLatex,
        },
        {
            id: "zotero-cite.addCitation",
            command: addCitation,
        },
        {
            id: "zotero-cite.citeBibliography",
            command: citeBibliography,
        },
        {
            id: "zotero-cite.citeMarkdownBibliography",
            command: citeMarkdownBibliography,
        },
        {
            id: "zotero-cite.addHyperLinkCitation",
            command: addHyperLinkCitation,
        },
        {
            id: "zotero-cite.updateBibtexFromZotero",
            command: updateBibEntries,
        },
    ];
    commands.forEach((command) => {
        const disposable = vscode.commands.registerCommand(command.id, command.command);
        context.subscriptions.push(disposable);
    });
}
exports.activate = activate;
function deactivate() {
    outputChannel.dispose();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map