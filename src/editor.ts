import * as vscode from "vscode";

import {
  CitationSpan,
  extractLatexCitationKeys,
  extractMarkdownCitationKeys,
  findLatexCitationSpans,
  findMarkdownCitationSpans,
} from "./citationParser";
import { getMissingCiteKeys, uniqueCiteKeys } from "./citeKeys";
import { getLatexCitationCommand } from "./config";
import { t } from "./i18n";

export { isPandocCrossRef } from "./citationParser";

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

export async function insertTextAsync(
  text: string,
  location = -1,
  editor: vscode.TextEditor = getActiveEditor()
): Promise<void> {
  const applied = await editor.edit((editBuilder) => {
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

  if (!applied) {
    throw new Error(t("error.editorRejectedEdit"));
  }
}

export function getDocumentCiteKeys(editor: vscode.TextEditor = getActiveEditor()): string[] {
  const content = editor.document.getText();
  if (isMarkdownLikeDocument(editor.document)) {
    return extractMarkdownCitationKeys(content);
  }

  if (editor.document.languageId === "latex") {
    return extractLatexCitationKeys(content, getLatexCitationCommand());
  }

  return [];
}

export async function insertCiteKeys(
  keyList: string[],
  editor: vscode.TextEditor = getActiveEditor()
): Promise<void> {
  const citationSpan = getKeyEnvSpan(editor);
  const latexCitationCommand = getLatexCitationCommand();

  if (editor.document.languageId === "latex") {
    const keys = uniqueCiteKeys(keyList);
    if (keys.length === 0) {
      return;
    }
    if (citationSpan === null) {
      await insertTextAsync("\\" + latexCitationCommand + "{" + keys.join(", ") + "}", -1, editor);
    } else {
      const citationText = editor.document.getText().slice(citationSpan.start, citationSpan.end);
      const keyBlock = citationText.slice(citationText.lastIndexOf("{") + 1, -1);
      const existingKeys = keyBlock.replace(/，/g, ",").split(",");
      const missingKeys = getMissingCiteKeys(existingKeys, keys);
      if (missingKeys.length > 0) {
        const separator = !keyBlock.trim() || /[,，]\s*$/.test(keyBlock) ? "" : ", ";
        await insertTextAsync(separator + missingKeys.join(", "), citationSpan.end - 1, editor);
      }
    }
  }

  if (isMarkdownLikeDocument(editor.document)) {
    if (citationSpan === null) {
      await insertTextAsync("[" + keyList.map((v) => "@" + v).join("; ") + "]", -1, editor);
    } else {
      await insertTextAsync("; " + keyList.map((v) => "@" + v).join("; "), citationSpan.end - 1, editor);
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

function getKeyEnvSpan(editor: vscode.TextEditor): CitationSpan | null {
  if (!editor.selection.isEmpty) {
    return null;
  }

  const cursorLocation = editor.document.offsetAt(editor.selection.active);
  const content = editor.document.getText();
  const isLatex = editor.document.languageId === "latex";
  const matches = isMarkdownLikeDocument(editor.document)
    ? findMarkdownCitationSpans(content)
    : isLatex
      ? Array.from(new Set([getLatexCitationCommand(), "cite"]))
        .flatMap((command) => findLatexCitationSpans(content, command))
      : [];

  // At \\cite{a}|\\cite{b}, prefer the citation immediately before the cursor.
  // Do not cross whitespace or punctuation; keep Markdown's existing boundary behavior.
  if (isLatex) {
    const precedingCitation = matches.find((match) => match.end === cursorLocation);
    if (precedingCitation) {
      return precedingCitation;
    }
  }

  let bestSpan: CitationSpan | null = null;
  let bestRangeLength = Number.POSITIVE_INFINITY;

  for (const match of matches) {
    const startIndex = match.start;
    const endIndex = match.end;

    // For other cursor positions, keep the existing containing-span behavior.
    if (cursorLocation >= startIndex && cursorLocation < endIndex) {
      const rangeLength = endIndex - startIndex;
      if (rangeLength < bestRangeLength) {
        bestRangeLength = rangeLength;
        bestSpan = match;
      }
    }
  }

  return bestSpan;
}
