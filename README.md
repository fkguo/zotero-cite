在markdown、pandoc（.md后缀）以及latex文件的编写过程中，如果想要实现类似ms word文件的编辑过程，边插入边更新bib文件。或者想将当前文件的`key`列表，导出最终的bib文件，那么该插件就非常适合你。



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

如果你想在markdown文档的书写过程中，希望插入citation的同时更新脚注，那么这个功能比较适合你。


![add citation and add bibliography for markdown.gif](https://s2.loli.net/2022/02/07/IcuWZpy7zLJFUsY.gif)


- Zotero Cite: Cite Hyperlink

![VSCODE插入超链接引用.gif](https://s2.loli.net/2022/05/04/eMSAvoIQC9gViTG.gif)


## 插件配置项
- zotero-cite.defaultBibName：导出引用文件的默认路径。默认值为`ref.bib`。
- zotero-cite.latexBibStyle：导出的LaTeX引用格式，应为`bibtex`或`biblatex`。默认值为`bibtex`。


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

## 教学视频

链接: https://pan.baidu.com/s/10FE43K7ZR4LhHv19_5qrnw?pwd=bjf6 提取码: bjf6 复制这段内容后打开百度网盘手机App，操作更方便哦 
--来自百度网盘超级会员v9的分享