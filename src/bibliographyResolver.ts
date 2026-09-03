import * as path from "path";
import * as vscode from "vscode";

import { isUriWithin, isValidBibName, resolveBibPath, validateBibName } from "./bibPath";
import { getDefaultBibName, getExplicitBibName } from "./config";
import {
  containsLatexDocumentClass,
  extractLatexBibliographyReferences,
  extractLatexIncludes,
  extractLatexRootDirective,
} from "./latexBibliography";
import { t } from "./i18n";

const MAX_TEX_FILES = 200;
const MAX_BIB_FILES = 200;
const EXCLUDED_DISCOVERY_DIRECTORIES = new Set([".git", "node_modules", ".output"]);
const sessionBibliographySelections = new Map<string, string>();

export type BibliographyResolutionOptions = {
  promptOnMultiple?: boolean;
};

type TexSource = {
  content: string;
  uri: vscode.Uri;
};

function isLatexUri(uri: vscode.Uri): boolean {
  return [".tex", ".ltx", ".ctx"].includes(path.extname(uri.path).toLowerCase());
}

function isBibUri(uri: vscode.Uri): boolean {
  return path.extname(uri.path).toLowerCase() === ".bib";
}

function findOpenDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
}

async function readText(uri: vscode.Uri): Promise<string> {
  const openDocument = findOpenDocument(uri);
  if (openDocument) {
    return openDocument.getText();
  }
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString("utf8");
}

async function tryReadText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return await readText(uri);
  } catch (_error) {
    return undefined;
  }
}

function joinRelative(baseFile: vscode.Uri, relativePath: string): vscode.Uri {
  return vscode.Uri.joinPath(baseFile, "..", relativePath);
}

async function resolveInclude(
  rootUri: vscode.Uri,
  declaringUri: vscode.Uri,
  includePath: string
): Promise<vscode.Uri | undefined> {
  const candidates = [joinRelative(rootUri, includePath), joinRelative(declaringUri, includePath)];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.toString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if ((await tryReadText(candidate)) !== undefined) {
      return candidate;
    }
  }
  return undefined;
}

async function collectTexSources(rootUri: vscode.Uri): Promise<TexSource[]> {
  const sources: TexSource[] = [];
  const pending: vscode.Uri[] = [rootUri];
  const visited = new Set<string>();

  while (pending.length > 0 && visited.size < MAX_TEX_FILES) {
    const uri = pending.shift();
    if (!uri) {
      break;
    }
    const key = uri.toString();
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);

    const content = await tryReadText(uri);
    if (content === undefined) {
      continue;
    }
    sources.push({ content, uri });

    for (const includePath of extractLatexIncludes(content)) {
      const includeUri = await resolveInclude(rootUri, uri, includePath);
      if (includeUri && !visited.has(includeUri.toString())) {
        pending.push(includeUri);
      }
    }
  }

  return sources;
}

async function findRootUris(document: vscode.TextDocument): Promise<vscode.Uri[]> {
  const content = document.getText();
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const rootDirective = extractLatexRootDirective(content);
  if (rootDirective) {
    const rootUri = joinRelative(document.uri, rootDirective);
    if (
      (!workspaceFolder || isUriWithin(workspaceFolder.uri, rootUri)) &&
      (await tryReadText(rootUri)) !== undefined
    ) {
      return [rootUri];
    }
  }

  if (containsLatexDocumentClass(content)) {
    return [document.uri];
  }

  if (!workspaceFolder) {
    return [document.uri];
  }

  const pattern = new vscode.RelativePattern(workspaceFolder, "**/*.{tex,ltx,ctx}");
  let candidates: vscode.Uri[];
  try {
    candidates = await vscode.workspace.findFiles(pattern, "**/{.git,node_modules}/**", MAX_TEX_FILES);
  } catch (_error) {
    return [document.uri];
  }
  const roots: vscode.Uri[] = [];
  for (const candidate of candidates) {
    const candidateContent = await tryReadText(candidate);
    if (!candidateContent || !containsLatexDocumentClass(candidateContent)) {
      continue;
    }
    const sources = await collectTexSources(candidate);
    if (sources.some((source) => source.uri.toString() === document.uri.toString())) {
      roots.push(candidate);
    }
  }

  return roots.length > 0 ? roots : [document.uri];
}

export async function detectLatexBibliographyPaths(document: vscode.TextDocument): Promise<vscode.Uri[]> {
  if (document.isUntitled || !isLatexUri(document.uri)) {
    return [];
  }

  const candidates: vscode.Uri[] = [];
  const seen = new Set<string>();
  const roots = await findRootUris(document);
  for (const rootUri of roots) {
    const sources = await collectTexSources(rootUri);
    for (const source of sources) {
      for (const reference of extractLatexBibliographyReferences(source.content)) {
        // An unrelated malformed declaration must not prevent a later valid
        // bibliography declaration from being detected.
        if (!isValidBibName(reference.path)) {
          continue;
        }
        const bibUri = resolveBibPath(rootUri, reference.path);
        const key = bibUri.toString();
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(bibUri);
        }
      }
    }
  }

  return candidates;
}

async function discoverWorkspaceBibliographyPaths(document: vscode.TextDocument): Promise<vscode.Uri[]> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return [];
  }

  const candidates: vscode.Uri[] = [];
  const pending: vscode.Uri[] = [workspaceFolder.uri];
  const visited = new Set<string>();

  while (
    pending.length > 0 &&
    candidates.length < MAX_BIB_FILES &&
    visited.size < MAX_TEX_FILES
  ) {
    const directory = pending.shift();
    if (!directory) {
      break;
    }
    const key = directory.toString();
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(directory);
    } catch (_error) {
      continue;
    }

    entries.sort(([left], [right]) => left.localeCompare(right));
    for (const [name, fileType] of entries) {
      const uri = vscode.Uri.joinPath(directory, name);
      if ((fileType & vscode.FileType.Directory) === vscode.FileType.Directory) {
        if (!EXCLUDED_DISCOVERY_DIRECTORIES.has(name)) {
          pending.push(uri);
        }
      } else if ((fileType & vscode.FileType.File) === vscode.FileType.File && isBibUri(uri)) {
        candidates.push(uri);
        if (candidates.length >= MAX_BIB_FILES) {
          break;
        }
      }
    }
  }

  return candidates;
}

function getSelectionCacheKey(document: vscode.TextDocument, candidates: vscode.Uri[]): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const scope = workspaceFolder?.uri.toString() || document.uri.toString();
  return `${scope}\n${candidates.map((uri) => uri.toString()).sort().join("\n")}`;
}

async function selectBibliographyPath(
  document: vscode.TextDocument,
  candidates: vscode.Uri[],
  promptOnMultiple: boolean
): Promise<vscode.Uri | undefined> {
  const cacheKey = getSelectionCacheKey(document, candidates);
  const cachedUri = sessionBibliographySelections.get(cacheKey);
  const cached = cachedUri && candidates.find((uri) => uri.toString() === cachedUri);
  if (cached) {
    return cached;
  }
  if (!promptOnMultiple) {
    return undefined;
  }

  const items = candidates.map((uri) => ({
    label: path.basename(uri.path),
    description: vscode.workspace.asRelativePath(uri, false),
    uri,
  }));
  const selected = await vscode.window.showQuickPick(items, {
    title: t("quickPick.bibliographyFileTitle"),
    placeHolder: t("quickPick.bibliographyFilePlaceholder"),
    matchOnDescription: true,
  });
  if (selected) {
    sessionBibliographySelections.set(cacheKey, selected.uri.toString());
  }
  return selected?.uri;
}

export async function resolveDocumentBibliographyPath(
  document: vscode.TextDocument,
  options: BibliographyResolutionOptions = {}
): Promise<vscode.Uri | undefined> {
  if (document.isUntitled) {
    return undefined;
  }

  if (isBibUri(document.uri)) {
    return document.uri;
  }

  const explicitBibName = getExplicitBibName(document.uri);
  if (explicitBibName) {
    validateBibName(explicitBibName);
    return resolveBibPath(document.uri, explicitBibName);
  }

  if (isLatexUri(document.uri)) {
    const candidates = await detectLatexBibliographyPaths(document);
    if (candidates.length === 1) {
      return candidates[0];
    }
    if (candidates.length > 1) {
      return selectBibliographyPath(document, candidates, options.promptOnMultiple === true);
    }

    const discoveredCandidates = await discoverWorkspaceBibliographyPaths(document);
    if (discoveredCandidates.length === 1) {
      return discoveredCandidates[0];
    }
    if (discoveredCandidates.length > 1) {
      return selectBibliographyPath(document, discoveredCandidates, options.promptOnMultiple === true);
    }
  }

  const fallback = getDefaultBibName(document.uri);
  validateBibName(fallback);
  return resolveBibPath(document.uri, fallback);
}
