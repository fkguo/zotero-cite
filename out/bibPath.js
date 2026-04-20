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
exports.resolveBibPath = exports.applyBibTemplateVariables = exports.validateBibName = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const i18n_1 = require("./i18n");
function validateBibName(bibName) {
    if (bibName.length < 5 || path.extname(bibName) !== ".bib") {
        throw new Error((0, i18n_1.t)("error.invalidBibName"));
    }
}
exports.validateBibName = validateBibName;
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
exports.applyBibTemplateVariables = applyBibTemplateVariables;
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
exports.resolveBibPath = resolveBibPath;
//# sourceMappingURL=bibPath.js.map