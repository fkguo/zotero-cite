export type CitationSpan = {
  start: number;
  end: number;
};

const CITE_KEY_SOURCE = "[\\w:./+-]+";
const PANDOC_CROSSREF_PREFIXES = ["fig:", "tbl:", "eq:", "eqn:", "sec:", "lst:"];

export function isPandocCrossRef(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return PANDOC_CROSSREF_PREFIXES.some((prefix) => lowerKey.startsWith(prefix));
}

export function extractLatexCitationKeys(text: string, command: string): string[] {
  const result: string[] = [];
  for (const match of matchLatexCitations(text, command)) {
    const keyBlock = match[1] || "";
    keyBlock
      .replace(/，/g, ",")
      .split(",")
      .map((key) => key.trim())
      .filter((key) => new RegExp(`^${CITE_KEY_SOURCE}$`).test(key))
      .forEach((key) => result.push(key));
  }
  return result;
}

export function extractMarkdownCitationKeys(text: string): string[] {
  const indexedKeys: Array<{ index: number; key: string }> = [];
  const patterns = [
    new RegExp(`@(${CITE_KEY_SOURCE})`, "g"),
    new RegExp(`\\[\\^(${CITE_KEY_SOURCE})\\]`, "g"),
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const key = match[1];
      if (!isPandocCrossRef(key)) {
        indexedKeys.push({ index: match.index, key });
      }
    }
  }

  return indexedKeys.sort((a, b) => a.index - b.index).map((item) => item.key);
}

export function findLatexCitationSpans(text: string, command: string): CitationSpan[] {
  return matchLatexCitations(text, command).map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function findMarkdownCitationSpans(text: string): CitationSpan[] {
  const pattern = new RegExp(`\\[[^\\]\\r\\n]*@${CITE_KEY_SOURCE}[^\\]\\r\\n]*\\]`, "g");
  const spans: CitationSpan[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function matchLatexCitations(text: string, command: string): RegExpExecArray[] {
  const normalizedCommand = command.replace(/^\\+/, "").trim();
  if (!/^[A-Za-z@]+$/.test(normalizedCommand)) {
    return [];
  }

  const escapedCommand = escapeRegExp(normalizedCommand);
  const pattern = new RegExp(
    `\\\\${escapedCommand}\\*?\\s*(?:\\[[^\\]\\r\\n]*\\]\\s*){0,2}\\{([^{}\\r\\n]*)\\}`,
    "g"
  );
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push(match);
  }
  return matches;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
