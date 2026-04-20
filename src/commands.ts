import * as path from "path";
import * as vscode from "vscode";

import {
  appendBibliographyEntries,
  getBibliographyKeyFromFile,
  readBibEntriesFromFile,
  toBibtex,
  writeBibEntries,
} from "./bibtexStore";
import { resolveBibPath, validateBibName } from "./bibPath";
import { getBibliography } from "./bibliography";
import { getDefaultBibName, setLatestBibName } from "./config";
import {
  getActiveEditor,
  getDocumentCiteKeys,
  insertCiteKeys,
  insertText,
  insertTextAsync,
  isMarkdownLikeDocument,
  makeId,
} from "./editor";
import { errorToMessage, t } from "./i18n";
import { getOutputChannel, showErrorMessage, showInformationMessage, showStatusMessage } from "./ui";
import { getBibtexFromZotero, getMarkdownBibliography, pickCiteKeys } from "./zotero";

type CommandPickItem = vscode.QuickPickItem & {
  commandId: string;
};

type RunnableCommand = {
  id: string;
  labelKey: string;
  languages: string[];
};

const runnableCommands: RunnableCommand[] = [
  {
    id: "zotero-cite.citeSmart",
    labelKey: "quickPick.command.citeSmart",
    languages: ["markdown", "latex"],
  },
  {
    id: "zotero-cite.exportBibLatex",
    labelKey: "quickPick.command.exportBibLatex",
    languages: ["markdown", "latex"],
  },
  {
    id: "zotero-cite.addCitation",
    labelKey: "quickPick.command.addCitation",
    languages: ["markdown", "latex"],
  },
  {
    id: "zotero-cite.citeBibliography",
    labelKey: "quickPick.command.citeBibliography",
    languages: ["markdown", "latex"],
  },
  {
    id: "zotero-cite.citeMarkdownBibliography",
    labelKey: "quickPick.command.citeMarkdownBibliography",
    languages: ["markdown"],
  },
  {
    id: "zotero-cite.addHyperLinkCitation",
    labelKey: "quickPick.command.addHyperLinkCitation",
    languages: ["markdown"],
  },
  {
    id: "zotero-cite.updateBibtexFromZotero",
    labelKey: "quickPick.command.updateBibtexFromZotero",
    languages: ["bibtex", "latex"],
  },
];

function supportsLanguage(document: vscode.TextDocument, language: string): boolean {
  if (language === "markdown") {
    return isMarkdownLikeDocument(document);
  }

  return document.languageId === language;
}

function supportsCommand(document: vscode.TextDocument, command: RunnableCommand): boolean {
  return command.languages.some((language) => supportsLanguage(document, language));
}

function getLanguageLabel(language: string): string {
  if (language === "markdown") {
    return "markdown/qmd/rmd/mdx";
  }

  return language;
}

async function exportBibLatex(): Promise<void> {
  try {
    const editor = getActiveEditor();

    if (editor.document.isUntitled) {
      showErrorMessage(t("error.saveCurrentFileBeforeExport"));
      return;
    }

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      showErrorMessage(t("error.noWorkspaceFolder"));
      return;
    }

    const currentFileUri = editor.document.uri;
    const bibName = await vscode.window.showInputBox({
      value: getDefaultBibName(),
      prompt: t("input.fileNamePrompt"),
    });

    if (bibName === undefined) {
      throw new Error(t("error.cancelled"));
    }

    validateBibName(bibName);

    const bibPath = vscode.Uri.joinPath(currentFileUri, "..", bibName);
    const keys = getDocumentCiteKeys(editor);
    const uniqueKeys = Array.from(new Set(keys));

    if (uniqueKeys.length === 0) {
      throw new Error(t("error.noKeyDetected"));
    }

    const bibliography = await getBibliography(uniqueKeys);
    await vscode.workspace.fs.writeFile(bibPath, Buffer.from(bibliography + "\n", "utf-8"));
    showStatusMessage(t("status.exportSuccess"));
    setLatestBibName(bibName);
  } catch (error) {
    if (error instanceof vscode.CancellationError) {
      showStatusMessage(t("status.exportCancelled"));
      return;
    }
    showErrorMessage(errorToMessage(error));
  }
}

async function insertMarkdownBibliography(citeKey: string, editor: vscode.TextEditor): Promise<void> {
  const bibliography = await getMarkdownBibliography(citeKey);
  await appendMarkdownFootnoteDefinition(citeKey, bibliography, editor);
}

function getDocumentEol(editor: vscode.TextEditor): string {
  return editor.document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
}

function normalizeLineEndings(text: string, eol: string): string {
  return text.replace(/\r\n|\r|\n/g, eol);
}

async function appendMarkdownFootnoteDefinition(
  citeKey: string,
  content: string,
  editor: vscode.TextEditor
): Promise<void> {
  const documentText = editor.document.getText();
  const eol = getDocumentEol(editor);
  const normalizedContent = normalizeLineEndings(String(content || "").trim(), eol);

  const needsLeadingEol = documentText.length > 0 && !/\r?\n$/.test(documentText);
  const textToInsert = `${needsLeadingEol ? eol : ""}[^${citeKey}]: ${normalizedContent}${eol}`;

  await insertTextAsync(textToInsert, documentText.length, editor);
}

async function citeMarkdownBibliography(): Promise<void> {
  try {
    const editor = getActiveEditor();
    const existingKeys = getDocumentCiteKeys(editor);
    const citeKeys = await pickCiteKeys();

    await insertTextAsync("[^" + citeKeys.join("][^") + "]", -1, editor);

    for (const key of citeKeys) {
      if (!existingKeys.includes(key)) {
        await insertMarkdownBibliography(key, editor);
      }
    }
  } catch (error) {
    showErrorMessage(errorToMessage(error));
  }
}

async function addCitation(): Promise<void> {
  try {
    const editor = getActiveEditor();
    const citeKeys = await pickCiteKeys();
    insertCiteKeys(citeKeys, editor);
  } catch (error) {
    showErrorMessage(errorToMessage(error));
  }
}

async function showTaskPicker(): Promise<void> {
  try {
    const editor = getActiveEditor();
    const languageId = editor.document.languageId;

    const availableCommands = runnableCommands.filter((item) => supportsCommand(editor.document, item));
    if (availableCommands.length === 0) {
      showErrorMessage(t("error.noRunnableCommandForLanguage", { lang: languageId }));
      return;
    }

    const items: CommandPickItem[] = availableCommands.map((item) => ({
      label: t(item.labelKey),
      description: t("quickPick.availableFor", { langs: item.languages.map((lang) => getLanguageLabel(lang)).join(", ") }),
      commandId: item.id,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      title: t("quickPick.taskPickerTitle"),
      placeHolder: t("quickPick.taskPickerPlaceholder"),
      matchOnDescription: true,
    });

    if (!picked) {
      return;
    }

    await vscode.commands.executeCommand(picked.commandId);
  } catch (error) {
    showErrorMessage(errorToMessage(error));
  }
}

async function citeBibliography(): Promise<void> {
  try {
    const editor = getActiveEditor();
    if (editor.document.isUntitled) {
      throw new Error(t("error.saveCurrentTab"));
    }

    const bibName = getDefaultBibName();
    validateBibName(bibName);

    const bibPath = resolveBibPath(editor.document.uri, bibName);
    const citeKeys = await pickCiteKeys();

    insertCiteKeys(citeKeys, editor);

    const bibKeys = await getBibliographyKeyFromFile(bibPath);
    const uniqueKeys = citeKeys.filter((key) => !bibKeys.includes(key));
    if (uniqueKeys.length === 0) {
      return;
    }

    const newEntries = await getBibliography(uniqueKeys);
    try {
      await appendBibliographyEntries(bibPath, newEntries);
    } catch (error) {
      showErrorMessage(
        t("error.readBibliographyFile", {
          file: bibPath.fsPath,
          message: errorToMessage(error),
        })
      );
      return;
    }

    showStatusMessage(
      t("status.bibliographyUpdated", {
        count: uniqueKeys.length,
        file: path.basename(bibPath.fsPath),
      })
    );
  } catch (error) {
    if (error instanceof vscode.CancellationError) {
      showStatusMessage(t("status.exportCancelled"));
      return;
    }
    showErrorMessage(errorToMessage(error));
  }
}

async function addHyperLinkCitation(): Promise<void> {
  try {
    const editor = getActiveEditor();
    const clipboardContent = await vscode.env.clipboard.readText();

    if (clipboardContent === "") {
      showErrorMessage(t("error.noClipboardData"));
      return;
    }

    const key = makeId(8);
    const keyContent = `[^${key}]`;

    if (isMarkdownLikeDocument(editor.document)) {
      await insertTextAsync(keyContent, -1, editor);
      await appendMarkdownFootnoteDefinition(key, `<${clipboardContent}>`, editor);
    }
  } catch (error) {
    showErrorMessage(errorToMessage(error));
  }
}

function getBibPath(): vscode.Uri {
  const editor = getActiveEditor();
  const bibName = getDefaultBibName();
  validateBibName(bibName);
  return resolveBibPath(editor.document.uri, bibName);
}

async function updateBibEntries(): Promise<void> {
  const bibPath = getBibPath();

  try {
    const parsedData = await readBibEntriesFromFile(bibPath);
    const total = parsedData.length;

    let processedCount = 0;
    let updated = false;
    const missingKeys: string[] = [];
    const serializedEntries: string[] = [];

    const outputChannel = getOutputChannel();
    outputChannel.appendLine(t("log.updateBibEntriesHeader"));

    for (const entry of parsedData) {
      const citeKey = String(entry.citationKey);
      const result = await getBibtexFromZotero(citeKey);
      if (result === null) {
        missingKeys.push(citeKey);
        outputChannel.appendLine(t("log.notFoundBibEntry", { key: citeKey }));
        serializedEntries.push(toBibtex(entry));
        continue;
      }

      processedCount += 1;
      updated = true;
      serializedEntries.push(result);
    }

    if (updated) {
      await writeBibEntries(bibPath, serializedEntries);
    }

    if (missingKeys.length > 0) {
      outputChannel.show(true);
      const showListAction = t("action.showList");
      const copyListAction = t("action.copyList");
      const selection = await vscode.window.showInformationMessage(
        t("info.missingBibEntries", { count: missingKeys.length }),
        showListAction,
        copyListAction
      );

      if (selection === showListAction) {
        outputChannel.show(true);
      } else if (selection === copyListAction) {
        await vscode.env.clipboard.writeText(missingKeys.join("\n"));
        showInformationMessage(t("info.missingKeysCopied"));
      }
    }

    showInformationMessage(
      t("info.bibEntriesUpdated", {
        processed: processedCount,
        total,
      })
    );
  } catch (error) {
    showErrorMessage(
      t("error.updateBibtexFailed", {
        message: errorToMessage(error),
      })
    );
  }
}

async function citeSmart(): Promise<void> {
  try {
    const editor = getActiveEditor();
    const lang = editor.document.languageId;

    if (isMarkdownLikeDocument(editor.document)) {
      await citeMarkdownBibliography();
      return;
    }

    if (lang === "latex") {
      await citeBibliography();
      return;
    }

    showErrorMessage(t("error.unsupportedLanguage", { lang }));
  } catch (error) {
    showErrorMessage(errorToMessage(error));
  }
}

export function registerCommands(context: vscode.ExtensionContext): void {
  const commands: Array<{ id: string; command: () => Promise<void> | void }> = [
    {
      id: "zotero-cite.showTaskPicker",
      command: showTaskPicker,
    },
    {
      id: "zotero-cite.citeSmart",
      command: citeSmart,
    },
    {
      id: "zotero-cite.exportBibLatex",
      command: exportBibLatex,
    },
    {
      id: "zotero-cite.addCitation",
      command: addCitation,
    },
    {
      id: "zotero-cite.citeBibliography",
      command: citeBibliography,
    },
    {
      id: "zotero-cite.citeMarkdownBibliography",
      command: citeMarkdownBibliography,
    },
    {
      id: "zotero-cite.addHyperLinkCitation",
      command: addHyperLinkCitation,
    },
    {
      id: "zotero-cite.updateBibtexFromZotero",
      command: updateBibEntries,
    },
  ];

  commands.forEach((command) => {
    const disposable = vscode.commands.registerCommand(command.id, command.command);
    context.subscriptions.push(disposable);
  });
}
