import * as vscode from "vscode";

import { resolveBibPath, validateBibName } from "./bibPath";
import { getDefaultBibName } from "./config";
import { t } from "./i18n";
import { getMarkdownBibliography } from "./zotero";

const bibtexParse = require("@orcid/bibtex-parse-js") as {
  toJSON: (content: string) => Array<Record<string, unknown>>;
};

type ParsedBibEntry = {
  citationKey?: string;
  entryTags?: Record<string, unknown>;
};

type FootnoteCandidate = {
  key: string;
  summary: string;
};

type PandocCandidate = {
  key: string;
  summary: string;
  source: "localBib" | "zotero";
};

type LocalBibCacheEntry = {
  expiresAt: number;
  entries: Map<string, ParsedBibEntry>;
};

type ZoteroCacheEntry = {
  expiresAt: number;
  value: string;
};

const FOOTNOTE_TRIGGER_PATTERN = /\[\^([\w-:\d]*)$/;
const FOOTNOTE_DEFINITION_HEAD_PATTERN = /^\s*\[\^([^\]\r\n]+)\]:\s?(.*)$/;
const PANDOC_TRIGGER_PATTERN = /@([\w-:\d]*)$/;
const PANDOC_KEY_PATTERN = /@([\w-:\d]+)/g;
const LOCAL_BIB_CACHE_TTL_MS = 30_000;
const ZOTERO_CACHE_TTL_MS = 5 * 60_000;

const localBibCache = new Map<string, LocalBibCacheEntry>();
const zoteroPreviewCache = new Map<string, ZoteroCacheEntry>();
const zoteroPendingRequests = new Map<string, Promise<string | undefined>>();

export function registerMarkdownCitationCompletion(context: vscode.ExtensionContext): void {
  const provider = vscode.languages.registerCompletionItemProvider(
    { language: "markdown" },
    {
      provideCompletionItems: (document, position) => provideCitationCompletions(document, position),
    },
    "@",
    "^"
  );

  context.subscriptions.push(
    provider,
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isBibDocument(event.document)) {
        localBibCache.delete(event.document.uri.toString());
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isBibDocument(document)) {
        localBibCache.delete(document.uri.toString());
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("zotero-cite.defaultBibName")) {
        localBibCache.clear();
      }

      if (
        event.affectsConfiguration("zotero-cite.jsonRpcUrl") ||
        event.affectsConfiguration("zotero-cite.caywUrl")
      ) {
        zoteroPreviewCache.clear();
      }
    })
  );
}

async function provideCitationCompletions(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.CompletionItem[] | undefined> {
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

function buildFootnoteCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  partialKey: string
): vscode.CompletionItem[] {
  const candidates = collectFootnoteCandidates(document, partialKey);
  if (candidates.length === 0) {
    return [];
  }

  const replacementRange = new vscode.Range(
    position.line,
    position.character - partialKey.length,
    position.line,
    position.character
  );

  const hasRightBracket = document.lineAt(position.line).text.charAt(position.character) === "]";
  return candidates.map((candidate) => {
    const item = new vscode.CompletionItem(`^${candidate.key}`, vscode.CompletionItemKind.Reference);
    item.insertText = hasRightBracket ? candidate.key : `${candidate.key}]`;
    item.range = replacementRange;
    item.filterText = candidate.key;
    item.detail = `${t("completion.source.footnote")} · ${candidate.summary || t("completion.noSummary")}`;
    item.documentation = candidate.summary || t("completion.noSummary");
    return item;
  });
}

async function buildPandocCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  partialKey: string
): Promise<vscode.CompletionItem[]> {
  const candidates = await collectPandocCandidates(document, partialKey);
  if (candidates.length === 0) {
    return [];
  }

  const replacementRange = new vscode.Range(
    position.line,
    position.character - partialKey.length,
    position.line,
    position.character
  );

  return candidates.map((candidate) => {
    const source = candidate.source === "localBib" ? t("completion.source.localBib") : t("completion.source.zotero");
    const item = new vscode.CompletionItem(`@${candidate.key}`, vscode.CompletionItemKind.Reference);
    item.insertText = candidate.key;
    item.range = replacementRange;
    item.filterText = candidate.key;
    item.detail = `${source} · ${candidate.summary}`;
    item.documentation = candidate.summary;
    return item;
  });
}

function collectFootnoteCandidates(document: vscode.TextDocument, partialKey: string): FootnoteCandidate[] {
  const map = new Map<string, FootnoteCandidate>();
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

async function collectPandocCandidates(document: vscode.TextDocument, partialKey: string): Promise<PandocCandidate[]> {
  const normalizedPartial = partialKey.toLowerCase();
  const byLowerKey = new Map<string, PandocCandidate>();

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

  const missingKeysFromDocument = new Set<string>();
  const text = document.getText();
  PANDOC_KEY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
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

  const zoteroCandidates = await Promise.all(
    Array.from(missingKeysFromDocument).map(async (key): Promise<PandocCandidate | undefined> => {
      const summary = await getZoteroSummaryCached(key);
      if (!summary) {
        return undefined;
      }

      return {
        key,
        summary,
        source: "zotero",
      };
    })
  );

  zoteroCandidates.forEach((candidate) => {
    if (!candidate) {
      return;
    }

    byLowerKey.set(candidate.key.toLowerCase(), candidate);
  });

  return Array.from(byLowerKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function filterAndSortCandidates<T extends { key: string }>(items: T[], partialKey: string): T[] {
  const normalizedPartial = partialKey.toLowerCase();
  return items
    .filter((item) => item.key.toLowerCase().startsWith(normalizedPartial))
    .sort((a, b) => a.key.localeCompare(b.key));
}

async function getLocalBibEntries(document: vscode.TextDocument): Promise<Map<string, ParsedBibEntry>> {
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
    const parsed = bibtexParse.toJSON(content) as ParsedBibEntry[];
    const entries = new Map<string, ParsedBibEntry>();

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
  } catch (_error) {
    return new Map();
  }
}

function resolveDocumentBibPath(document: vscode.TextDocument): vscode.Uri | undefined {
  if (document.isUntitled) {
    return undefined;
  }

  try {
    const bibName = getDefaultBibName();
    validateBibName(bibName);
    return resolveBibPath(document.uri, bibName);
  } catch (_error) {
    return undefined;
  }
}

function formatLocalBibSummary(entry: ParsedBibEntry): string {
  const tags = (entry.entryTags || {}) as Record<string, unknown>;
  const title = normalizeField(tags.title);
  const author = normalizeField(tags.author);
  const year = normalizeField(tags.year || tags.date);
  const container = normalizeField(tags.journal || tags.booktitle || tags.publisher);

  const parts: string[] = [];
  if (title) {
    parts.push(title);
  }

  const metadata = [author, year, container].filter((item) => item.length > 0).join(" · ");
  if (metadata) {
    parts.push(metadata);
  }

  return parts.join(" | ");
}

async function getZoteroSummaryCached(citeKey: string): Promise<string | undefined> {
  const now = Date.now();
  const cached = zoteroPreviewCache.get(citeKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = zoteroPendingRequests.get(citeKey);
  if (pending) {
    return pending;
  }

  const request = (async (): Promise<string | undefined> => {
    try {
      const raw = await getMarkdownBibliography(citeKey);
      const summary = normalizePreviewText(raw);
      if (!summary) {
        return undefined;
      }

      zoteroPreviewCache.set(citeKey, {
        expiresAt: Date.now() + ZOTERO_CACHE_TTL_MS,
        value: summary,
      });

      return summary;
    } catch (_error) {
      return undefined;
    } finally {
      zoteroPendingRequests.delete(citeKey);
    }
  })();

  zoteroPendingRequests.set(citeKey, request);
  return request;
}

function normalizeField(value: unknown): string {
  return String(value || "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePreviewText(value: string): string {
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

function isBibDocument(document: vscode.TextDocument): boolean {
  return document.languageId === "bibtex" || document.uri.path.toLowerCase().endsWith(".bib");
}
