import * as path from "path";
import * as vscode from "vscode";

import { isMarkdownLikeDocument, isPandocCrossRef } from "./editor";
import { resolveBibPath, validateBibName } from "./bibPath";
import { getDefaultBibName, getShowMarkdownCitationHoverPreview } from "./config";
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
  const hoverProvider = vscode.languages.registerHoverProvider(
    [{ language: "markdown" }, { pattern: "**/*.qmd" }, { pattern: "**/*.rmd" }, { pattern: "**/*.mdx" }],
    {
    provideHover: (document, position) => provideMarkdownCitationHover(document, position),
    }
  );

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
  if (!isMarkdownLikeDocument(document)) {
    return undefined;
  }

  if (!getShowMarkdownCitationHoverPreview()) {
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

  // supportHtml was added in VS Code 1.83 (the extension engine floor is 1.61).
  // Enable HTML rendering at runtime when available so we can use <img width>
  // to constrain figure previews in the hover tooltip.
  if (typeof (markdown as any).supportHtml !== "undefined") {
    (markdown as any).supportHtml = true;
  }

  if (isPandocCrossRef(token.key)) {
    return createCrossRefHover(document, token, markdown);
  }

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

function createCrossRefHover(
  document: vscode.TextDocument,
  token: CitationToken,
  markdown: vscode.MarkdownString
): vscode.Hover {
  const lowerKey = token.key.toLowerCase();
  let crossRefType: string;
  const isFigure = lowerKey.startsWith("fig:");
  const isTable = lowerKey.startsWith("tbl:");
  const isEquation = lowerKey.startsWith("eq:") || lowerKey.startsWith("eqn:");

  if (isFigure) {
    crossRefType = t("hover.crossRef.figure");
  } else if (isTable) {
    crossRefType = t("hover.crossRef.table");
  } else if (isEquation) {
    crossRefType = t("hover.crossRef.equation");
  } else if (lowerKey.startsWith("sec:")) {
    crossRefType = t("hover.crossRef.section");
  } else if (lowerKey.startsWith("lst:")) {
    crossRefType = t("hover.crossRef.listing");
  } else {
    crossRefType = t("hover.crossRef.unknown");
  }

  markdown.appendMarkdown(`**${t("hover.crossRef.title", { type: crossRefType, key: token.key })}**\n\n`);

  if (isFigure) {
    const figureInfo = findFigureImage(document, token.key);
    if (figureInfo) {
      // Use HTML <img> with explicit width when supportHtml is available
      // (VS Code ≥ 1.83).  VS Code MarkdownString does not support <style>/CSS
      // in hover tooltips (sanitization strips them); the only way to constrain
      // image size is the width attribute.  Falls back to ![]() for older VS Code.
      const imgSrc = vscode.Uri.file(figureInfo.imagePath).toString();
      if ((markdown as any).supportHtml) {
        markdown.appendMarkdown(`<img src="${imgSrc}" width="100%" alt="${figureInfo.caption || "figure"}" />\n\n`);
      } else {
        markdown.appendMarkdown(`![${figureInfo.caption || "figure"}](${imgSrc})\n\n`);
      }
      if (figureInfo.caption) {
        markdown.appendMarkdown(`_${figureInfo.caption}_\n\n`);
      }
      if (figureInfo.context) {
        markdown.appendMarkdown(`\`\`\`markdown\n${figureInfo.context}\n\`\`\``);
      }
      return new vscode.Hover(markdown, token.range);
    }
  }

  if (isTable) {
    const tableContent = findTableContent(document, token.key);
    if (tableContent) {
      markdown.appendMarkdown(tableContent);
      return new vscode.Hover(markdown, token.range);
    }
  }

  if (isEquation) {
    const eqContent = findEquationContent(document, token.key);
    if (eqContent) {
      markdown.appendMarkdown(eqContent);
      return new vscode.Hover(markdown, token.range);
    }
  }

  // Fallback: raw context for sec, lst, or when specialized extractors fail
  const context = findCrossRefContext(document, token.key);
  if (context) {
    markdown.appendMarkdown(context);
  } else {
    markdown.appendMarkdown(t("hover.notFound.crossRef", { key: token.key }));
  }

  return new vscode.Hover(markdown, token.range);
}

type FigureInfo = {
  imagePath: string;
  caption: string;
  context?: string;
};

/**
 * Find the image associated with a pandoc-crossref figure label.
 * 
 * Pandoc syntax requires the image and label on the same line with no spaces between:
 *   ![Caption](path/to/image.png){#fig:label}
 *   ![Caption](path/to/image.png){#fig:label width=50%}
 * 
 * The function:
 * 1. Locates {#fig:label} in the document
 * 2. Searches backward on the same line for ![...](...) 
 * 3. Validates that no other {#...} block sits between ![ and the target label
 * 4. Extracts the image path (resolved relative to document) and caption
 */
function findFigureImage(document: vscode.TextDocument, key: string): FigureInfo | undefined {
  const text = document.getText();
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelPattern = new RegExp(`\\{#${escapedKey}[\\s\\}]`, "i");
  const labelMatch = labelPattern.exec(text);
  if (!labelMatch) {
    return undefined;
  }

  const labelStart = labelMatch.index;

  // Confine search to the same line (pandoc-crossref requires label on same line as image)
  const beforeLabel = text.slice(0, labelStart);
  const lastNewline = beforeLabel.lastIndexOf("\n");
  const lineStartPos = lastNewline >= 0 ? lastNewline + 1 : 0;
  const sameLineBefore = text.slice(lineStartPos, labelStart);

  // Find the nearest ![ marker before the label on this line
  const imageStartRel = sameLineBefore.lastIndexOf("![");
  if (imageStartRel < 0) {
    return undefined;
  }

  const absoluteImageStart = lineStartPos + imageStartRel;

  // --- Validate: no other {#...} block between the ![ and the target label ---
  // This prevents matching a different figure's image when labels are mis-nested.
  const betweenImageAndLabel = text.slice(absoluteImageStart, labelStart);
  const otherAttrPattern = /\{#/g;
  let otherMatch: RegExpExecArray | null;
  while ((otherMatch = otherAttrPattern.exec(betweenImageAndLabel)) !== null) {
    // Found another {#...} — this might belong to the image itself.
    // If the image has {#fig:different-label}, the target label is orphaned.
    // To verify: skip past this attribute block and check if our label is next.
    const attrStart = otherMatch.index + absoluteImageStart;
    const afterAttr = text.slice(attrStart + 2); // skip "{#"
    const closeBrace = afterAttr.indexOf("}");
    if (closeBrace >= 0) {
      const attrContent = afterAttr.slice(0, closeBrace).trim();
      // Only flag if this is a different figure label (starts with "fig:")
      if (/^fig:/i.test(attrContent) && attrContent.toLowerCase() !== key.toLowerCase()) {
        return undefined; // This ![ belongs to a different figure
      }
    }
  }

  // --- Extract image path: ![...](path...) ---
  const afterImageMarker = text.slice(absoluteImageStart + 2); // skip "!["
  const altEnd = afterImageMarker.indexOf("](");
  if (altEnd < 0) {
    return undefined;
  }

  const altText = afterImageMarker.slice(0, altEnd).trim();
  const afterAlt = afterImageMarker.slice(altEnd + 2); // skip "]("
  const pathEnd = afterAlt.indexOf(")");
  if (pathEnd < 0) {
    return undefined;
  }

  const relativePath = afterAlt.slice(0, pathEnd).trim();
  if (!relativePath) {
    return undefined;
  }

  // Resolve the image path relative to the document directory
  const documentDir = path.dirname(document.uri.fsPath);
  const resolvedImagePath = path.resolve(documentDir, relativePath);

  // Build context lines using newline-counting (robust for \r\n and \n)
  const context = buildLineContext(text, absoluteImageStart, /* before */ 1, /* after */ 2);

  return {
    imagePath: resolvedImagePath,
    caption: altText,
    context,
  };
}

/**
 * Extract a pandoc pipe table body associated with a {#tbl:label}.
 *
 * Pandoc table syntax:
 *   a   b   c
 *   --- --- ---
 *   1   2   3
 *   4   5   6
 *
 *   : Caption {#tbl:label}
 *
 * The label sits on or after the caption line.  This function:
 * 1. Locates {#tbl:label}
 * 2. Finds the caption line (starts with ":" or "Table:") around the label
 * 3. Walks backward through empty lines, then captures all table rows until
 *    the blank line above the header row
 * 4. Returns the table as raw markdown (pipe-style) for rendering in the hover
 */
function findTableContent(document: vscode.TextDocument, key: string): string | undefined {
  const text = document.getText();
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelPattern = new RegExp(`\\{#${escapedKey}[\\s\\}]`, "i");
  const labelMatch = labelPattern.exec(text);
  if (!labelMatch) {
    return undefined;
  }

  const lines = text.split(/\r?\n/);
  const labelLineIdx = getLineIndexByOffset(text, labelMatch.index);

  // Find the caption line: the line containing the label, or a ":"-prefixed
  // caption line just before it (label may be on its own line after ": Caption")
  let captionLineIdx = labelLineIdx;
  const labelLine = lines[labelLineIdx] || "";
  if (!/^\s*:/.test(labelLine)) {
    // Search upward for caption line (max 5 lines above)
    for (let i = labelLineIdx - 1; i >= Math.max(0, labelLineIdx - 5); i -= 1) {
      if (/^\s*:/.test(lines[i] || "")) {
        captionLineIdx = i;
        break;
      }
      if ((lines[i] || "").trim() !== "") {
        break; // non-empty non-caption line — stop
      }
    }
  }

  // Walk upward from caption line to find table rows.  The table ends above
  // when we hit a blank line followed by the header row separator.
  let tableStart = captionLineIdx - 1;
  // Skip blank lines between caption and table body
  while (tableStart >= 0 && (lines[tableStart] || "").trim() === "") {
    tableStart -= 1;
  }
  // Now tableStart should be at the last data row. Walk up through rows.
  // A pandoc pipe table has: header, separator (---), data rows.
  // Walk backward past all table rows until we hit a blank line.
  const tableLines: number[] = [];
  let headerFound = false;
  for (let i = tableStart; i >= 0; i -= 1) {
    const line = lines[i] || "";
    if (line.trim() === "" && headerFound) {
      // Hit blank line above the table header — we have the full table
      tableStart = i + 1;
      break;
    }
    if (line.trim() === "") {
      // Blank line inside table? Unlikely for pipe tables. Stop collecting.
      tableStart = i + 1;
      break;
    }
    if (/^[\s|:-]+$/.test(line.trim()) && i > 0 && (lines[i - 1] || "").trim() !== "") {
      // This looks like a separator row (--- | --- etc)
      headerFound = true;
    }
    tableLines.unshift(i);
    if (i === 0) {
      tableStart = 0;
    }
  }

  // Collect the table section: table start → caption line inclusive
  const resultLines: string[] = [];
  for (let i = tableStart; i <= captionLineIdx; i += 1) {
    resultLines.push(lines[i]);
  }

  const tableMarkdown = resultLines.join("\n").trim();
  if (!tableMarkdown) {
    return undefined;
  }

  // Boldify pandoc-crossref @references in table cells so they stand out
  // visually.  VS Code MarkdownString does not support nested hovers, but
  // CommonMark tables do support **bold** inside cells.
  // Skips the caption line (last line, starts with ":") to avoid bold-ifying
  // the caption itself.
  const processedLines = resultLines.map((line, idx) => {
    // Don't touch the caption line
    if (idx === resultLines.length - 1 && /^\s*:/.test(line)) {
      return line;
    }
    // Boldify @fig:/@tbl:/@eq:/@eqn:/@sec:/@lst: references in table cells
    return line.replace(
      /(?<![\[*`])@(fig|tbl|eqn?|sec|lst):([\w-]+)/gi,
      "**@$1:$2**"
    );
  });

  return `\n${processedLines.join("\n")}\n`;
}

/**
 * Extract equation content associated with {#eq:label} or {#eqn:label}.
 *
 * Pandoc syntax:
 *   $$ math $$ {#eq:label}
 * or
 *   $$ math $$
 *   {#eq:label}
 *
 * Returns the equation line(s) rendered as a LaTeX code block so the user
 * can read the source math (VS Code hovers do not render MathJax/KaTeX).
 */
function findEquationContent(document: vscode.TextDocument, key: string): string | undefined {
  const text = document.getText();
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelPattern = new RegExp(`\\{#${escapedKey}[\\s\\}]`, "i");
  const labelMatch = labelPattern.exec(text);
  if (!labelMatch) {
    return undefined;
  }

  const lines = text.split(/\r?\n/);
  const labelLineIdx = getLineIndexByOffset(text, labelMatch.index);
  const labelLine = lines[labelLineIdx] || "";

  // Check if $$ is on the same line as the label
  const inlineMathMatch = /\$\$/.exec(labelLine);
  if (inlineMathMatch) {
    // $$ math $$ {#eq:label}  — extract the math part
    const mathContent = labelLine.slice(0, labelMatch.index).replace(/\$\$/g, "").trim();
    if (mathContent) {
      return `\n$$\n${mathContent}\n$$\n`;
    }
  }

  // Search upward (max 3 lines) for the $$ block
  for (let i = labelLineIdx - 1; i >= Math.max(0, labelLineIdx - 3); i -= 1) {
    const line = lines[i] || "";
    if (/\$\$/.test(line)) {
      // Found the opening $$ — collect lines from there
      const eqLines: string[] = [];
      for (let j = i; j < labelLineIdx; j += 1) {
        eqLines.push(lines[j]);
      }
      // Include the closing $$ if not already there
      const lastEqLine = eqLines[eqLines.length - 1] || "";
      if (!/\$\$/.test(lastEqLine)) {
        eqLines.push("$$");
      }
      return `\n${eqLines.join("\n")}\n`;
    }
    if ((line || "").trim() === "") {
      break; // blank line — equation block has ended
    }
  }

  // Fallback: show the label line as context
  return `\n\`\`\`latex\n${labelLine.trim()}\n\`\`\`\n`;
}

/**
 * Locate the line index of a character position by counting newlines.
 * Works correctly for both \n and \r\n line endings.
 */
function getLineIndexByOffset(text: string, offset: number): number {
  let lineIndex = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === "\n") {
      lineIndex += 1;
    }
  }
  return lineIndex;
}

/**
 * Build a formatted code-block string showing surrounding context lines.
 * Uses newline-counting (not split) for correct line alignment with \r\n.
 */
function buildLineContext(text: string, matchOffset: number, beforeLines: number, afterLines: number): string {
  const matchLineIndex = getLineIndexByOffset(text, matchOffset);
  const lines = text.split(/\r?\n/);
  const totalLines = lines.length;

  const contextStart = Math.max(0, matchLineIndex - beforeLines);
  const contextEnd = Math.min(totalLines - 1, matchLineIndex + afterLines);
  const contextLines: string[] = [];
  for (let i = contextStart; i <= contextEnd; i += 1) {
    const prefix = i === matchLineIndex ? "> " : "  ";
    contextLines.push(`${prefix}${lines[i]}`);
  }
  return contextLines.join("\n");
}

function findCrossRefContext(document: vscode.TextDocument, key: string): string | undefined {
  const text = document.getText();
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelPattern = new RegExp(`\\{#${escapedKey}[\\s\\}]`, "i");
  const match = labelPattern.exec(text);
  if (!match) {
    return undefined;
  }

  const matchPos = match.index;
  const context = buildLineContext(text, matchPos, /* before */ 2, /* after */ 3);
  return `\`\`\`markdown\n${context}\n\`\`\``;
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
