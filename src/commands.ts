import * as path from "path";
import * as vscode from "vscode";

import {
  ensureBibliographyEntries,
  toBibtex,
  transformBibEntriesAtomically,
  writeBibliographyText,
} from "./bibtexStore";
import { resolveBibPath, validateBibName } from "./bibPath";
import { getBibliography } from "./bibliography";
import { uniqueCiteKeys } from "./citeKeys";
import { getDefaultBibName, setLatestBibName } from "./config";
import {
  getActiveEditor,
  getDocumentCiteKeys,
  insertCiteKeys,
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

    const bibPath = resolveBibPath(currentFileUri, bibName);
    const keys = getDocumentCiteKeys(editor);
    const uniqueKeys = uniqueCiteKeys(keys);

    if (uniqueKeys.length === 0) {
      throw new Error(t("error.noKeyDetected"));
    }

    const bibliography = await getBibliography(uniqueKeys);
    await writeBibliographyText(bibPath, bibliography);
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

function getMarkdownFootnoteDefinitionKeys(editor: vscode.TextEditor): Set<string> {
  const keys = new Set<string>();
  const pattern = /^\s*\[\^([^\]\r\n]+)\]:/gm;
  const text = editor.document.getText();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    keys.add(match[1].trim());
  }
  return keys;
}

async function insertMarkdownCitationAndDefinitions(
  citeKeys: string[],
  definitions: Array<{ key: string; content: string }>,
  editor: vscode.TextEditor
): Promise<void> {
  const citation = "[^" + citeKeys.join("][^") + "]";
  if (definitions.length === 0) {
    await insertTextAsync(citation, -1, editor);
    return;
  }

  const documentText = editor.document.getText();
  const documentEnd = editor.document.positionAt(documentText.length);
  const cursor = editor.selection.active;
  const eol = getDocumentEol(editor);
  const definitionText = definitions
    .map(({ key, content }) => `[^${key}]: ${normalizeLineEndings(String(content || "").trim(), eol)}`)
    .join(eol);
  const needsLeadingEol = documentText.length > 0 && !/\r?\n$/.test(documentText);
  const suffix = `${needsLeadingEol ? eol : ""}${definitionText}${eol}`;

  const applied = await editor.edit((editBuilder) => {
    if (cursor.isEqual(documentEnd)) {
      editBuilder.insert(cursor, `${citation}${eol}${definitionText}${eol}`);
      return;
    }

    editBuilder.insert(cursor, citation);
    editBuilder.insert(documentEnd, suffix);
  });

  if (!applied) {
    throw new Error(t("error.editorRejectedEdit"));
  }
}

async function citeMarkdownBibliography(): Promise<void> {
  try {
    const editor = getActiveEditor();
    const existingDefinitions = getMarkdownFootnoteDefinitionKeys(editor);
    const citeKeys = uniqueCiteKeys(await pickCiteKeys());
    const definitions: Array<{ key: string; content: string }> = [];
    for (const key of citeKeys) {
      if (!existingDefinitions.has(key)) {
        const content = await getMarkdownBibliography(key);
        if (!content.trim()) {
          throw new Error(t("error.noResultFromZotero"));
        }
        definitions.push({ key, content });
      }
    }

    await insertMarkdownCitationAndDefinitions(citeKeys, definitions, editor);
  } catch (error) {
    showErrorMessage(errorToMessage(error));
  }
}

async function addCitation(): Promise<void> {
  try {
    const editor = getActiveEditor();
    const citeKeys = uniqueCiteKeys(await pickCiteKeys());
    await insertCiteKeys(citeKeys, editor);
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
    const citeKeys = uniqueCiteKeys(await pickCiteKeys());
    const result = await ensureBibliographyEntries(bibPath, citeKeys, getBibliography);

    // Do not leave a document citation behind unless its bibliography update succeeded.
    await insertCiteKeys(citeKeys, editor);

    if (result.appendedKeys.length > 0) {
      showStatusMessage(
        t("status.bibliographyUpdated", {
          count: result.appendedKeys.length,
          file: path.basename(bibPath.fsPath),
        })
      );
    }
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
  try {
    const bibPath = getBibPath();
    const outputChannel = getOutputChannel();
    outputChannel.appendLine(t("log.updateBibEntriesHeader"));

    const updateResult = await transformBibEntriesAtomically(bibPath, async (parsedData) => {
      let processedCount = 0;
      const missingKeys: string[] = [];
      const serializedEntries: string[] = [];

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
        serializedEntries.push(result);
      }

      return {
        serializedEntries: processedCount > 0 ? serializedEntries : undefined,
        value: {
          total: parsedData.length,
          processedCount,
          missingKeys,
        },
      };
    });

    const { total, processedCount, missingKeys } = updateResult;

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
