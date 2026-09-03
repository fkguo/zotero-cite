export type LatexBibliographyReference = {
  command: "bibliography" | "biblatex";
  path: string;
};

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

export function stripLatexComments(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] === "%" && !isEscaped(line, index)) {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join("\n");
}

function normalizeLiteralPath(value: string): string | undefined {
  const normalized = value.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!normalized || /[\\{}$#]/.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function ensureExtension(value: string, extension: string): string {
  return /\.[^/\\]+$/.test(value) ? value : `${value}${extension}`;
}

export function extractLatexBibliographyReferences(content: string): LatexBibliographyReference[] {
  const source = stripLatexComments(content);
  const references: LatexBibliographyReference[] = [];
  const seen = new Set<string>();

  const biblatexPattern = /\\(?:addbibresource|addglobalbib|addsectionbib)\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = biblatexPattern.exec(source)) !== null) {
    const literal = normalizeLiteralPath(match[1]);
    if (!literal) {
      continue;
    }
    const bibPath = ensureExtension(literal, ".bib");
    const key = `biblatex:${bibPath}`;
    if (!seen.has(key)) {
      seen.add(key);
      references.push({ command: "biblatex", path: bibPath });
    }
  }

  const bibliographyPattern = /\\bibliography\s*\{([^{}]+)\}/g;
  while ((match = bibliographyPattern.exec(source)) !== null) {
    for (const value of match[1].split(",")) {
      const literal = normalizeLiteralPath(value);
      if (!literal) {
        continue;
      }
      const bibPath = ensureExtension(literal, ".bib");
      const key = `bibliography:${bibPath}`;
      if (!seen.has(key)) {
        seen.add(key);
        references.push({ command: "bibliography", path: bibPath });
      }
    }
  }

  return references;
}

export function extractLatexIncludes(content: string): string[] {
  const source = stripLatexComments(content);
  const includes: string[] = [];
  const seen = new Set<string>();
  const includePattern = /\\(?:input|include|subfile)\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = includePattern.exec(source)) !== null) {
    const literal = normalizeLiteralPath(match[1]);
    if (!literal) {
      continue;
    }
    const texPath = ensureExtension(literal, ".tex");
    if (!seen.has(texPath)) {
      seen.add(texPath);
      includes.push(texPath);
    }
  }

  return includes;
}

export function extractLatexRootDirective(content: string): string | undefined {
  const rootPattern = /^\s*%+\s*!\s*TeX\s+root\s*=\s*(.+?)\s*$/gim;
  const match = rootPattern.exec(content);
  if (!match) {
    return undefined;
  }
  const literal = normalizeLiteralPath(match[1]);
  return literal ? ensureExtension(literal, ".tex") : undefined;
}

export function containsLatexDocumentClass(content: string): boolean {
  return /\\documentclass\s*(?:\[[^\]]*\]\s*)?\{[^{}]+\}/.test(stripLatexComments(content));
}
