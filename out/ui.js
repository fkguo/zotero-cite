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
exports.disposeUiResources = exports.showInformationMessage = exports.showErrorMessage = exports.showStatusMessage = exports.getOutputChannel = void 0;
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
const outputChannel = vscode.window.createOutputChannel("Zotero Cite");
function getOutputChannel() {
    return outputChannel;
}
exports.getOutputChannel = getOutputChannel;
function showStatusMessage(message) {
    vscode.window.setStatusBarMessage(message, (0, config_1.getStatusMessageDuration)());
}
exports.showStatusMessage = showStatusMessage;
function showErrorMessage(message) {
    void vscode.window.showErrorMessage(message);
}
exports.showErrorMessage = showErrorMessage;
function showInformationMessage(message) {
    void vscode.window.showInformationMessage(message);
}
exports.showInformationMessage = showInformationMessage;
function disposeUiResources() {
    outputChannel.dispose();
}
exports.disposeUiResources = disposeUiResources;
//# sourceMappingURL=ui.js.map