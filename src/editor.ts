import * as vscode from "vscode";

import { t } from "./i18n";

const MARKDOWN_LIKE_LANGUAGE_IDS = new Set(["markdown", "quarto", "rmd", "mdx"]);
const MARKDOWN_LIKE_EXTENSIONS = [".md", ".markdown", ".qmd", ".rmd", ".mdx"];

export function isMarkdownLikeDocument(document: vscode.TextDocument): boolean {
  if (MARKDOWN_LIKE_LANGUAGE_IDS.has(document.languageId)) {
    return true;
  }

  const lowerPath = document.uri.path.toLowerCase();
  return MARKDOWN_LIKE_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
}

export function getActiveEditor(): vscode.TextEditor {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error(t("error.noActiveEditor"));
  }
  return editor;
}

export function insertText(text: string, location = -1, editor: vscode.TextEditor = getActiveEditor()): void {
  void editor.edit((editBuilder) => {
    if (location === -1) {
      editBuilder.insert(editor.selection.active, text);
    } else if (location === -2) {
      const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
      editBuilder.insert(new vscode.Position(lastLine.lineNumber + 1, 0), text);
    } else {
      const position = editor.document.positionAt(location);
      editBuilder.insert(position, text);
    }
  });
}

export async function insertTextAsync(
  text: string,
  location = -1,
  editor: vscode.TextEditor = getActiveEditor()
): Promise<void> {
  await editor.edit((editBuilder) => {
    if (location === -1) {
      editBuilder.insert(editor.selection.active, text);
    } else if (location === -2) {
      const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
      editBuilder.insert(new vscode.Position(lastLine.lineNumber + 1, 0), text);
    } else {
      const position = editor.document.positionAt(location);
      editBuilder.insert(position, text);
    }
  });
}

export function getDocumentCiteKeys(editor: vscode.TextEditor = getActiveEditor()): string[] {
  let content = editor.document.getText();
  const cjkRegex = /[\u4e00-\u9fa5]/;
  if (cjkRegex.test(content)) {
    content = content.replace(/，/g, ",");
  }

  let pattern: RegExp | undefined;
  if (isMarkdownLikeDocument(editor.document)) {
    pattern = /\[([@^][\w-:\d]+(;| ){0,2})+\]/g;
  }

  if (editor.document.languageId === "latex") {
    pattern = /cite[tp]?(\[[^\]]*\])?\{([\w-:\d]+(,| ){0,2})+\}/g;
  }

  if (!pattern) {
    return [];
  }

  const matches = getMatchList(pattern, content);
  return getCiteKeyList(matches);
}

export function insertCiteKeys(keyList: string[], editor: vscode.TextEditor = getActiveEditor()): void {
  const addLocation = getKeyEnvOffset(editor);

  if (editor.document.languageId === "latex") {
    if (addLocation === null) {
      insertText("\\cite{" + keyList.join(", ") + "}", -1, editor);
    } else {
      insertText(", " + keyList.join(", "), addLocation - 1, editor);
    }
  }

  if (isMarkdownLikeDocument(editor.document)) {
    if (addLocation === null) {
      insertText("[" + keyList.map((v) => "@" + v).join("; ") + "]", -1, editor);
    } else {
      insertText("; " + keyList.map((v) => "@" + v).join("; "), addLocation - 1, editor);
    }
  }
}

export function makeId(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getKeyEnvOffset(editor: vscode.TextEditor): number | null {
  if (!editor.selection.isEmpty) {
    return null;
  }

  const cursorLocation = editor.document.offsetAt(editor.selection.active);
  const pattern = getKeyEnvPattern(editor.document);

  if (!pattern) {
    return null;
  }

  const matches = getMatchList(pattern, editor.document.getText());
  let bestEndIndex: number | null = null;
  let bestRangeLength = Number.POSITIVE_INFINITY;

  for (const match of matches) {
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;

    // Use [start, end) to avoid boundary ambiguities when citations are adjacent.
    if (cursorLocation >= startIndex && cursorLocation < endIndex) {
      const rangeLength = endIndex - startIndex;
      if (rangeLength < bestRangeLength) {
        bestRangeLength = rangeLength;
        bestEndIndex = endIndex;
      }
    }
  }

  return bestEndIndex;
}

function getKeyEnvPattern(document: vscode.TextDocument): RegExp | undefined {
  if (isMarkdownLikeDocument(document)) {
    return /\[([@^][\w-:\d]+(;| ){0,2})+\]/g;
  }

  if (document.languageId === "latex") {
    return /cite[tp]?(\[[^\]]*\]){0,2}\{([\w-:\d]+(,|，| ){0,2})+\}/g;
  }

  return undefined;
}

function getMatchList(pattern: RegExp, text: string): RegExpExecArray[] {
  const matchList: RegExpExecArray[] = [];
  pattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matchList.push(match);
  }

  return matchList;
}

const PANDOC_CROSSREF_PREFIXES = ["fig:", "tbl:", "eqn:"];

export function isPandocCrossRef(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return PANDOC_CROSSREF_PREFIXES.some((prefix) => lowerKey.startsWith(prefix));
}

function getCiteKeyList(keyMatchList: RegExpExecArray[]): string[] {
  const citeKeyList: string[] = [];
  keyMatchList.forEach((value) => {
    const cleaned = value[0].replace(/^cite[tp]?/, "");
    const keyPattern = /[\w-:\d]+/g;
    const keyMatches = getMatchList(keyPattern, cleaned);
    keyMatches.forEach((keyMatch) => {
      const key = keyMatch[0];
      if (!isPandocCrossRef(key)) {
        citeKeyList.push(key);
      }
    });
  });

  return citeKeyList;
}
