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
exports.errorToMessage = exports.t = void 0;
const vscode = __importStar(require("vscode"));
const messages = {
    "error.noActiveEditor": {
        en: "No active text editor found.",
        zhCN: "未找到当前活动编辑器。",
    },
    "error.saveCurrentFileBeforeExport": {
        en: "Please save the current file before exporting BibTeX.",
        zhCN: "导出 BibTeX 前请先保存当前文件。",
    },
    "error.noWorkspaceFolder": {
        en: "No workspace folder is open. Cannot save the .bib file to the workspace root.",
        zhCN: "未打开工作区文件夹，无法将 .bib 文件保存到工作区根目录。",
    },
    "input.fileNamePrompt": {
        en: "File Name:",
        zhCN: "文件名：",
    },
    "error.cancelled": {
        en: "Cancelled.",
        zhCN: "已取消。",
    },
    "error.invalidBibName": {
        en: "bibName is invalid or its length is less than 5.",
        zhCN: "bibName 无效或长度小于 5。",
    },
    "error.noKeyDetected": {
        en: "No key detected.",
        zhCN: "未检测到引用键。",
    },
    "status.exportSuccess": {
        en: "Export successfully.",
        zhCN: "导出成功。",
    },
    "status.exportCancelled": {
        en: "Bibliography export cancelled.",
        zhCN: "参考文献导出已取消。",
    },
    "error.noItemSelected": {
        en: "No item is selected.",
        zhCN: "未选择条目。",
    },
    "error.saveCurrentTab": {
        en: "Please save current tab.",
        zhCN: "请先保存当前标签页。",
    },
    "error.readBibliographyFile": {
        en: "Error reading bibliography file {file}: {message}",
        zhCN: "读取参考文献文件 {file} 时出错：{message}",
    },
    "status.bibliographyUpdated": {
        en: "Bibliography updated: {count} new entries appended to {file}.",
        zhCN: "参考文献已更新：向 {file} 追加了 {count} 条新记录。",
    },
    "error.itemNotFound": {
        en: "'{key}' is not found.",
        zhCN: "未找到 '{key}'。",
    },
    "progress.exportBibliography": {
        en: "Exporting bibliography...",
        zhCN: "正在导出参考文献...",
    },
    "progress.fetchingItemGroup": {
        en: "Fetching group info for {itemKey}...",
        zhCN: "正在获取 {itemKey} 的分组信息...",
    },
    "progress.fetchingGroupBibliography": {
        en: "Fetching bibliography for group '{groupName}'...",
        zhCN: "正在获取分组 '{groupName}' 的参考文献...",
    },
    "info.exportSuccessWithErrors": {
        en: "Bibliography exported, but some errors occurred. Check the output panel.",
        zhCN: "参考文献已导出，但存在部分错误，请查看输出面板。",
    },
    "status.exportBibliographySuccess": {
        en: "Bibliography exported successfully.",
        zhCN: "参考文献导出成功。",
    },
    "error.noClipboardData": {
        en: "No data in clipboard.",
        zhCN: "剪贴板中没有可用内容。",
    },
    "error.noResultFromZotero": {
        en: "No result returned from Zotero.",
        zhCN: "Zotero 未返回结果。",
    },
    "error.fetchFromZoteroFailed": {
        en: "Failed to fetch from Zotero: {message}",
        zhCN: "从 Zotero 获取失败：{message}",
    },
    "log.updateBibEntriesHeader": {
        en: "--- Zotero Cite: updateBibEntries log ---",
        zhCN: "--- Zotero Cite：updateBibEntries 日志 ---",
    },
    "log.notFoundBibEntry": {
        en: "Not found bib entry {key} in Zotero.",
        zhCN: "在 Zotero 中未找到 bib 条目 {key}。",
    },
    "info.missingBibEntries": {
        en: "{count} bib entries not found in Zotero.",
        zhCN: "有 {count} 条 bib 记录未在 Zotero 中找到。",
    },
    "action.showList": {
        en: "Show list",
        zhCN: "查看列表",
    },
    "action.copyList": {
        en: "Copy list",
        zhCN: "复制列表",
    },
    "info.missingKeysCopied": {
        en: "Missing keys copied to clipboard.",
        zhCN: "缺失键列表已复制到剪贴板。",
    },
    "info.bibEntriesUpdated": {
        en: "{processed} of {total} bib entries successfully updated.",
        zhCN: "已成功更新 {processed}/{total} 条 bib 记录。",
    },
    "error.updateBibtexFailed": {
        en: "Error updating BibTeX file: {message}",
        zhCN: "更新 BibTeX 文件失败：{message}",
    },
    "error.unsupportedLanguage": {
        en: "Unsupported language: {lang}",
        zhCN: "不支持的语言类型：{lang}",
    },
    "activate.message": {
        en: "Your extension \"zotero-cite\" is now active.",
        zhCN: "扩展 \"zotero-cite\" 已激活。",
    },
};
function getLanguageKey() {
    const locale = (vscode.env.language || "en").toLowerCase();
    if (locale.startsWith("zh")) {
        return "zhCN";
    }
    return "en";
}
function t(key, vars) {
    const entry = messages[key];
    let template = entry ? entry[getLanguageKey()] : key;
    if (!vars) {
        return template;
    }
    Object.keys(vars).forEach((name) => {
        const value = String(vars[name]);
        template = template.replace(new RegExp(`\\{${name}\\}`, "g"), value);
    });
    return template;
}
exports.t = t;
function errorToMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
exports.errorToMessage = errorToMessage;
//# sourceMappingURL=i18n.js.map