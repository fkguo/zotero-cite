# Zotero Cite

English | [简体中文](README.zh-CN.md)

Insert Zotero citations and automatically update `.bib` files in **VS Code and compatible VS Code-based editors**, including Cursor. Zotero Cite supports LaTeX, Markdown, Pandoc, Quarto (`.qmd`), R Markdown (`.rmd`), and MDX (`.mdx`), including projects opened through [fkguo’s Overleaf Workshop fork](https://github.com/fkguo/Overleaf-Workshop).

This is **a modified version** of [arch / Zotero Cite on Gitee](https://gitee.com/rusterx/zotero-cite). It adds automatic LaTeX bibliography discovery, support for collaborative and virtual workspaces, adjacent citation merging, and optional INSPIRE-HEP BibTeX retrieval through [zotero-inspire](https://github.com/fkguo/zotero-inspire).

[Download the extension](https://github.com/fkguo/zotero-cite/releases/latest) · [Report an issue](https://github.com/fkguo/zotero-cite/issues) · [Changelog](CHANGELOG.md) · [Gitee repository](https://gitee.com/fkguo/zotero-cite)

## Install

You need:

- **VS Code 1.61 or later**, or a compatible VS Code-based editor that supports VS Code extensions and VSIX installation (for example, Cursor).
- **Zotero desktop**, running on the same computer as your editor.
- **Better BibTeX for Zotero**, installed and enabled in Zotero. Follow its [installation instructions](https://retorque.re/zotero-better-bibtex/installation/). Better BibTeX is required even when you choose zotero-inspire as your BibTeX source.

To install this version of Zotero Cite:

1. Download **[zotero-cite-0.11.3.vsix](https://github.com/fkguo/zotero-cite/releases/download/v0.11.3/zotero-cite-0.11.3.vsix)** from the release assets. Choose the `.vsix`, not a source-code archive.
2. In your editor, open **Extensions**, click the **…** menu, and select **Install from VSIX…**. Choose the downloaded file.
3. Run **Developer: Reload Window** from the Command Palette.

Install updates in the same way. The extension keeps the existing `XING.zotero-cite` identifier, so the VSIX updates an existing installation. Use this repository's release assets to get the features described here.

## Your first citation

1. Start Zotero and wait for Better BibTeX to finish loading.
2. Open a project folder in your editor, or open a project with Overleaf Workshop. The workspace must be trusted and the files writable.
3. Open and save your document. Place the cursor where you want the citation.
4. Click the Zotero Cite button at the top right of the editor, or run **Zotero Cite: Cite + Bibliography** from the Command Palette.
5. Search for references in the Zotero citation picker, select one or more, and confirm with Enter.

In a LaTeX document, the command inserts a citation such as `\cite{Smith:2024abc}` and adds missing entries to the project's `.bib` file. In a Markdown-like document, it inserts a footnote citation and its bibliography text instead.

No keyboard shortcut is assigned by default. To use **Option+Z** on macOS or another shortcut, open **Keyboard Shortcuts**, search for **Zotero Cite: Cite + Bibliography**, and assign your preferred key combination.

## Use with zotero-inspire: INSPIRE-HEP BibTeX

This option is useful for high-energy physics and related fields when you want the bibliography supplied by **INSPIRE-HEP**. The corresponding INSPIRE BibTeX is retrieved via [zotero-inspire](https://github.com/fkguo/zotero-inspire), preserving the citation key used by the selected Zotero item.

### 1. Install both Zotero plugins

Keep **Better BibTeX** enabled. Also install **zotero-inspire 3.1.0 or later**; [the current releases are available here](https://github.com/fkguo/zotero-inspire/releases/latest).

Download zotero-inspire's `.xpi` file. In Zotero, open **Tools → Plugins**, use the gear menu's **Install Plugin From File…** action, select the `.xpi`, and restart Zotero.

### 2. Prepare your Zotero references

For existing items, select them in Zotero and use **right-click → INSPIRE → With abstracts** or **Without abstracts** to retrieve their INSPIRE metadata. This also records the INSPIRE record ID needed to fetch BibTeX. An item should show **INSPIRE** in its **Archive** field and the numeric record ID in **Loc. in Archive** after a successful update. A DOI or arXiv identifier alone is not enough for this citation workflow until the item has been matched by zotero-inspire.

If you want INSPIRE-style citation keys, open zotero-inspire's settings and select **Use INSPIRE Citekey → INSPIRE citekey**, then update the items' metadata. This writes the key to **Citation Key** on Zotero 8 and later, or **Extra** on Zotero 7, for use by Better BibTeX.

Using INSPIRE-style keys is optional: you can keep existing Better BibTeX keys. The BibTeX entries written by Zotero Cite retain the keys selected in the picker, so they match the citations in your document. Avoid changing keys already used in a manuscript unless you also update its citations.

### 3. Choose the source in your editor

Open editor **Settings**, search for `zotero-cite.bibtexSource`, and select **zotero-inspire**. You can set it just for the current project under the **Workspace** tab.

Alternatively, run **Preferences: Open Workspace Settings (JSON)** and add:

```json
{
  "zotero-cite.bibtexSource": "zotero-inspire"
}
```

That is the only required editor setting for choosing INSPIRE BibTeX. Leave `defaultBibName` unset to let Zotero Cite find the bibliography declared by your LaTeX project.

For a project that uses `\citep` and a fixed bibliography file, an example is:

```json
{
  "zotero-cite.bibtexSource": "zotero-inspire",
  "zotero-cite.latexCitationCommand": "citep",
  "zotero-cite.defaultBibName": "references/refs.bib"
}
```

The citation command must be supported by your LaTeX document's packages. Setting it here changes the inserted command; it does not load `natbib` or `biblatex` for you.

### 4. Insert or refresh citations

Run **Cite + Bibliography** in your `.tex` file and select papers as usual. Missing `.bib` entries are fetched from INSPIRE before the citation is inserted.

To refresh entries already in your bibliography, open the `.bib` file and run **Zotero Cite: Update BibTeX Entries**. You can also run that command from a LaTeX document to update its detected bibliography.

The source setting applies to **Export BibLaTeX**, **Cite and Create Bibliography for Pandoc/LaTeX**, and **Update BibTeX Entries**. It does not change the Markdown footnote workflow, which uses Better BibTeX and your citation style.

**When INSPIRE cannot supply a reference:** Zotero Cite reports the problem and cancels that insertion. During an existing-bibliography update, unavailable entries are preserved and the reasons appear in the **Zotero Cite** Output channel. This source mode accepts INSPIRE entries only. For references outside INSPIRE, change `bibtexSource` to `better-bibtex` to export the metadata in your Zotero library.

## LaTeX bibliography selection

You normally do not need to configure a `.bib` path. Zotero Cite recognizes:

- `\bibliography{refs}`, including comma-separated bibliography names.
- `\addbibresource{refs.bib}`, `\addglobalbib`, and `\addsectionbib`.
- A root directive such as `% !TeX root = ../main.tex` in a chapter file.
- Project files connected by `\input`, `\include`, and `\subfile`.

For example, if `main.tex` contains `\bibliography{references/refs}` and includes `chapters/introduction.tex`, you can cite from the chapter and use the same `references/refs.bib`.

When several bibliography files are possible, the extension asks you to choose and remembers the choice for the editor session. If no LaTeX declaration identifies a bibliography, it looks for existing `.bib` files in the workspace, then falls back to `ref.bib` if none exist.

To override detection, explicitly set `zotero-cite.defaultBibName` to a nonempty path, such as `references/refs.bib`. Remove that setting or set it to `""` to restore detection. **Export BibLaTeX** also remembers the chosen destination for the session; reload the editor window to clear a previously remembered choice if needed.

### Existing BibTeX syntax errors

A syntax error inside an existing, clearly delimited entry (for example, a missing comma between fields) does not block adding other references. Zotero Cite preserves the old text exactly, reserves its citation key to prevent duplicates, and validates new entries before appending them. A warning lists the affected keys and line numbers; details appear in **View → Output → Zotero Cite**. You still need to fix those errors before compiling your bibliography.

If an entry's header, braces, or quotes make its boundary uncertain, insertion stops with an error. Existing-entry refresh and full-file export still require parseable BibTeX.

### Merge citations while writing

Place the cursor inside an existing `\cite{Old}`, or immediately after its closing brace, and select another reference. The result is:

```latex
\cite{Old, New}
```

Duplicate keys are skipped. A space, line break, or punctuation between the citation and cursor causes a new citation command to be inserted.

Set `zotero-cite.latexCitationCommand` to `citep`, `citet`, `parencite`, or `autocite` if required by your document; omit the leading backslash. Merging supports plain `\cite` and the configured command, preserving stars and optional arguments, for example:

```latex
\citep[see][p. 3]{Old, New}
```

## Markdown, Pandoc, and Quarto

Choose the workflow that matches how you render your document:

| Workflow | Command | Result |
| --- | --- | --- |
| Markdown footnotes | **Cite + Bibliography**, or **Cite and Create Bibliography for Markdown** | Inserts `[^key]` and appends a formatted footnote definition. No separate `.bib` is needed. |
| Pandoc citations | **Cite and Create Bibliography for Pandoc/LaTeX** | Inserts a citation such as `[@key]` and adds missing entries to a `.bib` file. |
| Citation only | **Add Citation for Pandoc/LaTeX** | Inserts citation keys without updating the bibliography. |

For Pandoc or Quarto, configure your document's bibliography for rendering as usual, for example:

```yaml
---
bibliography: references.bib
---
```

Set `zotero-cite.defaultBibName` to `references.bib` so the extension writes to the same file. The automatic LaTeX declaration discovery described above does not read this YAML setting.

Markdown citation previews and completion are enabled by default: hover over `[^key]` or `@key`, or type `[^` or `@` to see suggestions. To insert a website as a footnote, copy its URL to the clipboard and run **Cite Hyperlink**.

## Overleaf Workshop

For the Overleaf workflow described here, use **[my Overleaf Workshop fork](https://github.com/fkguo/Overleaf-Workshop)**, which includes additional collaborative-editing, compilation, and PDF-preview fixes. Download its `.vsix` from the **[fork’s latest GitHub release](https://github.com/fkguo/Overleaf-Workshop/releases/latest)** and install it through **Extensions → … → Install from VSIX…**, then reload the editor window.

The fork uses the same `iamhyc.overleaf-workshop` extension ID as the Marketplace version. Disable automatic updates for that extension to keep a Marketplace update from replacing the fork. See its [README](https://github.com/fkguo/Overleaf-Workshop#readme) for supported features and remaining limitations.

Open your project through Overleaf Workshop, keep Zotero running locally, and use the same citation commands. Bibliography discovery works from the main file and included chapter files. The project must be connected, trusted, and writable.

If multiple bibliography files are present, choose the intended file when prompted. If a remote save fails or a simultaneous edit conflicts with an update, check the **Zotero Cite** Output channel and the current bibliography before retrying.

## Command reference

Open the Command Palette and search for **Zotero Cite**. Command labels follow the editor's display language.

| Command | What it does |
| --- | --- |
| **Project Tasks** | Opens the Zotero Cite command menu; also available from the status bar. |
| **Cite + Bibliography** | Uses `.bib` entries for LaTeX and footnotes for Markdown-like documents. |
| **Add Citation for Pandoc/LaTeX** | Inserts citations without writing bibliography entries. |
| **Cite and Create Bibliography for Pandoc/LaTeX** | Inserts citations and adds missing `.bib` entries. |
| **Cite and Create Bibliography for Markdown** | Inserts footnote citations and bibliography text in the document. |
| **Export BibLaTeX** | Exports references cited in the active document to a filename you choose. **Replaces the whole destination file if it already exists.** |
| **Update BibTeX Entries** | Refreshes the active `.bib` file, or the bibliography resolved from the active LaTeX document. Unmatched entries are retained. |
| **Cite Hyperlink** | Inserts the clipboard URL as a Markdown footnote. |

## Common settings

Search for `zotero-cite` in editor Settings. Prefix the names below with `zotero-cite.` when editing JSON.

| Setting | Purpose |
| --- | --- |
| `bibtexSource` | `better-bibtex` (default) for Zotero metadata, or `zotero-inspire` for INSPIRE-HEP BibTeX. |
| `defaultBibName` | Explicit bibliography path override. Leave unset for automatic detection. |
| `latexCitationCommand` | Command for new LaTeX citations, without `\`; default `cite`. |
| `latexBibStyle` | Better BibTeX export format: `bibtex` (default) or `biblatex`. This does not convert INSPIRE output into biblatex. |
| `excludedBibFields` | Fields omitted from exported entries; defaults to `file` and `annotation`. |
| `bibliograpyStyle` | CSL style URL used for formatted bibliography text, such as Markdown footnotes; defaults to APA. The setting name is spelled `bibliograpyStyle`. |
| `showMarkdownCitationHoverPreview` | Enable citation hover previews; default `true`. |
| `showMarkdownCitationCompletion` | Enable citation suggestions; default `true`. |
| `showCommandPickerInStatusBar` | Show the command menu in the status bar; default `true`. |

An explicit `defaultBibName` supports `${workspaceFolder}`, `${fileBasename}`, `${fileBasenameNoExtension}`, `${fileDirname}`, and `${fileExtname}` placeholders.

## Troubleshooting

**The Zotero picker does not open.** Ensure Zotero is running and Better BibTeX is enabled and ready. If you previously changed `caywUrl` or `jsonRpcUrl`, restore the default addresses for a normal local setup. Confirm the selected papers in the picker to finish insertion.

**INSPIRE BibTeX is unavailable.** Check that zotero-inspire is enabled and up to date, then restart Zotero. Update the item's INSPIRE metadata and check its Archive and record ID fields. Zotero must be able to reach INSPIRE-HEP. For papers not covered by INSPIRE, use the `better-bibtex` source.

**The wrong bibliography is selected.** Check for an explicit `defaultBibName` and verify paths in your LaTeX source. Reload the window to clear a remembered choice. If your project constructs paths through complex TeX macros, set the bibliography path explicitly.

**References with the same key exist in multiple libraries.** Give the items distinct Better BibTeX keys before retrying, so the selected key identifies a single reference.

**The editor still behaves like an older version.** Run **Developer: Reload Window** and check the installed version in the extension's details page.

For other problems, [open an issue](https://github.com/fkguo/zotero-cite/issues) with the extension, editor, Zotero, and Better BibTeX versions; include the zotero-inspire version if relevant, reproduction steps, and the error message from **View → Output → Zotero Cite**.

## License and acknowledgments

Zotero Cite is distributed under the **[MIT License](LICENSE.md)**. The upstream copyright notice and full license text are retained. Bundled dependency notices are included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This repository is maintained by [fkguo](https://github.com/fkguo) and derives from **[arch / Zotero Cite on Gitee](https://gitee.com/rusterx/zotero-cite)**. Thanks to the upstream author and contributors, including [MichiyamaKaren](https://gitee.com/MichiyamaKaren), [awwaawwa](https://gitee.com/awwaawwa), [cesaryuan](https://gitee.com/cesaryuan), and [aasll](https://gitee.com/aasll). The [Chinese README](README.zh-CN.md#上游历史与贡献) preserves the upstream usage demonstrations and contribution history.

[Better BibTeX](https://retorque.re/zotero-better-bibtex/) and [zotero-inspire](https://github.com/fkguo/zotero-inspire) are separate Zotero plugins, installed independently under their respective licenses.
