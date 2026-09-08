# Zotero Cite

[English](README.md) | 简体中文

在 VS Code 或 Cursor 中从 Zotero 选择文献、插入引用，并更新参考文献文件。支持 LaTeX、Markdown、Pandoc、Quarto（`.qmd`）、R Markdown（`.rmd`）和 MDX（`.mdx`），也支持通过 [fkguo 的 Overleaf Workshop fork](https://github.com/fkguo/Overleaf-Workshop) 打开的项目。

## 安装

1. 下载 [zotero-cite-0.11.2.vsix](https://github.com/fkguo/zotero-cite/releases/download/v0.11.2/zotero-cite-0.11.2.vsix)；也可进入[发行版页面](https://github.com/fkguo/zotero-cite/releases/tag/v0.11.2)下载附件。不要选择源码压缩包。
2. 在 VS Code 或 Cursor 的扩展面板中打开右上角菜单，选择 **Install from VSIX…（从 VSIX 安装）**，然后选择下载的文件。
3. 安装完成后，运行命令面板中的 **Developer: Reload Window（重新加载窗口）**。

使用前请启动本机 Zotero，并启用 Better BibTeX。编辑器需为 VS Code 1.61 或更高版本，或兼容的 Cursor 版本。

## 快速上手

1. 打开项目文件夹，或通过 Overleaf Workshop 打开项目；确认工作区受信任且文件可写。
2. 打开并保存要编辑的文档，将光标放在需要引用的位置。
3. 点击编辑器右上角的 Zotero Cite 按钮，或运行命令 **Zotero Cite：引用并更新文献 / Cite + Bibliography**。
4. 在 Zotero 选择器中选中文献并确认。LaTeX 文档会插入引用并补充 `.bib` 中缺失的条目；Markdown 类文档会插入脚注引用及文献内容。

如果只想插入引用而不更新 `.bib`，使用 **Add Citation for Pandoc/LaTeX**；如果希望在 Markdown 中使用 `[@key]` 并更新 `.bib`，使用 **Cite and Create Bibliography for Pandoc/LaTeX**。

扩展没有预设 Option+Z 快捷键。如需使用，可在编辑器的“键盘快捷方式”中找到 **Zotero Cite：引用并更新文献** 并绑定。

## 插件功能与操作演示

以下演示来自[上游 Zotero Cite](https://gitee.com/rusterx/zotero-cite)。演示中的界面和命令名称可能与当前版本略有不同。

### Zotero Cite: Export BibLaTeX

查询当前编辑的 Markdown、Pandoc 或 LaTeX 文档，根据引用的 key，导出引用至 `.bib` 文件。

打开并保存文档，在命令面板运行 **Export BibLaTeX**，输入目标 `.bib` 文件名，即可导出文档中引用的文献。目标文件已经存在时会整体替换其内容。

![导出文档中引用的文献到 bibliography 文件](https://s2.loli.net/2022/02/07/by74icsMBRuVfO9.gif)

### Zotero Cite: Add Citation for Pandoc/LaTeX

如果你想在 Pandoc 或 LaTeX 文档的书写过程中插入 citation，但不想更新 `.bib` 文件，可以使用此命令。

将光标放在需要引用的位置，运行 **Add Citation for Pandoc/LaTeX**，在 Zotero 选择器中选中文献并确认。插件会插入引用键；在已有引用内部操作时可以追加引用。

![在 Pandoc 和 LaTeX 中插入引用而不更新 bibliography](https://s2.loli.net/2022/02/07/ZQSoTM69wdYAB4l.gif)

### Zotero Cite: Cite and Create Bibliography for Pandoc/LaTeX

如果你想在 Pandoc 或 LaTeX 文档的书写过程中，插入 citation 的同时更新 `.bib` 文件，可以使用此命令。

运行 **Cite and Create Bibliography for Pandoc/LaTeX** 并选择文献后，插件会补充 `.bib` 中缺少的条目，再插入引用。LaTeX 项目会自动识别参考文献文件；也可以通过 `zotero-cite.defaultBibName` 指定路径，详见下方的自动选择说明。

![在 Pandoc 和 LaTeX 中插入引用并更新 bibliography](https://s2.loli.net/2022/02/07/vefSHTJWnG6DAt7.gif)

### Zotero Cite: Cite and Create Bibliography for Markdown

如果你想在 Markdown、Quarto（`.qmd`）、R Markdown（`.rmd`）或 MDX（`.mdx`）文档的书写过程中，插入 citation 的同时更新脚注，可以使用此命令。

运行 **Cite and Create Bibliography for Markdown** 并选择文献后，正文会插入 `[^key]` 形式的脚注引用，文档末尾会补充相应的文献信息。这一命令使用文档内脚注，无需单独的 `.bib` 文件。

![在 Markdown 中插入引用并添加文献脚注](https://s2.loli.net/2022/02/07/IcuWZpy7zLJFUsY.gif)

### Zotero Cite: Cite Hyperlink

先将网页链接复制到剪贴板，再将光标放在 Markdown 类文档的引用位置，运行 **Cite Hyperlink**。插件会插入脚注引用，并在文档末尾添加该链接的脚注说明。

![在 Markdown 中插入超链接引用](https://s2.loli.net/2022/05/04/eMSAvoIQC9gViTG.gif)

### Zotero Cite: Update BibTeX Entries

打开 `.bib` 文件并运行 **Update BibTeX Entries**，可以从所选文献来源更新当前文件的条目；在 LaTeX 文档中运行时，会更新自动识别或通过 `defaultBibName` 指定的 `.bib` 文件。

无法匹配或获取的条目会保留，相关原因可在 Zotero Cite 输出面板查看。文献来源可选择 Better BibTeX 或 zotero-inspire，详见下方的来源设置。

## 自动选择 LaTeX 参考文献文件

通常不需要设置 `.bib` 路径。插件可以识别：

- `\bibliography{refs}`，包括逗号分隔的多个文件。
- `\addbibresource{refs.bib}`、`\addglobalbib` 和 `\addsectionbib`。
- `% !TeX root = main.tex` 根文件指令。
- 通过 `\input`、`\include` 和 `\subfile` 引入的项目文件。

检测到多个 `.bib` 文件时会要求选择，并在本次编辑器会话中记住选择。无法从 LaTeX 声明确定路径时，会查找工作区已有的 `.bib` 文件；仍未找到时使用 `ref.bib`。

如需固定使用某个文件，设置 `zotero-cite.defaultBibName`，例如 `references/refs.bib`。显式设置优先于自动检测；删除该设置或设为空字符串即可恢复自动检测。本地项目和 Overleaf Workshop 项目均可使用这一功能。

## 合并到已有引用

光标紧接在 `\cite{Old}` 的右花括号之后时，选择 `New` 会得到：

```latex
\cite{Old, New}
```

已有的引用键会跳过，不会重复添加。光标位于引用命令内部时同样可以追加；位于两个紧邻引用命令之间时，会追加到前一个。若中间隔着空格、换行或标点，则插入新的引用命令。

可以通过 `zotero-cite.latexCitationCommand` 设置新引用使用的命令，例如 `citep`、`citet`、`parencite` 或 `autocite`，不需要填写前导反斜杠。合并支持所配置的命令及普通 `\cite`，并保留星号和可选参数，例如：

```latex
\citep[see][p. 3]{Old, New}
```

## 选择 BibTeX 来源

通过 `zotero-cite.bibtexSource` 选择写入 `.bib` 的文献来源：

- `better-bibtex`（默认）：使用 Zotero 中的文献数据，由 Better BibTeX 导出。
- `zotero-inspire`：从 INSPIRE-HEP 获取 BibTeX。使用前需在 Zotero 中启用支持 BibTeX 接口的 zotero-inspire 插件。

这一设置适用于导出 `.bib`、补充缺失条目和更新已有条目。两种来源均需 Better BibTeX 提供文献选择器；Markdown 脚注式文献仍使用 Better BibTeX。

选择 `zotero-inspire` 后，无法从 INSPIRE-HEP 获取条目时，本次新增引用会取消并提示原因。更新已有 `.bib` 时，无法获取的条目会保留，原因可在 Zotero Cite 输出面板查看。

搭配 zotero-inspire 的安装、文献准备及设置示例见[英文使用指南](README.md#use-with-zotero-inspire-inspire-hep-bibtex)。

## 常用命令

可在命令面板中搜索 `Zotero Cite`。命令名称会随编辑器语言显示为中文或英文。

| 命令 | 用途 |
| --- | --- |
| Cite + Bibliography | 根据文档类型插入引用并更新文献；LaTeX 使用 `.bib`，Markdown 类文档使用脚注。 |
| Add Citation for Pandoc/LaTeX | 仅插入引用，不更新参考文献文件。 |
| Cite and Create Bibliography for Pandoc/LaTeX | 插入 LaTeX 或 Pandoc 引用，并补充 `.bib` 中缺失的条目。 |
| Cite and Create Bibliography for Markdown | 插入脚注引用，并在 Markdown 类文档末尾补充文献信息。 |
| Export BibLaTeX | 导出当前文档引用的文献，提示输入目标 `.bib` 文件名；已有目标文件会被整体替换。 |
| Update BibTeX Entries | 按所选 BibTeX 来源更新条目；打开 `.bib` 时更新当前文件，在 LaTeX 中运行时使用自动检测或显式指定的路径。未匹配条目保留。 |
| Cite Hyperlink | 在 Markdown 类文档中，将剪贴板中的链接插入为脚注。 |

## 常用设置

在编辑器设置中搜索 `zotero-cite`：

- `defaultBibName`：覆盖自动检测的 `.bib` 路径。支持 `${workspaceFolder}`、`${fileBasename}`、`${fileBasenameNoExtension}`、`${fileDirname}` 和 `${fileExtname}` 占位符。
- `latexCitationCommand`：LaTeX 引用命令，默认为 `cite`。
- `latexBibStyle`：Better BibTeX 导出格式，可设为 `bibtex` 或 `biblatex`，默认为 `bibtex`。
- `bibtexSource`：BibTeX 来源，默认为 `better-bibtex`。
- `excludedBibFields`：Better BibTeX 导出时排除的字段，默认排除 `file` 和 `annotation`。
- `showMarkdownCitationHoverPreview`：显示 Markdown 中 `[^key]` 与 `@key` 的悬浮预览，默认开启。
- `showMarkdownCitationCompletion`：输入 `[^` 或 `@` 时显示 Markdown 引用建议列表，默认开启。

## 搭配 Overleaf Workshop

本文所述的 Overleaf 使用方式推荐搭配 **[fkguo 的 Overleaf Workshop fork](https://github.com/fkguo/Overleaf-Workshop)**，其中包含协作编辑、编译和 PDF 预览的额外修复。请从 **[该 fork 的最新 GitHub Release](https://github.com/fkguo/Overleaf-Workshop/releases/latest)** 下载 `.vsix`，通过编辑器的 **Extensions → … → Install from VSIX…** 安装，再重新加载窗口。

该 fork 沿用 `iamhyc.overleaf-workshop` 扩展 ID。请关闭该扩展的自动更新，以免 Marketplace 更新将其替换。功能范围及现有限制见[该 fork 的 README](https://github.com/fkguo/Overleaf-Workshop#readme)。

通过该 fork 打开项目，保持本机 Zotero 运行，即可使用前述引用命令。项目需连接正常、工作区受信任且文件可写；主文件及被包含的章节文件均可自动查找参考文献路径。

## 常见问题

**无法打开 Zotero 选择器**

确认 Zotero 已启动、Better BibTeX 已启用。如果曾修改 `zotero-cite.caywUrl` 或 `zotero-cite.jsonRpcUrl`，请检查地址是否正确。选择文献后需在 Zotero 选择器中确认。

**没有自动选择预期的 `.bib` 文件**

检查是否仍显式设置了 `defaultBibName`，并确认 LaTeX 中声明的路径正确。复杂的宏展开路径可能无法自动识别，此时可显式指定 `.bib` 路径。

**Overleaf Workshop 中无法更新 `.bib`**

确认项目连接正常、工作区受信任且当前账号有编辑权限。Zotero 需运行在编辑器所在电脑上。遇到保存错误时查看 Zotero Cite 输出面板；不要反复重试覆盖他人正在编辑的内容。

**安装更新后仍是旧行为**

运行 **Developer: Reload Window**，并在扩展详情页确认已安装的版本。

## 教学视频

[上游教学视频（百度网盘）](https://pan.baidu.com/s/10FE43K7ZR4LhHv19_5qrnw?pwd=bjf6)，提取码：`bjf6`。

## 上游历史与贡献

本项目基于 [arch / zotero-cite](https://gitee.com/rusterx/zotero-cite)。以下保留上游的主要更新与贡献记录；本 fork 的后续更新见 [CHANGELOG](CHANGELOG.md)。

- 2021-11-01：创建了 zotero-export 插件并增加了文件名输入的功能。增加 when 支持，只允许在 Markdown 或 LaTeX 环境下激发命令。
- 2021-11-02：将 zotero-export 插件更名为 export-cite，优化 bibliography 导出到文件的功能，使其支持 LaTeX 环境。同时添加了 `zotero-cite.citeBibliography` 以及 `zotero-cite.citeMarkdownBibliography` 两个命令，使其可以在插入引用的同时，将 bibliography 插入到默认的文件中。
- 2022-02-06：对 zotero-cite 进行了全面的修改，使其可以支持 Markdown、Pandoc 以及 LaTeX 环境的引用插入。可以识别当前光标的位置是否在引用环境中，从而决定是应该直接插入，还是采用新增的方式插入引用。
- 2022-02-07：优化 Pandoc 以及 LaTeX 文件的插入引用函数，消耗资源更少。
- 2022-05-04：添加了 Markdown 环境下超链接的引用功能。
- 2024-04-07：由于 [MichiyamaKaren](https://gitee.com/MichiyamaKaren) 的贡献，插件支持最新的 Better BibTeX for Zotero 插件。
- 2024-04-22：由于 [fkguo](https://gitee.com/fkguo) 的贡献，插件的 citekey 支持 `-` 和 `:` 等特殊符号。
- 2024-04-22：由于 [awwaawwa](https://gitee.com/awwaawwa) 的贡献，插件支持多个分组。
- 2024-06-13：由于 [cesaryuan](https://gitee.com/cesaryuan) 的贡献，在使用 `exportBibLatex` 时，插件支持 `\citet` 和 `\citep` 命令。
- 2024-07-09：由于 [aasll](https://gitee.com/aasll) 的贡献，插件支持自定义参考文献文件的位置，并支持使用自定义通配符。
- 2026-02-02：由于 [aasll](https://gitee.com/aasll) 的贡献，在 Markdown 和 TeX 文件右上角添加了插入引用的按钮。
- 2026-02-04：由于 [aasll](https://gitee.com/aasll) 的贡献，修复了添加引用无法检测已有重复条目的问题，修复了 Update BibTeX Entries 功能，并增强了返回结果的体验。
- 2026-04-20：将 JavaScript 插件转换成 TypeScript 并模块化；增加状态栏的命令选择按钮；增加 Markdown 引用的预览、建议列表及其显示设置；增加导出时排除字段的配置。
- 2026-04-26：增加了对 pandoc-crossref 格式的图片、表格等引用的预览。
- 2026-05-11：由于 [aasll](https://gitee.com/aasll) 的贡献，增加自定义引用命令功能，可以使用 `\cite` 或其他引用命令。

## 更新记录与反馈

完整更新记录见 [CHANGELOG](CHANGELOG.md)。问题与建议请提交到[本仓库 Issues](https://gitee.com/fkguo/zotero-cite/issues)，附上扩展版本、编辑器及 Zotero 版本、复现步骤和错误信息。

## 许可证与项目来源

本仓库是 [arch / Zotero Cite](https://gitee.com/rusterx/zotero-cite) 的修改版，由 fkguo 维护，在 [GitHub](https://github.com/fkguo/zotero-cite) 和 [Gitee](https://gitee.com/fkguo/zotero-cite) 发布。感谢上游作者及贡献者；原有使用演示和贡献记录保留于本文。

本项目使用 [MIT 许可证](LICENSE.md)，保留上游版权声明与完整许可文本。打包依赖的许可证见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)。
