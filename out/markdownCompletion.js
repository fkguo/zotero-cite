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
exports.registerMarkdownCitationCompletion = void 0;
const vscode = __importStar(require("vscode"));
const editor_1 = require("./editor");
const bibPath_1 = require("./bibPath");
const config_1 = require("./config");
const i18n_1 = require("./i18n");
const zotero_1 = require("./zotero");
const bibtexParse = require("@orcid/bibtex-parse-js");
const FOOTNOTE_TRIGGER_PATTERN = /\[\^([\w-:\d]*)$/;
const FOOTNOTE_DEFINITION_HEAD_PATTERN = /^\s*\[\^([^\]\r\n]+)\]:\s?(.*)$/;
const PANDOC_TRIGGER_PATTERN = /@([\w-:\d]*)$/;
const PANDOC_KEY_PATTERN = /@([\w-:\d]+)/g;
const LOCAL_BIB_CACHE_TTL_MS = 30000;
const ZOTERO_CACHE_TTL_MS = 5 * 60000;
const localBibCache = new Map();
const zoteroPreviewCache = new Map();
const zoteroPendingRequests = new Map();
function registerMarkdownCitationCompletion(context) {
    const provider = vscode.languages.registerCompletionItemProvider([{ language: "markdown" }, { pattern: "**/*.qmd" }, { pattern: "**/*.rmd" }], {
        provideCompletionItems: (document, position) => provideCitationCompletions(document, position),
    }, "@", "^");
    context.subscriptions.push(provider, vscode.workspace.onDidChangeTextDocument((event) => {
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
        if (event.affectsConfiguration("zotero-cite.jsonRpcUrl") ||
            event.affectsConfiguration("zotero-cite.caywUrl")) {
            zoteroPreviewCache.clear();
        }
    }));
}
exports.registerMarkdownCitationCompletion = registerMarkdownCitationCompletion;
async function provideCitationCompletions(document, position) {
    if (!(0, editor_1.isMarkdownLikeDocument)(document)) {
        return undefined;
    }
    if (!(0, config_1.getShowMarkdownCitationCompletion)()) {
        return undefined;
    }
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const footnoteTrigger = FOOTNOTE_TRIGGER_PATTERN.exec(linePrefix);
    if (footnoteTrigger) {
        return buildFootnoteCompletionItems(document, position, footnoteTrigger[1] || "");
    }
    const pandocTrigger = PANDOC_TRIGGER_PATTERN.exec(linePrefix);
    if (pandocTrigger) {
        return buildPandocCompletionItems(document, position, pandocTrigger[1] || "");
    }
    return undefined;
}
function buildFootnoteCompletionItems(document, position, partialKey) {
    const candidates = collectFootnoteCandidates(document, partialKey);
    if (candidates.length === 0) {
        return [];
    }
    const replacementRange = new vscode.Range(position.line, position.character - partialKey.length, position.line, position.character);
    const hasRightBracket = document.lineAt(position.line).text.charAt(position.character) === "]";
    return candidates.map((candidate) => {
        const item = new vscode.CompletionItem(`^${candidate.key}`, vscode.CompletionItemKind.Reference);
        item.insertText = hasRightBracket ? candidate.key : `${candidate.key}]`;
        item.range = replacementRange;
        item.filterText = candidate.key;
        item.detail = `${(0, i18n_1.t)("completion.source.footnote")} · ${candidate.summary || (0, i18n_1.t)("completion.noSummary")}`;
        item.documentation = candidate.summary || (0, i18n_1.t)("completion.noSummary");
        return item;
    });
}
async function buildPandocCompletionItems(document, position, partialKey) {
    const candidates = await collectPandocCandidates(document, partialKey);
    if (candidates.length === 0) {
        return [];
    }
    const replacementRange = new vscode.Range(position.line, position.character - partialKey.length, position.line, position.character);
    return candidates.map((candidate) => {
        const source = candidate.source === "localBib" ? (0, i18n_1.t)("completion.source.localBib") : (0, i18n_1.t)("completion.source.zotero");
        const item = new vscode.CompletionItem(`@${candidate.key}`, vscode.CompletionItemKind.Reference);
        item.insertText = candidate.key;
        item.range = replacementRange;
        item.filterText = candidate.key;
        item.detail = `${source} · ${candidate.summary}`;
        item.documentation = candidate.summary;
        return item;
    });
}
function collectFootnoteCandidates(document, partialKey) {
    const map = new Map();
    const lines = document.getText().split(/\r?\n/);
    lines.forEach((line) => {
        const match = FOOTNOTE_DEFINITION_HEAD_PATTERN.exec(line);
        if (!match) {
            return;
        }
        const key = String(match[1] || "").trim();
        if (!key) {
            return;
        }
        map.set(key.toLowerCase(), {
            key,
            summary: String(match[2] || "").trim(),
        });
    });
    return filterAndSortCandidates(Array.from(map.values()), partialKey);
}
async function collectPandocCandidates(document, partialKey) {
    const normalizedPartial = partialKey.toLowerCase();
    const byLowerKey = new Map();
    const localBibEntries = await getLocalBibEntries(document);
    localBibEntries.forEach((entry, key) => {
        if (!key.toLowerCase().startsWith(normalizedPartial)) {
            return;
        }
        const summary = formatLocalBibSummary(entry);
        if (!summary) {
            return;
        }
        byLowerKey.set(key.toLowerCase(), {
            key,
            summary,
            source: "localBib",
        });
    });
    const missingKeysFromDocument = new Set();
    const text = document.getText();
    PANDOC_KEY_PATTERN.lastIndex = 0;
    let match;
    while ((match = PANDOC_KEY_PATTERN.exec(text)) !== null) {
        const key = match[1];
        if (!key.toLowerCase().startsWith(normalizedPartial)) {
            continue;
        }
        const lowerKey = key.toLowerCase();
        if (!byLowerKey.has(lowerKey)) {
            missingKeysFromDocument.add(key);
        }
    }
    const zoteroCandidates = await Promise.all(Array.from(missingKeysFromDocument).map(async (key) => {
        const summary = await getZoteroSummaryCached(key);
        if (!summary) {
            return undefined;
        }
        return {
            key,
            summary,
            source: "zotero",
        };
    }));
    zoteroCandidates.forEach((candidate) => {
        if (!candidate) {
            return;
        }
        byLowerKey.set(candidate.key.toLowerCase(), candidate);
    });
    return Array.from(byLowerKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}
function filterAndSortCandidates(items, partialKey) {
    const normalizedPartial = partialKey.toLowerCase();
    return items
        .filter((item) => item.key.toLowerCase().startsWith(normalizedPartial))
        .sort((a, b) => a.key.localeCompare(b.key));
}
async function getLocalBibEntries(document) {
    const bibPath = resolveDocumentBibPath(document);
    if (!bibPath) {
        return new Map();
    }
    const cacheKey = bibPath.toString();
    const now = Date.now();
    const cached = localBibCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.entries;
    }
    try {
        const bytes = await vscode.workspace.fs.readFile(bibPath);
        const content = Buffer.from(bytes).toString("utf8");
        const parsed = bibtexParse.toJSON(content);
        const entries = new Map();
        parsed.forEach((entry) => {
            const key = String(entry.citationKey || "").trim();
            if (!key) {
                return;
            }
            entries.set(key, entry);
        });
        localBibCache.set(cacheKey, {
            expiresAt: now + LOCAL_BIB_CACHE_TTL_MS,
            entries,
        });
        return entries;
    }
    catch (_error) {
        return new Map();
    }
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
function formatLocalBibSummary(entry) {
    const tags = (entry.entryTags || {});
    const title = normalizeField(tags.title);
    const author = normalizeField(tags.author);
    const year = normalizeField(tags.year || tags.date);
    const container = normalizeField(tags.journal || tags.booktitle || tags.publisher);
    const parts = [];
    if (title) {
        parts.push(title);
    }
    const metadata = [author, year, container].filter((item) => item.length > 0).join(" · ");
    if (metadata) {
        parts.push(metadata);
    }
    return parts.join(" | ");
}
async function getZoteroSummaryCached(citeKey) {
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
            const raw = await (0, zotero_1.getMarkdownBibliography)(citeKey);
            const summary = normalizePreviewText(raw);
            if (!isMeaningfulSummary(summary, citeKey)) {
                return undefined;
            }
            zoteroPreviewCache.set(citeKey, {
                expiresAt: Date.now() + ZOTERO_CACHE_TTL_MS,
                value: summary,
            });
            return summary;
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
function normalizeField(value) {
    return String(value || "")
        .replace(/[{}]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function normalizePreviewText(value) {
    const normalized = String(value || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/[{}]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!normalized) {
        return "";
    }
    return normalized.length > 260 ? `${normalized.slice(0, 260)}...` : normalized;
}
function isMeaningfulSummary(summary, citeKey) {
    const normalizedSummary = String(summary || "").trim();
    if (!normalizedSummary) {
        return false;
    }
    const summaryCompact = normalizedSummary.toLowerCase().replace(/[^a-z0-9]/g, "");
    const keyCompact = String(citeKey || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    if (!summaryCompact) {
        return false;
    }
    if (!keyCompact) {
        return true;
    }
    return summaryCompact !== keyCompact;
}
function isBibDocument(document) {
    return document.languageId === "bibtex" || document.uri.path.toLowerCase().endsWith(".bib");
}
//# sourceMappingURL=markdownCompletion.js.map