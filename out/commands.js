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
exports.registerCommands = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const bibtexStore_1 = require("./bibtexStore");
const bibPath_1 = require("./bibPath");
const bibliography_1 = require("./bibliography");
const config_1 = require("./config");
const editor_1 = require("./editor");
const i18n_1 = require("./i18n");
const ui_1 = require("./ui");
const zotero_1 = require("./zotero");
const runnableCommands = [
    {
        id: "zotero-cite.citeSmart",
        labelKey: "quickPick.command.citeSmart",
        languages: ["markdown", "latex"],
    },
    {
        id: "zotero-cite.exportBibLatex",
        labelKey: "quickPick.command.exportBibLatex",
        languages: ["markdown", "latex"],
    },
    {
        id: "zotero-cite.addCitation",
        labelKey: "quickPick.command.addCitation",
        languages: ["markdown", "latex"],
    },
    {
        id: "zotero-cite.citeBibliography",
        labelKey: "quickPick.command.citeBibliography",
        languages: ["markdown", "latex"],
    },
    {
        id: "zotero-cite.citeMarkdownBibliography",
        labelKey: "quickPick.command.citeMarkdownBibliography",
        languages: ["markdown"],
    },
    {
        id: "zotero-cite.addHyperLinkCitation",
        labelKey: "quickPick.command.addHyperLinkCitation",
        languages: ["markdown"],
    },
    {
        id: "zotero-cite.updateBibtexFromZotero",
        labelKey: "quickPick.command.updateBibtexFromZotero",
        languages: ["bibtex", "latex"],
    },
];
async function exportBibLatex() {
    try {
        const editor = (0, editor_1.getActiveEditor)();
        if (editor.document.isUntitled) {
            (0, ui_1.showErrorMessage)((0, i18n_1.t)("error.saveCurrentFileBeforeExport"));
            return;
        }
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            (0, ui_1.showErrorMessage)((0, i18n_1.t)("error.noWorkspaceFolder"));
            return;
        }
        const currentFileUri = editor.document.uri;
        const bibName = await vscode.window.showInputBox({
            value: (0, config_1.getDefaultBibName)(),
            prompt: (0, i18n_1.t)("input.fileNamePrompt"),
        });
        if (bibName === undefined) {
            throw new Error((0, i18n_1.t)("error.cancelled"));
        }
        (0, bibPath_1.validateBibName)(bibName);
        const bibPath = vscode.Uri.joinPath(currentFileUri, "..", bibName);
        const keys = (0, editor_1.getDocumentCiteKeys)(editor);
        const uniqueKeys = Array.from(new Set(keys));
        if (uniqueKeys.length === 0) {
            throw new Error((0, i18n_1.t)("error.noKeyDetected"));
        }
        const bibliography = await (0, bibliography_1.getBibliography)(uniqueKeys);
        await vscode.workspace.fs.writeFile(bibPath, Buffer.from(bibliography + "\n", "utf-8"));
        (0, ui_1.showStatusMessage)((0, i18n_1.t)("status.exportSuccess"));
        (0, config_1.setLatestBibName)(bibName);
    }
    catch (error) {
        if (error instanceof vscode.CancellationError) {
            (0, ui_1.showStatusMessage)((0, i18n_1.t)("status.exportCancelled"));
            return;
        }
        (0, ui_1.showErrorMessage)((0, i18n_1.errorToMessage)(error));
    }
}
async function insertMarkdownBibliography(citeKey, editor) {
    const bibliography = await (0, zotero_1.getMarkdownBibliography)(citeKey);
    const bibliographyText = "[^" + citeKey + "]: " + bibliography;
    await (0, editor_1.insertTextAsync)(bibliographyText, -2, editor);
}
async function citeMarkdownBibliography() {
    try {
        const editor = (0, editor_1.getActiveEditor)();
        const existingKeys = (0, editor_1.getDocumentCiteKeys)(editor);
        const citeKeys = await (0, zotero_1.pickCiteKeys)();
        await (0, editor_1.insertTextAsync)("[^" + citeKeys.join("][^") + "]", -1, editor);
        for (const key of citeKeys) {
            if (!existingKeys.includes(key)) {
                await insertMarkdownBibliography(key, editor);
            }
        }
    }
    catch (error) {
        (0, ui_1.showErrorMessage)((0, i18n_1.errorToMessage)(error));
    }
}
async function addCitation() {
    try {
        const editor = (0, editor_1.getActiveEditor)();
        const citeKeys = await (0, zotero_1.pickCiteKeys)();
        (0, editor_1.insertCiteKeys)(citeKeys, editor);
    }
    catch (error) {
        (0, ui_1.showErrorMessage)((0, i18n_1.errorToMessage)(error));
    }
}
async function showTaskPicker() {
    try {
        const editor = (0, editor_1.getActiveEditor)();
        const languageId = editor.document.languageId;
        const availableCommands = runnableCommands.filter((item) => item.languages.includes(languageId));
        if (availableCommands.length === 0) {
            (0, ui_1.showErrorMessage)((0, i18n_1.t)("error.noRunnableCommandForLanguage", { lang: languageId }));
            return;
        }
        const items = availableCommands.map((item) => ({
            label: (0, i18n_1.t)(item.labelKey),
            description: (0, i18n_1.t)("quickPick.availableFor", { langs: item.languages.join(", ") }),
            commandId: item.id,
        }));
        const picked = await vscode.window.showQuickPick(items, {
            title: (0, i18n_1.t)("quickPick.taskPickerTitle"),
            placeHolder: (0, i18n_1.t)("quickPick.taskPickerPlaceholder"),
            matchOnDescription: true,
        });
        if (!picked) {
            return;
        }
        await vscode.commands.executeCommand(picked.commandId);
    }
    catch (error) {
        (0, ui_1.showErrorMessage)((0, i18n_1.errorToMessage)(error));
    }
}
async function citeBibliography() {
    try {
        const editor = (0, editor_1.getActiveEditor)();
        if (editor.document.isUntitled) {
            throw new Error((0, i18n_1.t)("error.saveCurrentTab"));
        }
        const bibName = (0, config_1.getDefaultBibName)();
        (0, bibPath_1.validateBibName)(bibName);
        const bibPath = (0, bibPath_1.resolveBibPath)(editor.document.uri, bibName);
        const citeKeys = await (0, zotero_1.pickCiteKeys)();
        (0, editor_1.insertCiteKeys)(citeKeys, editor);
        const bibKeys = await (0, bibtexStore_1.getBibliographyKeyFromFile)(bibPath);
        const uniqueKeys = citeKeys.filter((key) => !bibKeys.includes(key));
        if (uniqueKeys.length === 0) {
            return;
        }
        const newEntries = await (0, bibliography_1.getBibliography)(uniqueKeys);
        try {
            await (0, bibtexStore_1.appendBibliographyEntries)(bibPath, newEntries);
        }
        catch (error) {
            (0, ui_1.showErrorMessage)((0, i18n_1.t)("error.readBibliographyFile", {
                file: bibPath.fsPath,
                message: (0, i18n_1.errorToMessage)(error),
            }));
            return;
        }
        (0, ui_1.showStatusMessage)((0, i18n_1.t)("status.bibliographyUpdated", {
            count: uniqueKeys.length,
            file: path.basename(bibPath.fsPath),
        }));
    }
    catch (error) {
        if (error instanceof vscode.CancellationError) {
            (0, ui_1.showStatusMessage)((0, i18n_1.t)("status.exportCancelled"));
            return;
        }
        (0, ui_1.showErrorMessage)((0, i18n_1.errorToMessage)(error));
    }
}
async function addHyperLinkCitation() {
    try {
        const editor = (0, editor_1.getActiveEditor)();
        const clipboardContent = await vscode.env.clipboard.readText();
        if (clipboardContent === "") {
            (0, ui_1.showErrorMessage)((0, i18n_1.t)("error.noClipboardData"));
            return;
        }
        const key = (0, editor_1.makeId)(8);
        const keyContent = `[^${key}]`;
        const appContent = `\n[^${key}]: <${clipboardContent}>`;
        if (editor.document.languageId === "markdown") {
            await (0, editor_1.insertTextAsync)(keyContent, -1, editor);
            await (0, editor_1.insertTextAsync)(appContent, -2, editor);
        }
    }
    catch (error) {
        (0, ui_1.showErrorMessage)((0, i18n_1.errorToMessage)(error));
    }
}
function getBibPath() {
    const editor = (0, editor_1.getActiveEditor)();
    const bibName = (0, config_1.getDefaultBibName)();
    (0, bibPath_1.validateBibName)(bibName);
    return (0, bibPath_1.resolveBibPath)(editor.document.uri, bibName);
}
async function updateBibEntries() {
    const bibPath = getBibPath();
    try {
        const parsedData = await (0, bibtexStore_1.readBibEntriesFromFile)(bibPath);
        const total = parsedData.length;
        let processedCount = 0;
        let updated = false;
        const missingKeys = [];
        const serializedEntries = [];
        const outputChannel = (0, ui_1.getOutputChannel)();
        outputChannel.appendLine((0, i18n_1.t)("log.updateBibEntriesHeader"));
        for (const entry of parsedData) {
            const citeKey = String(entry.citationKey);
            const result = await (0, zotero_1.getBibtexFromZotero)(citeKey);
            if (result === null) {
                missingKeys.push(citeKey);
                outputChannel.appendLine((0, i18n_1.t)("log.notFoundBibEntry", { key: citeKey }));
                serializedEntries.push((0, bibtexStore_1.toBibtex)(entry));
                continue;
            }
            processedCount += 1;
            updated = true;
            serializedEntries.push(result);
        }
        if (updated) {
            await (0, bibtexStore_1.writeBibEntries)(bibPath, serializedEntries);
        }
        if (missingKeys.length > 0) {
            outputChannel.show(true);
            const showListAction = (0, i18n_1.t)("action.showList");
            const copyListAction = (0, i18n_1.t)("action.copyList");
            const selection = await vscode.window.showInformationMessage((0, i18n_1.t)("info.missingBibEntries", { count: missingKeys.length }), showListAction, copyListAction);
            if (selection === showListAction) {
                outputChannel.show(true);
            }
            else if (selection === copyListAction) {
                await vscode.env.clipboard.writeText(missingKeys.join("\n"));
                (0, ui_1.showInformationMessage)((0, i18n_1.t)("info.missingKeysCopied"));
            }
        }
        (0, ui_1.showInformationMessage)((0, i18n_1.t)("info.bibEntriesUpdated", {
            processed: processedCount,
            total,
        }));
    }
    catch (error) {
        (0, ui_1.showErrorMessage)((0, i18n_1.t)("error.updateBibtexFailed", {
            message: (0, i18n_1.errorToMessage)(error),
        }));
    }
}
async function citeSmart() {
    try {
        const editor = (0, editor_1.getActiveEditor)();
        const lang = editor.document.languageId;
        if (lang === "markdown") {
            await citeMarkdownBibliography();
            return;
        }
        if (lang === "latex") {
            await citeBibliography();
            return;
        }
        (0, ui_1.showErrorMessage)((0, i18n_1.t)("error.unsupportedLanguage", { lang }));
    }
    catch (error) {
        (0, ui_1.showErrorMessage)((0, i18n_1.errorToMessage)(error));
    }
}
function registerCommands(context) {
    const commands = [
        {
            id: "zotero-cite.showTaskPicker",
            command: showTaskPicker,
        },
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
exports.registerCommands = registerCommands;
//# sourceMappingURL=commands.js.map