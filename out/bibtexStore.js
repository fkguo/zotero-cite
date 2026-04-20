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
exports.writeBibEntries = exports.appendBibliographyEntries = exports.toBibtex = exports.readBibEntriesFromFile = exports.getBibliographyKeyFromFile = void 0;
const vscode = __importStar(require("vscode"));
const bibtexParse = require("@orcid/bibtex-parse-js");
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
exports.getBibliographyKeyFromFile = getBibliographyKeyFromFile;
async function readBibEntriesFromFile(bibPath) {
    const fileBytes = await vscode.workspace.fs.readFile(bibPath);
    const content = Buffer.from(fileBytes).toString("utf8");
    return bibtexParse.toJSON(content);
}
exports.readBibEntriesFromFile = readBibEntriesFromFile;
function toBibtex(entry) {
    return bibtexParse.toBibtex([entry], false);
}
exports.toBibtex = toBibtex;
async function appendBibliographyEntries(bibPath, newEntries) {
    let existingContent = "";
    try {
        const fileData = await vscode.workspace.fs.readFile(bibPath);
        existingContent = Buffer.from(fileData).toString("utf-8");
    }
    catch (error) {
        const errorCode = error.code;
        if (errorCode !== "FileNotFound" && errorCode !== "EntryNotFound") {
            throw error;
        }
    }
    const contentToWrite = existingContent.trim() === ""
        ? newEntries
        : existingContent.trimEnd() + "\n\n" + newEntries.trimStart();
    await vscode.workspace.fs.writeFile(bibPath, Buffer.from(contentToWrite + "\n", "utf-8"));
}
exports.appendBibliographyEntries = appendBibliographyEntries;
async function writeBibEntries(bibPath, entries) {
    const updatedBibtexData = entries.join("\n") + "\n";
    await vscode.workspace.fs.writeFile(bibPath, Buffer.from(updatedBibtexData, "utf8"));
}
exports.writeBibEntries = writeBibEntries;
//# sourceMappingURL=bibtexStore.js.map