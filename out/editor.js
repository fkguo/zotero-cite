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
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeId = exports.insertCiteKeys = exports.getDocumentCiteKeys = exports.insertTextAsync = exports.insertText = exports.getActiveEditor = exports.isMarkdownLikeDocument = void 0;
const vscode = __importStar(require("vscode"));
const i18n_1 = require("./i18n");
const MARKDOWN_LIKE_LANGUAGE_IDS = new Set(["markdown", "quarto", "rmd"]);
const MARKDOWN_LIKE_EXTENSIONS = [".md", ".markdown", ".qmd", ".rmd"];
function isMarkdownLikeDocument(document) {
    if (MARKDOWN_LIKE_LANGUAGE_IDS.has(document.languageId)) {
        return true;
    }
    const lowerPath = document.uri.path.toLowerCase();
    return MARKDOWN_LIKE_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
}
exports.isMarkdownLikeDocument = isMarkdownLikeDocument;
function getActiveEditor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        throw new Error((0, i18n_1.t)("error.noActiveEditor"));
    }
    return editor;
}
exports.getActiveEditor = getActiveEditor;
function insertText(text, location = -1, editor = getActiveEditor()) {
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
exports.insertText = insertText;
async function insertTextAsync(text, location = -1, editor = getActiveEditor()) {
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
exports.insertTextAsync = insertTextAsync;
function getDocumentCiteKeys(editor = getActiveEditor()) {
    let content = editor.document.getText();
    const cjkRegex = /[\u4e00-\u9fa5]/;
    if (cjkRegex.test(content)) {
        content = content.replace(/，/g, ",");
    }
    let pattern;
    if (isMarkdownLikeDocument(editor.document)) {
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
exports.getDocumentCiteKeys = getDocumentCiteKeys;
function insertCiteKeys(keyList, editor = getActiveEditor()) {
    const addLocation = getKeyEnvOffset(editor);
    if (editor.document.languageId === "latex") {
        if (addLocation === null) {
            insertText("\\cite{" + keyList.join(", ") + "}", -1, editor);
        }
        else {
            insertText(", " + keyList.join(", "), addLocation - 1, editor);
        }
    }
    if (isMarkdownLikeDocument(editor.document)) {
        if (addLocation === null) {
            insertText("[" + keyList.map((v) => "@" + v).join("; ") + "]", -1, editor);
        }
        else {
            insertText("; " + keyList.map((v) => "@" + v).join("; "), addLocation - 1, editor);
        }
    }
}
exports.insertCiteKeys = insertCiteKeys;
function makeId(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i += 1) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
exports.makeId = makeId;
function getKeyEnvOffset(editor) {
    if (!editor.selection.isEmpty) {
        return null;
    }
    const cursorLocation = editor.document.offsetAt(editor.selection.active);
    const pattern = getKeyEnvPattern(editor.document);
    if (!pattern) {
        return null;
    }
    const matches = getMatchList(pattern, editor.document.getText());
    let bestEndIndex = null;
    let bestRangeLength = Number.POSITIVE_INFINITY;
    for (const match of matches) {
        const startIndex = match.index;
        const endIndex = match.index + match[0].length;
        // Use [start, end) to avoid boundary ambiguities when citations are adjacent.
        if (cursorLocation >= startIndex && cursorLocation < endIndex) {
            const rangeLength = endIndex - startIndex;
            if (rangeLength < bestRangeLength) {
                bestRangeLength = rangeLength;
                bestEndIndex = endIndex;
            }
        }
    }
    return bestEndIndex;
}
function getKeyEnvPattern(document) {
    if (isMarkdownLikeDocument(document)) {
        return /\[([@^][\w-:\d]+(;| ){0,2})+\]/g;
    }
    if (document.languageId === "latex") {
        return /cite[tp]?(\[[^\]]*\]){0,2}\{([\w-:\d]+(,|，| ){0,2})+\}/g;
    }
    return undefined;
}
function getMatchList(pattern, text) {
    const matchList = [];
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        matchList.push(match);
    }
    return matchList;
}
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
//# sourceMappingURL=editor.js.map