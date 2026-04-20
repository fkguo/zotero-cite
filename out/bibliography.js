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
exports.getBibliography = void 0;
const vscode = __importStar(require("vscode"));
const i18n_1 = require("./i18n");
const ui_1 = require("./ui");
const zotero_1 = require("./zotero");
async function getBibliography(keys) {
    const groups = await (0, zotero_1.getGroups)();
    const groupNames = Object.keys(groups);
    if (groupNames.length === 1) {
        return (0, zotero_1.getBibliographyInGroup)(keys, groups[groupNames[0]]);
    }
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: (0, i18n_1.t)("progress.exportBibliography"),
        cancellable: true,
    }, async (progress, token) => {
        const totalProgress = groupNames.length + keys.length;
        progress.report({ increment: 0 });
        const outputChannel = (0, ui_1.getOutputChannel)();
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
                const groupName = await (0, zotero_1.getItemGroupName)(itemKey);
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
            const bib = await (0, zotero_1.getBibliographyInGroup)(groupItems[groupName], groupId);
            bibs.push(bib);
            progress.report({ increment: 100 / totalProgress });
        }
        if (allErrors.length > 0) {
            (0, ui_1.showInformationMessage)((0, i18n_1.t)("info.exportSuccessWithErrors"));
        }
        else {
            (0, ui_1.showStatusMessage)((0, i18n_1.t)("status.exportBibliographySuccess"));
        }
        return bibs.join("\n\n");
    });
}
exports.getBibliography = getBibliography;
//# sourceMappingURL=bibliography.js.map