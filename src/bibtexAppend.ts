import type { ParsedBibEntry } from "./bibtexParser";

// The package does not publish TypeScript declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bibtexParse = require("@orcid/bibtex-parse-js") as {
  toJSON: (content: string) => ParsedBibEntry[];
};

export type BibtexSyntaxWarning = {
  key?: string;
  line: number;
  message: string;
};

export type AppendBibEntry = ParsedBibEntry & { unparsedBibtex?: string };
export type BibtexAppendIndex = {
  entries: AppendBibEntry[];
  syntaxWarnings: BibtexSyntaxWarning[];
};

/** Runs only in the bounded parser worker. Never repairs or serializes old text. */
export function indexBibtexForAppend(content: string): BibtexAppendIndex {
  try {
    return { entries: bibtexParse.toJSON(content), syntaxWarnings: [] };
  } catch (_error) {
    // A malformed, independently delimited entry can be retained as opaque text.
    // Do not guess where an entry ends if braces or quotes are unbalanced.
  }

  const entries: AppendBibEntry[] = [];
  const syntaxWarnings: BibtexSyntaxWarning[] = [];
  const header = /@([A-Za-z]+)\s*([{(])/y;
  let position = 0;
  let line = 1;
  const advance = (): void => {
    if (content[position] === "\n") {
      line += 1;
    }
    position += 1;
  };
  const skipComment = (): void => {
    while (position < content.length && content[position] !== "\n") {
      advance();
    }
  };
  const unsafeBoundary = (startLine: number): Error => new Error(
    `Cannot safely locate a BibTeX entry boundary at line ${startLine}; check its header, braces and quotes.`
  );

  while (position < content.length) {
    if (content[position] === "%") {
      skipComment();
      continue;
    }
    if (content[position] !== "@") {
      advance();
      continue;
    }
    const start = position;
    const startLine = line;
    header.lastIndex = position;
    const match = header.exec(content);
    if (!match) {
      throw unsafeBoundary(startLine);
    }
    const entryType = match[1];
    const isComment = entryType.toLowerCase() === "comment";
    const closing = match[2] === "{" ? "}" : ")";
    while (position < header.lastIndex) {
      advance();
    }
    const bodyStart = position;
    let depth = 0;
    let quoted = false;
    let closed = false;
    while (position < content.length) {
      const char = content[position];
      if (char === "\\") {
        advance();
        if (position < content.length) {
          advance();
        }
        continue;
      }
      if (!isComment && char === "%" && depth === 0 && !quoted) {
        skipComment();
        continue;
      }
      if (!isComment && char === "@" && depth === 0 && !quoted) {
        throw unsafeBoundary(startLine);
      }
      if (!isComment && char === '"' && depth === 0) {
        quoted = !quoted;
      } else if (char === "{") {
        depth += 1;
      } else if (char === closing && depth === 0 && !quoted) {
        advance();
        closed = true;
        break;
      } else if (char === "}") {
        if (depth === 0) {
          throw unsafeBoundary(startLine);
        }
        depth -= 1;
      }
      advance();
    }
    if (!closed) {
      throw unsafeBoundary(startLine);
    }

    const raw = content.slice(start, position);
    const directive = /^(comment|string|preamble)$/i.test(entryType);
    const keyMatch = directive ? undefined : /^\s*([^\s,{}()"=\\%#]+)\s*,/.exec(
      content.slice(bodyStart, position - 1)
    );
    if (!directive && !keyMatch) {
      throw unsafeBoundary(startLine);
    }
    const key = keyMatch?.[1];
    try {
      const parsed = bibtexParse.toJSON(raw);
      if (parsed.length !== 1 || (!directive && parsed[0].citationKey !== key)) {
        throw new Error("The BibTeX entry key could not be verified.");
      }
      entries.push(parsed[0]);
    } catch (error) {
      entries.push({ citationKey: key, entryType, unparsedBibtex: raw });
      syntaxWarnings.push({
        key,
        line: startLine,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { entries, syntaxWarnings };
}
