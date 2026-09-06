在markdown、pandoc（.md后缀）、quarto（.qmd后缀）、R Markdown（.rmd后缀）、MDX（.mdx后缀）以及latex文件的编写过程中，如果想要实现类似ms word文件的编辑过程，边插入边更新bib文件。或者想将当前文件的`key`列表，导出最终的bib文件，那么该插件就非常适合你。

## 虚拟工作区与 Overleaf Workshop

Zotero Cite 支持通过 VS Code 虚拟文件系统打开的项目，包括 Overleaf Workshop。对于本地文件，插件使用临时文件和原子替换来更新 `.bib`；对于虚拟工作区，插件使用文件系统提供方的原生写入接口，并在完成后重新读取和验证 BibTeX 内容。

使用虚拟工作区时请注意：

- 工作区必须处于受信任状态，否则 Zotero Cite 会按安全策略被禁用。
- Zotero 与 Better BibTeX 仍需运行在本机，并允许编辑器访问所配置的 JSON-RPC/CAYW 地址。
- 远程保存的原子性和并发合并行为由相应的虚拟文件系统提供方决定。

## 自动检测 LaTeX 参考文献文件

在未显式设置 `zotero-cite.defaultBibName` 时，Zotero Cite 会从 LaTeX 项目中自动检测参考文献文件，支持：

- BibTeX 的 `\bibliography{refs}` 和逗号分隔的多个文件。
- biblatex 的 `\addbibresource`、`\addglobalbib` 与 `\addsectionbib`。
- `% !TeX root = main.tex` 根文件指令。
- 通过 `\input`、`\include` 与 `\subfile` 引入的项目文件。

如果项目引用多个 `.bib` 文件，插件会要求选择，并在候选集合不变时记住本次编辑器会话中的选择。用户显式设置的 `zotero-cite.defaultBibName` 始终优先于自动检测；无法从 LaTeX 声明静态解析路径时，插件还会扫描当前工作区中已有的 `.bib` 文件：只有一个时自动采用，存在多个时要求选择。声明和已有文件均未检测到时才回退到 `ref.bib`。空字符串配置等同于未显式设置。

## 选择 BibTeX 来源

`zotero-cite.bibtexSource` 可以选择写入 `.bib` 文件的来源：

- `better-bibtex`（默认）：通过 Better BibTeX JSON-RPC 导出。
- `zotero-inspire`：通过 zotero-inspire 的本机只读接口从 INSPIRE-HEP 获取。

无论选择哪一种来源，Zotero 条目选择器仍由 Better BibTeX CAYW 提供。来源设置影响 BibTeX/BibLaTeX 文件的整体导出、自动补充缺失条目和更新已有条目；Markdown 脚注式格式化文献仍使用 Better BibTeX。

首次使用时，只需在 Zotero 中启用包含只读 BibTeX API 的 zotero-inspire，并将 `zotero-cite.bibtexSource` 设为 `zotero-inspire`。Zotero Cite 会自动定位当前操作系统中的 Zotero profiles，从 `prefs.js` 读取 zotero-inspire 专用只读令牌，并把已验证令牌缓存到 VS Code/Cursor Secret Storage；无需复制令牌，也不会把令牌写入项目设置。

自动发现支持 macOS、Windows、常规 Linux 安装以及 Linux Flatpak 的标准 Zotero profile 位置。若切换 Zotero profile 或插件重新生成令牌，客户端会重新检查本机 profiles 并更新缓存。

默认接口为 `http://127.0.0.1:23119/connector/zinspireBibtex`。客户端只允许数值型本机回环地址、HTTP 协议和固定接口路径，自动发现的只读令牌不会发送给远端服务。

选择 `zotero-inspire` 后，插件只接受接口明确标记为 `INSPIRE-HEP` 的 BibTeX。若 INSPIRE 条目缺失、引用键有歧义，或者服务端改用 Better BibTeX fallback，本次新增操作会整体失败且不会插入 `\cite{...}`；更新已有 `.bib` 时则保留无法从 INSPIRE 获取的原始条目，并在输出面板记录原因。

## 自动融合远程 Pull Requests

项目里新增了一个自动合并脚本，可按顺序抓取并合并远程 PR 引用到当前分支。

前提条件：
- 当前目录是 git 仓库。
- 远程仓库暴露 PR 引用（默认使用 `refs/pull/*/head`，GitHub/Gitee 常见）。
- 建议在工作区干净（无未提交变更）时运行。

常用命令：

```bash
# 仅预览将要合并的 PR，不执行 merge
npm run sync:prs:dry

# 实际执行自动合并
npm run sync:prs

# 指定远程并限制最多合并 5 个 PR
npm run sync:prs -- --remote upstream --limit 5
```

冲突处理：
- 当某个 PR 合并冲突时，脚本会尝试执行 `git merge --abort` 保持工作区整洁。
- 默认遇到冲突即停止；如需继续处理后续 PR，可加 `--keep-going`。



## issue与代码提交

由于本人不经常使用`latex`以及`markdown`，只在写论文的时候才会用，如果您喜欢使用该插件，但对其中的一些细节有额外的需求，您可以写issue，另外对于本身有一些编程能力的用户，非常欢迎提交自己的代码（请您务必认真自己测试提交的代码！因为我实在有点懒惰，不会仔细review代码）。


## 插件功能

- Zotero Cite: Export BibLatex

查询当前编辑的markdown、pandoc或者latex文档，根据引用的key，导出引用至bib文件。


![export bibliography.gif](https://s2.loli.net/2022/02/07/by74icsMBRuVfO9.gif)

- Zotero Cite: Add Citation for Pandoc/Latex

如果你想在pandoc以及latex文档的书写过程中，希望插入citation，但是不想更新bib文件，那么这个功能比较适合你。


![add citation for pandoc and latex.gif](https://s2.loli.net/2022/02/07/ZQSoTM69wdYAB4l.gif)

- Zotero Cite: Cite and Create Bibliography for Pandoc/LaTeX

如果你想在pandoc以及latex文档的书写过程中，希望插入citation的同时更新bib文件，那么这个功能比较适合你。


![add citation and add bibliography for pandoc and latex.gif](https://s2.loli.net/2022/02/07/vefSHTJWnG6DAt7.gif)

- Zotero Cite: Cite and Create Bibliography for Markdown

如果你想在markdown / quarto（.qmd）/ R Markdown（.rmd）/ MDX（.mdx）文档的书写过程中，希望插入citation的同时更新脚注，那么这个功能比较适合你。


![add citation and add bibliography for markdown.gif](https://s2.loli.net/2022/02/07/IcuWZpy7zLJFUsY.gif)


- Zotero Cite: Cite Hyperlink

![VSCODE插入超链接引用.gif](https://s2.loli.net/2022/05/04/eMSAvoIQC9gViTG.gif)

- Zotero Cite: Update BibTex Entries
从 Zotero 更新 defaultBibName 路径对应bib文件的所有项，存在未匹配项则不修改原始记录。

- 支持自定义 LaTeX 引用命令 (Custom LaTeX Citation Command)
在 LaTeX 编辑环境下，你可以通过修改配置项 `zotero-cite.latexCitationCommand` 来自定义引用时生成的命令字前缀（默认为 `cite`）。当你将其修改为其他命令（例如 `citet`、`citep`、`parencite` 或 `autocite`）时，该插件会自动使用该命令插入文献，并正确识别和解析文中已有的对应格式的引用。

当光标紧接在 `\cite{Old}` 的右花括号之后时，选择新条目 `New` 会直接得到 `\cite{Old, New}`。此行为也适用于配置的自定义引用命令，保留星号和可选参数，并跳过已有的引用键。若光标位于两个紧邻的引用命令之间，会合并到前一个；若中间存在空格、换行或标点，则插入新的引用命令。

## 插件配置项
- zotero-cite.defaultBibName：显式指定参考文献路径，并覆盖 LaTeX 自动检测。未显式设置且无法检测时使用 `ref.bib`。可以使用通配符：`${workspaceFolder}`、`${fileBasename}`、`${fileBasenameNoExtension}`、`${fileDirname}`、`${fileExtname}`。
- zotero-cite.latexBibStyle：导出的LaTeX引用格式，应为`bibtex`或`biblatex`。默认值为`bibtex`。
- zotero-cite.latexCitationCommand：LaTeX 引用命令名，不需要包含前导反斜杠。默认值为`cite`，例如可改为`citet`或`citep`。
- zotero-cite.bibtexSource：写入 `.bib` 文件的来源，可选 `better-bibtex`（默认）或 `zotero-inspire`。
- zotero-cite.zoteroInspireBibtexUrl：zotero-inspire 本机只读 BibTeX 接口。仅支持本机回环 HTTP 地址和固定路径 `/connector/zinspireBibtex`。
- zotero-cite.showMarkdownCitationHoverPreview：是否显示 Markdown 中 `[^key]` 与 `@key` 的 hover 预览。默认值为 `true`。
- zotero-cite.showMarkdownCitationCompletion：是否显示 Markdown 中 `[^` 与 `@` 的引用建议列表。默认值为 `true`。


## 修改历史

- 2021-11-01：创建了zotero-export插件并增加了文件名输入的功能。增加when支持，只允许在markdown或者latex环境下激发命令。
- 2021-11-02：将zotero-export插件更名为export-cite，优化bibliography导出到文件的功能，使其支持latex环境。同时添加了`zotero-cite.citeBibliography`以及`zotero-cite.citeMarkdownBibliography`两个命令，使其可以在插入引用的同时，将bibliography插入到默认的文件中。
- 2022-02-06： 对zotero-cite进行了全面的修改，使其可以支持markdown、pandoc以及latex环境的引用插入。可以智能的识别当前鼠标的位置是否在引用环境中，从而决定是应该直接插入，还是采用新增的方式插入引用。
- 2022-02-07：优化pandoc以及latex文件的插入引用函数，消耗资源更少。
- 2022-05-04：添加了markdown环境下，超链接的引用功能。
- 2024-04-07：由于<https://gitee.com/MichiyamaKaren>用户的贡献，插件支持最新的`Better BibTex for Zotero`插件。
- 2024-04-22: 由于<https://gitee.com/fkguo>用户的贡献，插件的`citekey`支持"-"和":"等特殊符号。
- 2024-04-22: 由于<https://gitee.com/awwaawwa>用户的贡献，插件的支持多个分组。
- 2024-06-13: 由于<https://gitee.com/cesaryuan>用户贡献，在使用`exportBibLatex`的时候，插件支持`\citet`和`\citep`命令。
- 2024-07-09: 由于<https://gitee.com/aasll>用户的贡献，插件支持自定义ref文件的位置，并支持使用自定义通配符。
- 2026-02-02: 由于<https://gitee.com/aasll>用户的贡献，在md和tex文件右上角添加了小按钮来插入引用。
- 2026-02-04: 由于<https://gitee.com/aasll>用户贡献，修复了添加引用无法检测已经添加进来的重复条目的问题，修复了'update biblatex entries'功能，并增强了返回结果的体验。
- 2026-04-26：增加了对pandoc-crossref格式的图片，表格之类的引用预览。
- 2026-05-11: 由于<https://gitee.com/aasll>用户贡献，增加自定义引用标签功能，用户现在可以自定义'\cite'或别的什么命令了。

### 2026-04-20：重要更新

- 将js插件转换成ts，模块化，方便准确的代码提示。
- 增加了状态栏的command picker按钮，点击可以显示命令列表。
- 增加md文件中尖角引用和@引用的预览和建议列表功能，并做成可配置项（显示和隐藏）。
- 增加了json-rpc字段的排除配置（有时候一些不需要的字段不想显示在bib文件中）。

## 教学视频

链接: https://pan.baidu.com/s/10FE43K7ZR4LhHv19_5qrnw?pwd=bjf6 提取码: bjf6 复制这段内容后打开百度网盘手机App，操作更方便哦 
--来自百度网盘超级会员v9的分享
