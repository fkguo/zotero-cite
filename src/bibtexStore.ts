import { randomBytes } from "crypto";
import * as path from "path";
import * as vscode from "vscode";

import { parseBibtex, ParsedBibEntry, serializeBibtex } from "./bibtexParser";
import { getMissingCiteKeys, uniqueCiteKeys } from "./citeKeys";
import { t } from "./i18n";

const fileLocks = new Map<string, Promise<void>>();

export type EnsureBibliographyResult = {
  appendedKeys: string[];
};

export type BibEntryTransformResult<T> = {
  serializedEntries?: string[];
  value: T;
};

function isFileNotFound(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === "FileNotFound" || code === "EntryNotFound";
}

async function readBibTextIfExists(bibPath: vscode.Uri): Promise<string | undefined> {
  try {
    const fileBytes = await vscode.workspace.fs.readFile(bibPath);
    return Buffer.from(fileBytes).toString("utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

async function withBibFileLock<T>(bibPath: vscode.Uri, operation: () => Promise<T>): Promise<T> {
  const lockKey = bibPath.toString();
  const previous = fileLocks.get(lockKey) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  fileLocks.set(lockKey, tail);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (fileLocks.get(lockKey) === tail) {
      fileLocks.delete(lockKey);
    }
  }
}

async function verifyBibTextWrite(bibPath: vscode.Uri, expectedContent: string): Promise<void> {
  const writtenBytes = await vscode.workspace.fs.readFile(bibPath);
  const writtenContent = Buffer.from(writtenBytes).toString("utf8");
  await parseBibtex(writtenContent);

  if (writtenContent !== expectedContent) {
    throw new Error(t("error.bibliographyWriteVerificationFailed", { file: bibPath.path }));
  }
}

async function atomicWriteLocalBibText(bibPath: vscode.Uri, content: string): Promise<void> {
  const tempName = `.${path.basename(bibPath.path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const tempPath = vscode.Uri.joinPath(bibPath, "..", tempName);

  try {
    await vscode.workspace.fs.writeFile(tempPath, Buffer.from(content, "utf8"));

    await verifyBibTextWrite(tempPath, content);

    await vscode.workspace.fs.rename(tempPath, bibPath, { overwrite: true });
  } catch (error) {
    try {
      await vscode.workspace.fs.delete(tempPath);
    } catch (_cleanupError) {
      // The temp file may not have been created, or rename may have consumed it.
    }
    throw error;
  }
}

async function writeBibTextSafely(bibPath: vscode.Uri, content: string): Promise<void> {
  await parseBibtex(content);

  if (bibPath.scheme === "file") {
    await atomicWriteLocalBibText(bibPath, content);
    return;
  }

  // Virtual file-system providers do not necessarily support atomic overwrite
  // through rename. Write through the provider's native update path and verify
  // the committed content before reporting success.
  await vscode.workspace.fs.writeFile(bibPath, Buffer.from(content, "utf8"));
  await verifyBibTextWrite(bibPath, content);
}

function getEntryKey(entry: ParsedBibEntry): string {
  return String(entry.citationKey || "").trim();
}

export async function getBibliographyKeyFromFile(bibPath: vscode.Uri): Promise<string[]> {
  const content = await readBibTextIfExists(bibPath);
  if (content === undefined || content.trim() === "") {
    return [];
  }

  const entries = await parseBibtex(content);
  return entries.map(getEntryKey).filter((key) => key.length > 0);
}

export async function readBibEntriesFromFile(bibPath: vscode.Uri): Promise<ParsedBibEntry[]> {
  const fileBytes = await vscode.workspace.fs.readFile(bibPath);
  return parseBibtex(Buffer.from(fileBytes).toString("utf8"));
}

export function toBibtex(entry: ParsedBibEntry): string {
  return serializeBibtex([entry]);
}

/**
 * Append requested entries exactly once. The read/check/fetch/write sequence is
 * serialized per bibliography path so overlapping commands cannot both append
 * a key observed missing from the same stale file snapshot.
 */
export async function ensureBibliographyEntries(
  bibPath: vscode.Uri,
  requestedKeys: string[],
  fetchBibliography: (missingKeys: string[]) => Promise<string>
): Promise<EnsureBibliographyResult> {
  return withBibFileLock(bibPath, async () => {
    const existingContent = (await readBibTextIfExists(bibPath)) || "";
    const existingEntries = existingContent.trim() ? await parseBibtex(existingContent) : [];
    const existingKeys = existingEntries.map(getEntryKey).filter((key) => key.length > 0);
    const missingKeys = getMissingCiteKeys(existingKeys, requestedKeys);

    if (missingKeys.length === 0) {
      return { appendedKeys: [] };
    }

    const fetchedText = await fetchBibliography(missingKeys);
    if (!fetchedText.trim()) {
      throw new Error(t("error.emptyBibliographyFromZotero"));
    }

    const fetchedEntries = await parseBibtex(fetchedText);
    const requested = new Set(missingKeys);
    const fetchedByKey = new Map<string, ParsedBibEntry>();

    for (const entry of fetchedEntries) {
      const key = getEntryKey(entry);
      if (key && requested.has(key) && !fetchedByKey.has(key)) {
        fetchedByKey.set(key, entry);
      }
    }

    const absentKeys = missingKeys.filter((key) => !fetchedByKey.has(key));
    if (absentKeys.length > 0) {
      throw new Error(t("error.missingBibliographyEntries", { keys: absentKeys.join(", ") }));
    }

    const appendedKeys = uniqueCiteKeys(missingKeys);
    const newText = appendedKeys
      .map((key) => {
        const entry = fetchedByKey.get(key);
        if (!entry) {
          throw new Error(t("error.missingBibliographyEntries", { keys: key }));
        }
        return serializeBibtex([entry]).trim();
      })
      .join("\n\n");
    const combined = existingContent.trim()
      ? `${existingContent.trimEnd()}\n\n${newText}\n`
      : `${newText}\n`;

    await writeBibTextSafely(bibPath, combined);
    return { appendedKeys };
  });
}

export async function writeBibliographyText(bibPath: vscode.Uri, content: string): Promise<void> {
  await withBibFileLock(bibPath, async () => {
    await writeBibTextSafely(bibPath, `${content.trim()}\n`);
  });
}

export async function transformBibEntriesAtomically<T>(
  bibPath: vscode.Uri,
  transform: (entries: ParsedBibEntry[]) => Promise<BibEntryTransformResult<T>>
): Promise<T> {
  return withBibFileLock(bibPath, async () => {
    const fileBytes = await vscode.workspace.fs.readFile(bibPath);
    const entries = await parseBibtex(Buffer.from(fileBytes).toString("utf8"));
    const result = await transform(entries);
    if (result.serializedEntries) {
      await writeBibTextSafely(bibPath, `${result.serializedEntries.join("\n").trim()}\n`);
    }
    return result.value;
  });
}
