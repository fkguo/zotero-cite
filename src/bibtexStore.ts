import * as vscode from "vscode";

const bibtexParse = require("@orcid/bibtex-parse-js") as {
  toJSON: (content: string) => Array<{ citationKey: string; [key: string]: unknown }>;
  toBibtex: (entries: unknown[], compact: boolean) => string;
};

export type ParsedBibEntry = {
  citationKey: string;
  [key: string]: unknown;
};

export async function getBibliographyKeyFromFile(bibPath: vscode.Uri): Promise<string[]> {
  try {
    const fileBytes = await vscode.workspace.fs.readFile(bibPath);
    const content = Buffer.from(fileBytes).toString("utf8");
    const jsonBibs = bibtexParse.toJSON(content);
    return jsonBibs.map((entry) => String(entry.citationKey));
  } catch (_error) {
    return [];
  }
}

export async function readBibEntriesFromFile(bibPath: vscode.Uri): Promise<ParsedBibEntry[]> {
  const fileBytes = await vscode.workspace.fs.readFile(bibPath);
  const content = Buffer.from(fileBytes).toString("utf8");
  return bibtexParse.toJSON(content) as ParsedBibEntry[];
}

export function toBibtex(entry: ParsedBibEntry): string {
  return bibtexParse.toBibtex([entry], false);
}

export async function appendBibliographyEntries(bibPath: vscode.Uri, newEntries: string): Promise<void> {
  let existingContent = "";
  try {
    const fileData = await vscode.workspace.fs.readFile(bibPath);
    existingContent = Buffer.from(fileData).toString("utf-8");
  } catch (error) {
    const errorCode = (error as { code?: string }).code;
    if (errorCode !== "FileNotFound" && errorCode !== "EntryNotFound") {
      throw error;
    }
  }

  const contentToWrite =
    existingContent.trim() === ""
      ? newEntries
      : existingContent.trimEnd() + "\n\n" + newEntries.trimStart();

  await vscode.workspace.fs.writeFile(bibPath, Buffer.from(contentToWrite + "\n", "utf-8"));
}

export async function writeBibEntries(bibPath: vscode.Uri, entries: string[]): Promise<void> {
  const updatedBibtexData = entries.join("\n") + "\n";
  await vscode.workspace.fs.writeFile(bibPath, Buffer.from(updatedBibtexData, "utf8"));
}
