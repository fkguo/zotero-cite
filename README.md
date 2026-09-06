# Zotero Cite

在 VS Code 或 Cursor 中从 Zotero 选择文献、插入引用，并更新参考文献文件。支持 LaTeX、Markdown、Pandoc、Quarto（`.qmd`）、R Markdown（`.rmd`）和 MDX（`.mdx`），也支持 Overleaf Workshop 打开的项目。

## 安装

1. 下载 [zotero-cite-0.11.0.vsix](https://gitee.com/fkguo/zotero-cite/releases/download/v0.11.0/zotero-cite-0.11.0.vsix)；也可进入[发行版页面](https://gitee.com/fkguo/zotero-cite/releases/tag/v0.11.0)下载附件。不要选择源码压缩包。
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

## 常用命令

可在命令面板中搜索 `Zotero Cite`。命令名称会随编辑器语言显示为中文或英文。

| 命令 | 用途 |
| --- | --- |
| Cite + Bibliography | 根据文档类型插入引用并更新文献；LaTeX 使用 `.bib`，Markdown 类文档使用脚注。 |
| Add Citation for Pandoc/LaTeX | 仅插入引用，不更新参考文献文件。 |
| Cite and Create Bibliography for Pandoc/LaTeX | 插入 LaTeX 或 Pandoc 引用，并补充 `.bib` 中缺失的条目。 |
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
- `showMarkdownCitationHoverPreview`：显示 Markdown 引用的悬浮预览，默认开启。
- `showMarkdownCitationCompletion`：显示 Markdown 引用建议，默认开启。

## 常见问题

**无法打开 Zotero 选择器**

确认 Zotero 已启动、Better BibTeX 已启用。如果曾修改 `zotero-cite.caywUrl` 或 `zotero-cite.jsonRpcUrl`，请检查地址是否正确。选择文献后需在 Zotero 选择器中确认。

**没有自动选择预期的 `.bib` 文件**

检查是否仍显式设置了 `defaultBibName`，并确认 LaTeX 中声明的路径正确。复杂的宏展开路径可能无法自动识别，此时可显式指定 `.bib` 路径。

**Overleaf Workshop 中无法更新 `.bib`**

确认项目连接正常、工作区受信任且当前账号有编辑权限。Zotero 需运行在编辑器所在电脑上。遇到保存错误时查看 Zotero Cite 输出面板；不要反复重试覆盖他人正在编辑的内容。

**安装更新后仍是旧行为**

运行 **Developer: Reload Window**，并在扩展详情页确认已安装的版本。

## 更新记录与反馈

完整更新记录见 [CHANGELOG](CHANGELOG.md)。问题与建议请提交到[本仓库 Issues](https://gitee.com/fkguo/zotero-cite/issues)，附上扩展版本、编辑器及 Zotero 版本、复现步骤和错误信息。
