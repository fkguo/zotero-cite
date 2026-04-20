import * as vscode from "vscode";

import { t } from "./i18n";

type CursorRoundText = {
  startIndex: number;
  content: string;
};

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
  if (editor.document.languageId === "markdown") {
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

  if (editor.document.languageId === "markdown") {
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
  const data = getCursorRoundText(editor);
  if (!data) {
    return null;
  }

  const cursorLocation = editor.document.offsetAt(editor.selection.active);
  let pattern: RegExp | undefined;

  if (editor.document.languageId === "markdown") {
    pattern = /\[([@^][\w-:\d]+(;| ){0,2})+\]/g;
  }

  if (editor.document.languageId === "latex") {
    pattern = /cite[tp]?\{([\w-:\d]+(,|，| ){0,2})+\}/g;
  }

  if (!pattern) {
    return null;
  }

  const matches = getMatchList(pattern, data.content);
  for (const match of matches) {
    const startIndex = match.index + data.startIndex;
    const endIndex = match.index + match[0].length + data.startIndex;
    if (cursorLocation >= startIndex && cursorLocation <= endIndex) {
      return endIndex;
    }
  }

  return null;
}

function getCursorRoundText(editor: vscode.TextEditor, length = 50): CursorRoundText | undefined {
  const textLength = editor.document.getText().length;

  if (!editor.selection.isEmpty) {
    return undefined;
  }

  const cursorPosition = editor.selection.active;
  const cursorIndex = editor.document.offsetAt(cursorPosition);

  const startIndex = Math.max(cursorIndex - length, 0);
  const endIndex = Math.min(cursorIndex + length, textLength);

  const startPos = editor.document.positionAt(startIndex);
  const endPos = editor.document.positionAt(endIndex);

  const range = new vscode.Range(startPos, endPos);
  const text = editor.document.getText(range);

  return {
    startIndex,
    content: text,
  };
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

function getCiteKeyList(keyMatchList: RegExpExecArray[]): string[] {
  const citeKeyList: string[] = [];
  keyMatchList.forEach((value) => {
    const cleaned = value[0].replace(/^cite[tp]?/, "");
    const keyPattern = /[\w-:\d]+/g;
    const keyMatches = getMatchList(keyPattern, cleaned);
    keyMatches.forEach((keyMatch) => {
      citeKeyList.push(keyMatch[0]);
    });
  });

  return citeKeyList;
}
