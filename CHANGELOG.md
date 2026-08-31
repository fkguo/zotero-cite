# Change Log

All notable changes to the "zotero-cite" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.9.14] - 2026-08-31

- Prevent duplicate BibTeX entries from repeated selections and overlapping citation commands.
- Reject partial Zotero exports and write validated bibliography updates atomically.
- Parse untrusted BibTeX in a time-limited worker to avoid blocking the extension host.
- Correct LaTeX optional-argument and Pandoc locator citation parsing.
- Add request timeouts, response limits, endpoint validation, workspace path checks, and safe hover text.
- Update dependencies and enable strict TypeScript, TypeScript-aware linting, and regression tests.
