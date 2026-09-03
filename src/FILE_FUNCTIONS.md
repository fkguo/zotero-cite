# 源码文件功能说明

本文档用于说明 `src/` 目录下各文件的职责，以及模块之间的协作关系。

## 架构概览

- `extension.ts`：扩展入口层，仅负责激活与释放。
- `commands.ts`：应用编排层，把 VS Code 命令连接到业务流程。
- `editor.ts`、`citationParser.ts`、`zotero.ts`、`inspireBibtex.ts`、`inspireSecret.ts`、`zoteroProfile.ts`、`bibtexParser.ts`、`bibtexStore.ts`、`bibPath.ts`、`bibliographyResolver.ts`、`latexBibliography.ts`：能力模块。
- `config.ts`、`ui.ts`、`i18n.ts`：基础设施模块。
- `bibliography.ts`：文献导出领域服务，负责按分组聚合与进度反馈。

## 文件逐项说明

### `extension.ts`

职责：
- 保持入口文件轻量化。
- 在 `activate` 阶段注册全部命令。
- 在 `deactivate` 阶段释放 UI 资源。

关键导出：
- `activate(context)`
- `deactivate()`

依赖：
- `commands.ts`
- `ui.ts`
- `i18n.ts`

### `commands.ts`

职责：
- 命令总编排层。
- 实现用户命令主流程（如 `citeSmart`、导出 bibliography、从 Zotero 更新 bib）。
- 协调编辑器写入、Zotero 访问、bib 文件读写。

关键导出：
- `registerCommands(context)`

主要内部流程：
- `exportBibLatex()`
- `citeMarkdownBibliography()`
- `addCitation()`
- `citeBibliography()`
- `updateBibEntries()`
- `citeSmart()`

依赖：
- `editor.ts`
- `zotero.ts`
- `bibliography.ts`
- `bibtexStore.ts`
- `bibPath.ts`
- `config.ts`
- `ui.ts`
- `i18n.ts`

### `config.ts`

职责：
- 提供 `zotero-cite` 配置的统一读取。
- 处理默认值（状态栏提示时长、接口地址、样式参数等）。
- 维护内存态的最近 bib 文件名缓存。

关键导出：
- `getStatusMessageDuration()`
- `getBibliographyStyle()`
- `getLatexBibStyle()`
- `getDefaultBibName()`
- `getExplicitBibName(resource?)`
- `setLatestBibName(value)`
- `getMinimizeZotero()`
- `getJsonRpcUrl()`
- `getCaywUrl()`
- `getBibtexSource()`
- `getZoteroInspireBibtexUrl()`

### `ui.ts`

职责：
- 封装用户可见的 UI 交互。
- 管理输出面板 `OutputChannel` 生命周期。

关键导出：
- `getOutputChannel()`
- `showStatusMessage(message)`
- `showErrorMessage(message)`
- `showInformationMessage(message)`
- `disposeUiResources()`

### `i18n.ts`

职责：
- 运行时国际化（英文与简体中文）。
- 支持模板字符串变量替换。
- 提供统一错误对象转文本方法。

关键导出：
- `t(key, vars?)`
- `errorToMessage(error)`

### `editor.ts`

职责：
- 处理编辑器文本插入与引用解析。
- 按语言类型（Markdown / LaTeX）插入引用。
- 通过光标邻域解析，支持在已有引用环境中追加键。

关键导出：
- `getActiveEditor()`
- `insertTextAsync(...)`
- `getDocumentCiteKeys(...)`
- `insertCiteKeys(...)`
- `makeId(length)`

### `citationParser.ts`

职责：
- 以纯函数解析 LaTeX 与 Pandoc/Markdown 引用。
- 将带 locator 的 Pandoc 引用与 LaTeX 可选参数同 citekey 分离。
- 识别引用环境区间，并排除 pandoc-crossref 标签。

### `bibPath.ts`

职责：
- 校验 bib 文件名是否合法。
- 解析包含 VS Code 变量的路径模板。
- 生成目标 bib 文件的绝对 `vscode.Uri`。

关键导出：
- `validateBibName(bibName)`
- `applyBibTemplateVariables(template, filePath)`
- `resolveBibPath(currentFileUri, bibNameTemplate)`

### `bibliographyResolver.ts` 与 `latexBibliography.ts`

职责：
- 在显式 `defaultBibName`、LaTeX 自动检测与 `ref.bib` 回退之间执行统一优先级。
- 识别 BibTeX/biblatex 资源命令、TeX root 指令和递归 include 关系。
- 多参考文献文件时要求用户选择，并保持虚拟工作区 URI 的 scheme、authority 与 query。

关键导出：
- `resolveDocumentBibliographyPath(document, options?)`
- `detectLatexBibliographyPaths(document)`
- `extractLatexBibliographyReferences(content)`

### `zotero.ts`

职责：
- 封装 Better BibTeX 远程通信。
- 提供 JSON-RPC 调用与 CAYW 引用键获取。
- 提供命令层所需的 Zotero 业务接口。

关键导出：
- `pickCiteKeys()`
- `getMarkdownBibliography(citeKey)`
- `getGroups()`
- `getItemGroupName(key)`
- `getBibliographyInGroup(keys, groupId)`
- `getBibtexFromZotero(citeKey)`
- `sanitizeBibtexFields(bibText)`

### `inspireBibtex.ts`、`inspireSecret.ts` 与 `zoteroProfile.ts`

职责：
- 调用 zotero-inspire API v1 的 `ping` 与 `fetch` 操作。
- 只向数值型本机回环地址发送专用只读令牌，并限制响应大小、超时和重定向。
- 校验响应顺序、引用键与 BibTeX entry key；选择 zotero-inspire 时拒绝 Better BibTeX fallback。
- 按服务端声明的批量上限切分请求，并保留逐条失败信息。
- 自动定位 macOS、Windows、Linux 与 Linux Flatpak 的标准 Zotero profiles，从 `prefs.js` 发现专用只读令牌。
- 验证成功后通过 VS Code/Cursor Secret Storage 缓存令牌，避免人工配置和写入工作区设置。

关键导出：
- `fetchInspireBibtexEntries(keys)`
- `getInspireBibliography(keys)`
- `initializeInspireSecretStorage(storage)`
- `storeInspireReadToken(value)`
- `discoverZoteroInspireReadTokens()`

### `bibtexStore.ts`

职责：
- 读取、解析、写入 `.bib` 文件。
- 基于 citekey 去重，并串行化对同一 `.bib` 文件的并发修改。
- 在临时文件完成解析验证后原子替换目标文件。

关键导出：
- `getBibliographyKeyFromFile(bibPath)`
- `readBibEntriesFromFile(bibPath)`
- `toBibtex(entry)`
- `ensureBibliographyEntries(bibPath, requestedKeys, fetchBibliography)`
- `writeBibliographyText(bibPath, content)`
- `transformBibEntriesAtomically(bibPath, transform)`

### `bibtexParser.ts`

职责：
- 在独立 worker 中解析不可信 BibTeX 文本。
- 对输入大小和解析时间设置硬上限，避免解析器阻塞扩展宿主。
- 序列化已经验证的 BibTeX 条目。
- 开发构建输出到 `out/`；发布时主扩展和独立 parser worker 分别 bundle 到 `dist/extension.js` 与 `dist/bibtexWorker.js`。

### `bibliography.ts`

职责：
- 根据配置选择 Better BibTeX 或 zotero-inspire，并按引用键列表生成 bibliography 文本。
- Better BibTeX 来源先按 Zotero 库/分组归并；zotero-inspire 来源按 API 上限批量获取。
- 处理进度提示和取消流程；任一条目或分组失败时整体终止，禁止部分导出覆盖文件。

关键导出：
- `getBibliography(keys)`
- `getBibtexEntries(keys)`

## 命令映射说明

- `zotero-cite.citeSmart`：按文件语言自动路由（`markdown` 或 `latex`）。
- `zotero-cite.exportBibLatex`：将文档内引用键整体导出为 `.bib`。
- `zotero-cite.addCitation`：仅插入引用键。
- `zotero-cite.citeBibliography`：插入引用键并追加缺失 bib 条目。
- `zotero-cite.citeMarkdownBibliography`：插入 Markdown 脚注式文献条目。
- `zotero-cite.addHyperLinkCitation`：把剪贴板链接转换为脚注引用。
- `zotero-cite.updateBibtexFromZotero`：按现有 `.bib` 键从 Zotero 刷新条目。

## 维护建议

- `extension.ts` 保持最小化，新功能入口优先放到 `commands.ts`。
- 网络访问统一放在 `zotero.ts` 与 `inspireBibtex.ts`，不要散落在命令处理函数中。
- 编辑器文本处理放在 `editor.ts`，避免命令层堆叠细节。
- 文件系统与 BibTeX 解析放在 `bibtexStore.ts`。
- 所有用户可见文案统一通过 `i18n.ts` 管理。
