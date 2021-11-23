# zotero-cite README


在markdown、pandoc（.md后缀）以及latex文件的编写过程中，如果想要实现类似ms word文件的编辑过程，边插入边更新bib文件。或者想将当前文件的`key`列表，导出最终的bib文件，那么该插件就非常适合你。

In the process of writing markdown, pandoc (.md suffix) and latex files, if you want to achieve an editing process similar to ms word files, insert and update the bib file. Or if you want to export the final bib file from the `key` list of the current file, then this plugin is very suitable for you.

# Zotero: Export BibLatex

查询当前编辑的markdown、pandoc或者latex文档，基于其环境，根据引用的key，导出引用至bib文献。

Query the currently edited markdown, pandoc or latex document, based on its environment, and export the citation to the bib document according to the cited key.


# Cite Markdown Bibliography

在markdown文件的编辑过程中，通过zotero的引用选择对话框，选择引用，并插入bibliography到文件的末尾。

In the editing process of the markdown file, through the reference selection dialog box of Zotero, select the reference, and insert the bibliography to the end of the file.

# Zotero: Cite Pandoc Bibliography

在pandoc以及latex文件的编辑过程所中，通过zotero的引用选择对话框，选择引用，并插入bibliography到bib文件的末尾。

In the editing process of pandoc and latex files, through Zotero's citation selection dialog, select citations and insert bibliography to the end of the bib file.

# Revision history

- 2021-11-01：创建了zotero-export插件并增加了文件名输入的功能。增加when支持，只允许在markdown或者latex环境下激发命令。
- 2021-11-02：将zotero-export插件更名为export-cite，优化bibliography导出到文件的功能，使其支持latex环境。同时添加了`zotero-cite.citeBibliography`以及`zotero-cite.citeMarkdownBibliography`两个命令，使其可以在插入引用的同时，将bibliography插入到默认的文件中。

- 2021-11-01: Created the zotero-export plug-in and added the function of file name input. Added when support, which only allows commands to be triggered in markdown or latex environments.
- 2021-11-02: Change the name of the zotero-export plugin to export-cite, optimize the function of exporting bibliography to a file, and make it support the latex environment. At the same time, the two commands `zotero-cite.citeBibliography` and `zotero-cite.citeMarkdownBibliography` have been added, so that the bibliography can be inserted into the default file while inserting the reference.[^parkPreciselyShapedUniformly2018]: Park, J.-E., Lee, Y., & Nam, J.-M. (2018). Precisely Shaped, Uniformly Formed Gold Nanocubes with Ultrahigh Reproducibility in Single-Particle Scattering and Surface-Enhanced Raman Scattering. Nano Letters, 18(10), 6475–6482. https://doi.org/10.1021/acs.nanolett.8b02973

- 2021-11-23: Throw new Error if no item is selected when use the pandoc/latex citation command.
