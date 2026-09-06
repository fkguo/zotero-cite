# Change Log

All notable changes to the "zotero-cite" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.11.1] - 2026-09-07

- Fix citation selection stalling in chapter TeX files in Overleaf Workshop and other virtual projects without a file search provider.
- Discover virtual project roots through bounded directory traversal while preserving URI identity and workspace boundaries.
- Preserve local project discovery, explicit bibliography settings, TeX root directives, bibliography selection, and collaborative bibliography write protections.

## [0.11.0] - 2026-09-06

- Provide a Gitee Release download for installation in VS Code and Cursor.
- Retain the functionality and settings of 0.10.1, including selectable INSPIRE-HEP BibTeX retrieval and merging adjacent LaTeX citations.
- Preserve concurrent bibliography additions when appending entries in collaborative workspaces, skip entries already added by a collaborator, and reject conflicting or unverifiable updates.

## [0.10.1] - 2026-09-06

- Merge newly selected citation keys into the preceding LaTeX citation when the cursor is immediately after its closing brace, skipping existing keys and preserving optional arguments.
- Add a selectable BibTeX source: Better BibTeX or strict INSPIRE-HEP retrieval through zotero-inspire's authenticated read-only local API.
- Discover the zotero-inspire read token automatically from standard local Zotero profiles, cache a verified token in editor Secret Storage, and require no manual token setup.
- Restrict the zotero-inspire endpoint to loopback HTTP, validate API v1 responses and rewritten entry keys, and reject non-INSPIRE fallback results.
- Apply the selected source consistently to bibliography export, automatic entry insertion, and existing-entry refresh while preserving atomic file updates.
- Refresh the README with VSIX installation, quick-start instructions, bibliography selection, citation merging, and troubleshooting.

## [0.10.0] - 2026-08-31

- Detect bibliography files from BibTeX and biblatex commands, TeX root directives, and recursively included project files.
- Let explicit non-empty `defaultBibName` settings override automatic detection, discover existing `.bib` files as a fallback, prompt for ambiguous multi-bibliography projects, and preserve virtual-workspace URIs.
- Keep CAYW endpoint probing fast while allowing time for interactive Zotero selection, and use Zotero 8-compatible structured citation-key searches and numeric library IDs with Better BibTeX 9.
- Bundle the extension and isolated BibTeX parser worker with esbuild, reducing packaged file count and removing runtime `node_modules` files.

## [0.9.15] - 2026-08-31

- Support verified bibliography updates in virtual workspaces, including Overleaf Workshop, without requiring overwrite-by-rename support from the file-system provider.
- Declare virtual-workspace support in the extension manifest and document its trust and remote-write requirements.

## [0.9.14] - 2026-08-31

- Prevent duplicate BibTeX entries from repeated selections and overlapping citation commands.
- Reject partial Zotero exports and write validated bibliography updates atomically.
- Parse untrusted BibTeX in a time-limited worker to avoid blocking the extension host.
- Correct LaTeX optional-argument and Pandoc locator citation parsing.
- Add request timeouts, response limits, endpoint validation, workspace path checks, and safe hover text.
- Update dependencies and enable strict TypeScript, TypeScript-aware linting, and regression tests.
