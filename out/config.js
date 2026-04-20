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
exports.getCaywUrl = exports.getJsonRpcUrl = exports.getMinimizeZotero = exports.setLatestBibName = exports.getDefaultBibName = exports.getLatexBibStyle = exports.getBibliographyStyle = exports.getShowCommandPickerInStatusBar = exports.getStatusMessageDuration = void 0;
const vscode = __importStar(require("vscode"));
const CONFIG_SECTION = "zotero-cite";
let latestBibName = "";
function getConfiguration() {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
}
function getStatusMessageDuration() {
    const duration = Number(getConfiguration().get("statusMessageDuration", 1500));
    return Number.isFinite(duration) && duration > 0 ? duration : 1500;
}
exports.getStatusMessageDuration = getStatusMessageDuration;
function getShowCommandPickerInStatusBar() {
    return getConfiguration().get("showCommandPickerInStatusBar", true);
}
exports.getShowCommandPickerInStatusBar = getShowCommandPickerInStatusBar;
function getBibliographyStyle() {
    return getConfiguration().get("bibliograpyStyle", "http://www.zotero.org/styles/apa");
}
exports.getBibliographyStyle = getBibliographyStyle;
function getLatexBibStyle() {
    return getConfiguration().get("latexBibStyle", "bibtex");
}
exports.getLatexBibStyle = getLatexBibStyle;
function getDefaultBibName() {
    if (latestBibName === "") {
        latestBibName = getConfiguration().get("defaultBibName", "ref.bib");
    }
    return latestBibName;
}
exports.getDefaultBibName = getDefaultBibName;
function setLatestBibName(value) {
    latestBibName = value;
}
exports.setLatestBibName = setLatestBibName;
function getMinimizeZotero() {
    return getConfiguration().get("minimizeZotero", "");
}
exports.getMinimizeZotero = getMinimizeZotero;
function getJsonRpcUrl() {
    return getConfiguration().get("jsonRpcUrl", "http://localhost:23119/better-bibtex/json-rpc");
}
exports.getJsonRpcUrl = getJsonRpcUrl;
function getCaywUrl() {
    return getConfiguration().get("caywUrl", "http://localhost:23119/better-bibtex/cayw");
}
exports.getCaywUrl = getCaywUrl;
//# sourceMappingURL=config.js.map