"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMarkdownCitationPreview = void 0;
const vscode = __importStar(require("vscode"));
const editor_1 = require("./editor");
const bibPath_1 = require("./bibPath");
const config_1 = require("./config");
const i18n_1 = require("./i18n");
const zotero_1 = require("./zotero");
const bibtexParse = require("@orcid/bibtex-parse-js");
const FOOTNOTE_TOKEN_PATTERN = /\[\^([\w-:\d]+)\]/g;
const PANDOC_TOKEN_PATTERN = /@([\w-:\d]+)/g;
const FOOTNOTE_DEFINITION_HEAD_PATTERN = /^\s*\[\^([^\]\r\n]+)\]:\s?(.*)$/;
const LOCAL_BIB_CACHE_TTL_MS = 30000;
const ZOTERO_CACHE_TTL_MS = 5 * 60000;
const localBibCache = new Map();
const zoteroPreviewCache = new Map();
const zoteroPendingRequests = new Map();
function registerMarkdownCitationPreview(context) {
    const hoverProvider = vscode.languages.registerHoverProvider([{ language: "markdown" }, { pattern: "**/*.qmd" }, { pattern: "**/*.rmd" }], {
        provideHover: (document, position) => provideMarkdownCitationHover(document, position),
    });
    context.subscriptions.push(hoverProvider, vscode.workspace.onDidChangeTextDocument((event) => {
        if (isBibDocument(event.document)) {
            localBibCache.delete(event.document.uri.toString());
        }
    }), vscode.workspace.onDidCloseTextDocument((document) => {
        if (isBibDocument(document)) {
            localBibCache.delete(document.uri.toString());
        }
    }), vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("zotero-cite.defaultBibName")) {
            localBibCache.clear();
        }
    }));
}
exports.registerMarkdownCitationPreview = registerMarkdownCitationPreview;
async function provideMarkdownCitationHover(document, position) {
    if (!(0, editor_1.isMarkdownLikeDocument)(document)) {
        return undefined;
    }
    if (!(0, config_1.getShowMarkdownCitationHoverPreview)()) {
        return undefined;
    }
    const token = getCitationTokenAtPosition(document, position);
    if (!token) {
        return undefined;
    }
    if (token.kind === "footnote") {
        return createFootnoteHover(document, token);
    }
    return createPandocHover(document, token);
}
function createFootnoteHover(document, token) {
    const definition = getFootnoteDefinition(document, token.key);
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`**${(0, i18n_1.t)("hover.footnote.title", { key: token.key })}**\n\n`);
    if (definition) {
        markdown.appendMarkdown(definition);
    }
    else {
        markdown.appendMarkdown((0, i18n_1.t)("hover.notFound.footnote", { key: token.key }));
    }
    return new vscode.Hover(markdown, token.range);
}
async function createPandocHover(document, token) {
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`**${(0, i18n_1.t)("hover.pandoc.title", { key: token.key })}**\n\n`);
    const localBibPreview = await getLocalBibPreview(document, token.key);
    if (localBibPreview) {
        markdown.appendMarkdown(localBibPreview);
        markdown.appendMarkdown(`\n\n_${(0, i18n_1.t)("hover.sourceLabel", { source: (0, i18n_1.t)("hover.source.localBib") })}_`);
        return new vscode.Hover(markdown, token.range);
    }
    const zoteroPreview = await getZoteroPreviewCached(token.key);
    if (zoteroPreview) {
        markdown.appendMarkdown(zoteroPreview);
        markdown.appendMarkdown(`\n\n_${(0, i18n_1.t)("hover.sourceLabel", { source: (0, i18n_1.t)("hover.source.zotero") })}_`);
        return new vscode.Hover(markdown, token.range);
    }
    markdown.appendMarkdown((0, i18n_1.t)("hover.notFound.pandoc", { key: token.key }));
    return new vscode.Hover(markdown, token.range);
}
function getCitationTokenAtPosition(document, position) {
    const lineText = document.lineAt(position.line).text;
    const footnoteMatch = getMatchCoveringCharacter(FOOTNOTE_TOKEN_PATTERN, lineText, position.character);
    if (footnoteMatch) {
        return {
            kind: "footnote",
            key: footnoteMatch.match[1],
            range: new vscode.Range(position.line, footnoteMatch.start, position.line, footnoteMatch.end),
        };
    }
    const pandocMatch = getMatchCoveringCharacter(PANDOC_TOKEN_PATTERN, lineText, position.character);
    if (pandocMatch) {
        return {
            kind: "pandoc",
            key: pandocMatch.match[1],
            range: new vscode.Range(position.line, pandocMatch.start, position.line, pandocMatch.end),
        };
    }
    return undefined;
}
function getMatchCoveringCharacter(pattern, text, character) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (character >= start && character < end) {
            return { match, start, end };
        }
    }
    return undefined;
}
function getFootnoteDefinition(document, key) {
    const lines = document.getText().split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
        const headMatch = FOOTNOTE_DEFINITION_HEAD_PATTERN.exec(lines[i]);
        if (!headMatch) {
            continue;
        }
        const foundKey = (headMatch[1] || "").trim();
        if (foundKey.toLowerCase() !== key.toLowerCase()) {
            continue;
        }
        const chunks = [headMatch[2] || ""];
        for (let j = i + 1; j < lines.length; j += 1) {
            const currentLine = lines[j];
            // If the next line starts another footnote definition, stop immediately.
            if (FOOTNOTE_DEFINITION_HEAD_PATTERN.test(currentLine)) {
                break;
            }
            if (/^( {4}|\t)/.test(currentLine)) {
                chunks.push(currentLine.replace(/^( {4}|\t)/, ""));
                continue;
            }
            if (currentLine.trim() === "" &&
                j + 1 < lines.length &&
                /^( {4}|\t)/.test(lines[j + 1]) &&
                !FOOTNOTE_DEFINITION_HEAD_PATTERN.test(lines[j + 1])) {
                chunks.push("");
                continue;
            }
            break;
        }
        const text = chunks.join("\n").trim();
        return text || undefined;
    }
    return undefined;
}
async function getLocalBibPreview(document, citeKey) {
    const bibPath = resolveDocumentBibPath(document);
    if (!bibPath) {
        return undefined;
    }
    const cached = await getCachedLocalBibEntry(bibPath, citeKey);
    if (!cached) {
        return undefined;
    }
    return formatLocalBibEntry(cached, citeKey);
}
function resolveDocumentBibPath(document) {
    if (document.isUntitled) {
        return undefined;
    }
    try {
        const bibName = (0, config_1.getDefaultBibName)();
        (0, bibPath_1.validateBibName)(bibName);
        return (0, bibPath_1.resolveBibPath)(document.uri, bibName);
    }
    catch (_error) {
        return undefined;
    }
}
async function getCachedLocalBibEntry(bibPath, citeKey) {
    const cacheKey = bibPath.toString();
    const now = Date.now();
    let entry = localBibCache.get(cacheKey);
    if (!entry || entry.expiresAt <= now) {
        entry = await loadLocalBibCacheEntry(bibPath);
        if (!entry) {
            return undefined;
        }
        localBibCache.set(cacheKey, entry);
    }
    return entry.byKey.get(citeKey) || entry.byLowerKey.get(citeKey.toLowerCase());
}
async function loadLocalBibCacheEntry(bibPath) {
    try {
        const bytes = await vscode.workspace.fs.readFile(bibPath);
        const content = Buffer.from(bytes).toString("utf8");
        const parsed = bibtexParse.toJSON(content);
        const byKey = new Map();
        const byLowerKey = new Map();
        parsed.forEach((entry) => {
            const key = String(entry.citationKey || "").trim();
            if (!key) {
                return;
            }
            byKey.set(key, entry);
            byLowerKey.set(key.toLowerCase(), entry);
        });
        return {
            expiresAt: Date.now() + LOCAL_BIB_CACHE_TTL_MS,
            byKey,
            byLowerKey,
        };
    }
    catch (_error) {
        return undefined;
    }
}
function formatLocalBibEntry(entry, citeKey) {
    const tags = (entry.entryTags || {});
    const title = normalizeField(tags.title);
    const author = normalizeField(tags.author);
    const year = normalizeField(tags.year || tags.date);
    const container = normalizeField(tags.journal || tags.booktitle || tags.publisher);
    const lines = [];
    if (title) {
        lines.push(`**${title}**`);
    }
    const metadata = [author, year, container].filter((value) => value.length > 0).join(" · ");
    if (metadata) {
        lines.push(metadata);
    }
    if (lines.length === 0) {
        lines.push((0, i18n_1.t)("hover.localBib.fallback", { key: citeKey }));
    }
    return lines.join("\n\n");
}
function normalizeField(value) {
    return String(value || "")
        .replace(/[{}]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
async function getZoteroPreviewCached(citeKey) {
    const now = Date.now();
    const cached = zoteroPreviewCache.get(citeKey);
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }
    const pending = zoteroPendingRequests.get(citeKey);
    if (pending) {
        return pending;
    }
    const request = (async () => {
        try {
            const value = (await (0, zotero_1.getMarkdownBibliography)(citeKey)).trim();
            if (!value) {
                return undefined;
            }
            zoteroPreviewCache.set(citeKey, {
                expiresAt: Date.now() + ZOTERO_CACHE_TTL_MS,
                value,
            });
            return value;
        }
        catch (_error) {
            return undefined;
        }
        finally {
            zoteroPendingRequests.delete(citeKey);
        }
    })();
    zoteroPendingRequests.set(citeKey, request);
    return request;
}
function isBibDocument(document) {
    return document.languageId === "bibtex" || document.uri.path.toLowerCase().endsWith(".bib");
}
//# sourceMappingURL=hoverPreview.js.map