import * as vscode from "vscode";

import { resolveBibPath, validateBibName } from "./bibPath";
import { getDefaultBibName } from "./config";
import { t } from "./i18n";
import { getMarkdownBibliography } from "./zotero";

const bibtexParse = require("@orcid/bibtex-parse-js") as {
  toJSON: (content: string) => Array<Record<string, unknown>>;
};

type CitationToken = {
  kind: "footnote" | "pandoc";
  key: string;
  range: vscode.Range;
};

type ParsedBibEntry = {
  citationKey?: string;
  entryTags?: Record<string, unknown>;
};

type LocalBibCacheEntry = {
  expiresAt: number;
  byKey: Map<string, ParsedBibEntry>;
  byLowerKey: Map<string, ParsedBibEntry>;
};

type ZoteroCacheEntry = {
  expiresAt: number;
  value: string;
};

const FOOTNOTE_TOKEN_PATTERN = /\[\^([\w-:\d]+)\]/g;
const PANDOC_TOKEN_PATTERN = /@([\w-:\d]+)/g;
const FOOTNOTE_DEFINITION_HEAD_PATTERN = /^\s*\[\^([^\]\r\n]+)\]:\s?(.*)$/;
const LOCAL_BIB_CACHE_TTL_MS = 30_000;
const ZOTERO_CACHE_TTL_MS = 5 * 60_000;

const localBibCache = new Map<string, LocalBibCacheEntry>();
const zoteroPreviewCache = new Map<string, ZoteroCacheEntry>();
const zoteroPendingRequests = new Map<string, Promise<string | undefined>>();

export function registerMarkdownCitationPreview(context: vscode.ExtensionContext): void {
  const hoverProvider = vscode.languages.registerHoverProvider({ language: "markdown" }, {
    provideHover: (document, position) => provideMarkdownCitationHover(document, position),
  });

  context.subscriptions.push(
    hoverProvider,
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
    })
  );
}

async function provideMarkdownCitationHover(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover | undefined> {
  const token = getCitationTokenAtPosition(document, position);
  if (!token) {
    return undefined;
  }

  if (token.kind === "footnote") {
    return createFootnoteHover(document, token);
  }

  return createPandocHover(document, token);
}

function createFootnoteHover(document: vscode.TextDocument, token: CitationToken): vscode.Hover {
  const definition = getFootnoteDefinition(document, token.key);
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown(`**${t("hover.footnote.title", { key: token.key })}**\n\n`);

  if (definition) {
    markdown.appendMarkdown(definition);
  } else {
    markdown.appendMarkdown(t("hover.notFound.footnote", { key: token.key }));
  }

  return new vscode.Hover(markdown, token.range);
}

async function createPandocHover(document: vscode.TextDocument, token: CitationToken): Promise<vscode.Hover> {
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown(`**${t("hover.pandoc.title", { key: token.key })}**\n\n`);

  const localBibPreview = await getLocalBibPreview(document, token.key);
  if (localBibPreview) {
    markdown.appendMarkdown(localBibPreview);
    markdown.appendMarkdown(`\n\n_${t("hover.sourceLabel", { source: t("hover.source.localBib") })}_`);
    return new vscode.Hover(markdown, token.range);
  }

  const zoteroPreview = await getZoteroPreviewCached(token.key);
  if (zoteroPreview) {
    markdown.appendMarkdown(zoteroPreview);
    markdown.appendMarkdown(`\n\n_${t("hover.sourceLabel", { source: t("hover.source.zotero") })}_`);
    return new vscode.Hover(markdown, token.range);
  }

  markdown.appendMarkdown(t("hover.notFound.pandoc", { key: token.key }));
  return new vscode.Hover(markdown, token.range);
}

function getCitationTokenAtPosition(document: vscode.TextDocument, position: vscode.Position): CitationToken | undefined {
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

function getMatchCoveringCharacter(
  pattern: RegExp,
  text: string,
  character: number
): { match: RegExpExecArray; start: number; end: number } | undefined {
  pattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (character >= start && character < end) {
      return { match, start, end };
    }
  }

  return undefined;
}

function getFootnoteDefinition(document: vscode.TextDocument, key: string): string | undefined {
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

    const chunks: string[] = [headMatch[2] || ""];
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

      if (
        currentLine.trim() === "" &&
        j + 1 < lines.length &&
        /^( {4}|\t)/.test(lines[j + 1]) &&
        !FOOTNOTE_DEFINITION_HEAD_PATTERN.test(lines[j + 1])
      ) {
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

async function getLocalBibPreview(document: vscode.TextDocument, citeKey: string): Promise<string | undefined> {
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

async function getCachedLocalBibEntry(bibPath: vscode.Uri, citeKey: string): Promise<ParsedBibEntry | undefined> {
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

async function loadLocalBibCacheEntry(bibPath: vscode.Uri): Promise<LocalBibCacheEntry | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(bibPath);
    const content = Buffer.from(bytes).toString("utf8");
    const parsed = bibtexParse.toJSON(content) as ParsedBibEntry[];

    const byKey = new Map<string, ParsedBibEntry>();
    const byLowerKey = new Map<string, ParsedBibEntry>();

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
  } catch (_error) {
    return undefined;
  }
}

function formatLocalBibEntry(entry: ParsedBibEntry, citeKey: string): string {
  const tags = (entry.entryTags || {}) as Record<string, unknown>;
  const title = normalizeField(tags.title);
  const author = normalizeField(tags.author);
  const year = normalizeField(tags.year || tags.date);
  const container = normalizeField(tags.journal || tags.booktitle || tags.publisher);

  const lines: string[] = [];
  if (title) {
    lines.push(`**${title}**`);
  }

  const metadata = [author, year, container].filter((value) => value.length > 0).join(" · ");
  if (metadata) {
    lines.push(metadata);
  }

  if (lines.length === 0) {
    lines.push(t("hover.localBib.fallback", { key: citeKey }));
  }

  return lines.join("\n\n");
}

function normalizeField(value: unknown): string {
  return String(value || "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getZoteroPreviewCached(citeKey: string): Promise<string | undefined> {
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
      const value = (await getMarkdownBibliography(citeKey)).trim();
      if (!value) {
        return undefined;
      }

      zoteroPreviewCache.set(citeKey, {
        expiresAt: Date.now() + ZOTERO_CACHE_TTL_MS,
        value,
      });
      return value;
    } catch (_error) {
      return undefined;
    } finally {
      zoteroPendingRequests.delete(citeKey);
    }
  })();

  zoteroPendingRequests.set(citeKey, request);
  return request;
}

function isBibDocument(document: vscode.TextDocument): boolean {
  return document.languageId === "bibtex" || document.uri.path.toLowerCase().endsWith(".bib");
}
