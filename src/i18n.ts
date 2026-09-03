import * as vscode from "vscode";

type LocaleMessage = {
  en: string;
  zhCN: string;
};

const messages: Record<string, LocaleMessage> = {
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
    en: "Invalid bibliography file name '{value}'. Expected a path ending in .bib.",
    zhCN: "参考文献文件名“{value}”无效；路径必须以 .bib 结尾。",
  },
  "error.bibPathOutsideWorkspace": {
    en: "The bibliography path is outside the current workspace: {path}",
    zhCN: "参考文献路径位于当前工作区之外：{path}",
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
  "error.noRunnableCommandForLanguage": {
    en: "No runnable Zotero command for current language: {lang}",
    zhCN: "当前语言 {lang} 下没有可运行的 Zotero 命令。",
  },
  "error.zoteroEndpointUnavailable": {
    en: "Cannot access Zotero endpoint {endpoint} at {url}. Please ensure Zotero is running and Better BibTeX is enabled, then verify setting '{settingKey}'. Details: {message}",
    zhCN: "无法访问 Zotero 接口 {endpoint}（{url}）。请确认 Zotero 已启动且 Better BibTeX 已启用，然后检查设置项“{settingKey}”。详情：{message}",
  },
  "error.caywSelectionTimeout": {
    en: "Zotero citation selection did not finish within {minutes} minutes. Run the command again and complete or cancel the Better BibTeX picker.",
    zhCN: "Zotero 文献选择未在 {minutes} 分钟内完成。请重新运行命令，并在 Better BibTeX 选择器中完成选择或取消。",
  },
  "error.invalidEndpointUrl": {
    en: "Setting '{settingKey}' must be an HTTP(S) URL without embedded credentials: {url}",
    zhCN: "设置项“{settingKey}”必须是不含内嵌凭据的 HTTP(S) URL：{url}",
  },
  "error.invalidInspireEndpointUrl": {
    en: "The Zotero Inspire endpoint must use HTTP loopback and the exact path /connector/zinspireBibtex: {url}",
    zhCN: "Zotero Inspire 接口必须使用本机 HTTP 地址及固定路径 /connector/zinspireBibtex：{url}",
  },
  "error.inspireTokenAutoDiscoveryFailed": {
    en: "Zotero Cite could not find the zotero-inspire read token in the local Zotero profile. Ensure zotero-inspire is enabled and restart Zotero.",
    zhCN: "Zotero Cite 无法在本机 Zotero profile 中找到 zotero-inspire 只读令牌。请确认已启用 zotero-inspire，并重启 Zotero。",
  },
  "error.inspireTokenRejected": {
    en: "Zotero Inspire rejected every read token found in the local Zotero profiles. Restart Zotero so the profile and running plugin use the same token.",
    zhCN: "Zotero Inspire 拒绝了本机 Zotero profiles 中发现的全部只读令牌。请重启 Zotero，使 profile 与运行中的插件使用同一令牌。",
  },
  "error.inspireTokenUnavailable": {
    en: "Zotero Inspire could not initialize its read token. Restart Zotero and try again.",
    zhCN: "Zotero Inspire 无法初始化只读令牌，请重启 Zotero 后重试。",
  },
  "error.inspireEndpointMissing": {
    en: "The zotero-inspire BibTeX endpoint is not registered. Ensure a compatible zotero-inspire build is enabled in Zotero.",
    zhCN: "zotero-inspire BibTeX 接口尚未注册，请确认 Zotero 已启用兼容版本的 zotero-inspire。",
  },
  "error.inspireEndpointUnavailable": {
    en: "Cannot access the zotero-inspire BibTeX endpoint: {message}",
    zhCN: "无法访问 zotero-inspire BibTeX 接口：{message}",
  },
  "error.unsupportedInspireApiVersion": {
    en: "Unsupported zotero-inspire BibTeX API version: {version}",
    zhCN: "不支持的 zotero-inspire BibTeX API 版本：{version}",
  },
  "error.invalidInspireApiResponse": {
    en: "zotero-inspire returned an invalid BibTeX API response.",
    zhCN: "zotero-inspire 返回了无效的 BibTeX API 响应。",
  },
  "error.inspireFallbackRejected": {
    en: "zotero-inspire returned non-INSPIRE BibTeX for {key}; the fallback was rejected because Zotero Inspire is the selected source.",
    zhCN: "zotero-inspire 为 {key} 返回的 BibTeX 并非来自 INSPIRE；由于已选择 Zotero Inspire 来源，该回退结果已被拒绝。",
  },
  "error.inspireEntryKeyMismatch": {
    en: "zotero-inspire returned BibTeX whose entry key does not match {key}.",
    zhCN: "zotero-inspire 返回的 BibTeX 条目键与 {key} 不一致。",
  },
  "error.inspireBibtexFailed": {
    en: "Could not obtain INSPIRE BibTeX for all requested entries: {details}. No bibliography file was changed.",
    zhCN: "无法从 INSPIRE 获取全部请求条目：{details}。参考文献文件未被修改。",
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
  "error.noZoteroGroups": {
    en: "Zotero returned no accessible libraries or groups.",
    zhCN: "Zotero 未返回可访问的文库或分组。",
  },
  "error.groupNotFound": {
    en: "Zotero item '{itemKey}' belongs to unknown library or group '{groupName}'.",
    zhCN: "Zotero 条目“{itemKey}”属于未知文库或分组“{groupName}”。",
  },
  "error.duplicateZoteroGroupName": {
    en: "Multiple Zotero groups have the same name '{groupName}'; rename them to avoid ambiguous export.",
    zhCN: "多个 Zotero 分组使用了同一名称“{groupName}”；请重命名以避免导出歧义。",
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
  "error.fetchGroupBibliographyFailed": {
    en: "Failed to fetch bibliography for group '{groupName}': {message}",
    zhCN: "获取分组 '{groupName}' 的参考文献失败：{message}",
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
  "error.emptyBibliographyFromZotero": {
    en: "Zotero returned an empty bibliography; no file was changed.",
    zhCN: "Zotero 返回了空参考文献；未修改任何文件。",
  },
  "error.missingBibliographyEntries": {
    en: "Zotero did not return the requested BibTeX entries: {keys}. No file was changed.",
    zhCN: "Zotero 未返回所请求的 BibTeX 条目：{keys}。未修改任何文件。",
  },
  "error.bibliographyWriteVerificationFailed": {
    en: "The bibliography write could not be verified for {file}.",
    zhCN: "无法验证参考文献文件 {file} 的写入结果。",
  },
  "error.editorRejectedEdit": {
    en: "The editor rejected the requested citation edit.",
    zhCN: "编辑器拒绝了本次引用文本修改。",
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
  "log.unavailableBibEntry": {
    en: "BibTeX entry {key} was unavailable from the selected source ({code}): {message}",
    zhCN: "所选来源无法提供 BibTeX 条目 {key}（{code}）：{message}",
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
  "quickPick.taskPickerTitle": {
    en: "Zotero Project Tasks",
    zhCN: "Zotero 项目任务",
  },
  "quickPick.taskPickerPlaceholder": {
    en: "Select a Zotero command to run",
    zhCN: "请选择要执行的 Zotero 命令",
  },
  "quickPick.bibliographyFileTitle": {
    en: "Select Bibliography File",
    zhCN: "选择参考文献文件",
  },
  "quickPick.bibliographyFilePlaceholder": {
    en: "Multiple bibliography files are referenced by this LaTeX project",
    zhCN: "当前 LaTeX 项目引用了多个参考文献文件",
  },
  "quickPick.availableFor": {
    en: "Available for: {langs}",
    zhCN: "可用于：{langs}",
  },
  "quickPick.command.citeSmart": {
    en: "Cite + Bibliography (Smart)",
    zhCN: "智能引用并更新文献",
  },
  "quickPick.command.exportBibLatex": {
    en: "Export BibLaTeX",
    zhCN: "导出 BibLaTeX",
  },
  "quickPick.command.addCitation": {
    en: "Add Citation for Pandoc/LaTeX",
    zhCN: "为 Pandoc/LaTeX 添加引用",
  },
  "quickPick.command.citeBibliography": {
    en: "Cite and Create Bibliography for Pandoc/LaTeX",
    zhCN: "为 Pandoc/LaTeX 添加引用并更新文献",
  },
  "quickPick.command.citeMarkdownBibliography": {
    en: "Cite and Create Bibliography for Markdown",
    zhCN: "为 Markdown 添加引用并更新文献",
  },
  "quickPick.command.addHyperLinkCitation": {
    en: "Cite Hyperlink",
    zhCN: "超链接引用",
  },
  "quickPick.command.updateBibtexFromZotero": {
    en: "Update BibTeX Entries",
    zhCN: "更新 BibTeX 条目",
  },
  "statusBar.taskPickerText": {
    en: "$(list-selection) Zotero",
    zhCN: "$(list-selection) Zotero",
  },
  "statusBar.taskPickerTooltip": {
    en: "Open Zotero command picker",
    zhCN: "打开 Zotero 命令选择器",
  },
  "hover.footnote.title": {
    en: "Footnote [^{key}]",
    zhCN: "脚注 [^{key}]",
  },
  "hover.pandoc.title": {
    en: "Pandoc citation @{key}",
    zhCN: "Pandoc 引用 @{key}",
  },
  "hover.sourceLabel": {
    en: "Source: {source}",
    zhCN: "来源：{source}",
  },
  "hover.source.localBib": {
    en: "local BibTeX",
    zhCN: "本地 BibTeX",
  },
  "hover.source.zotero": {
    en: "Zotero (cached)",
    zhCN: "Zotero（缓存）",
  },
  "hover.notFound.footnote": {
    en: "No footnote definition found for key {key}.",
    zhCN: "未找到键 {key} 对应的脚注定义。",
  },
  "hover.notFound.pandoc": {
    en: "No citation preview found for key {key} in local BibTeX or Zotero.",
    zhCN: "在本地 BibTeX 与 Zotero 中都未找到键 {key} 的引用预览。",
  },
  "hover.notFound.crossRef": {
    en: "No element with label {key} found in the document.",
    zhCN: "在文档中未找到标签 {key} 对应的元素。",
  },
  "hover.crossRef.title": {
    en: "Pandoc cross-reference @{key} ({type})",
    zhCN: "Pandoc 交叉引用 @{key}（{type}）",
  },
  "hover.crossRef.figure": {
    en: "Figure",
    zhCN: "图",
  },
  "hover.crossRef.table": {
    en: "Table",
    zhCN: "表",
  },
  "hover.crossRef.equation": {
    en: "Equation",
    zhCN: "公式",
  },
  "hover.crossRef.section": {
    en: "Section",
    zhCN: "节",
  },
  "hover.crossRef.listing": {
    en: "Listing",
    zhCN: "代码块",
  },
  "hover.crossRef.unknown": {
    en: "Cross-reference",
    zhCN: "交叉引用",
  },
  "hover.localBib.fallback": {
    en: "Found local BibTeX entry for key {key}.",
    zhCN: "已找到键 {key} 的本地 BibTeX 条目。",
  },
  "completion.source.footnote": {
    en: "Existing footnote",
    zhCN: "已有脚注",
  },
  "completion.source.localBib": {
    en: "Local BibTeX",
    zhCN: "本地 BibTeX",
  },
  "completion.source.zotero": {
    en: "Zotero (cached)",
    zhCN: "Zotero（缓存）",
  },
  "completion.source.document": {
    en: "Existing in document",
    zhCN: "文档中已使用",
  },
  "completion.noSummary": {
    en: "No summary available",
    zhCN: "暂无摘要信息",
  },
  "completion.summary.existingDocument": {
    en: "Citation key {key} already appears in the current document.",
    zhCN: "引用键 {key} 已在当前文档中出现。",
  },
  "completion.summary.localBibFallback": {
    en: "Found local BibTeX entry for key {key}.",
    zhCN: "已找到键 {key} 的本地 BibTeX 条目。",
  },
  "activate.message": {
    en: "Your extension \"zotero-cite\" is now active.",
    zhCN: "扩展 \"zotero-cite\" 已激活。",
  },
};

function getLanguageKey(): keyof LocaleMessage {
  const locale = (vscode.env.language || "en").toLowerCase();
  if (locale.startsWith("zh")) {
    return "zhCN";
  }
  return "en";
}

export function t(key: string, vars?: Record<string, string | number>): string {
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

export function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
