import { randomBytes } from "crypto";
import * as path from "path";
import * as vscode from "vscode";

import { parseBibtex, parseBibtexForAppend, ParsedBibEntry, serializeBibtex } from "./bibtexParser";
import type { BibtexSyntaxWarning } from "./bibtexAppend";
import { getMissingCiteKeys, uniqueCiteKeys } from "./citeKeys";
import { t } from "./i18n";

const fileLocks = new Map<string, Promise<void>>();

export type EnsureBibliographyResult = {
  appendedKeys: string[];
  syntaxWarnings?: BibtexSyntaxWarning[];
};

function appendResult(appendedKeys: string[], syntaxWarnings: BibtexSyntaxWarning[]): EnsureBibliographyResult {
  return syntaxWarnings.length > 0 ? { appendedKeys, syntaxWarnings } : { appendedKeys };
}

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

function canonicalizeBibValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeBibValue);
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = canonicalizeBibValue((value as Record<string, unknown>)[key]);
    }
    return result;
  }

  return value;
}

function getEntryFingerprint(entry: ParsedBibEntry): string {
  return JSON.stringify(canonicalizeBibValue(entry));
}

function getFingerprintCounts(entries: ParsedBibEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const fingerprint = getEntryFingerprint(entry);
    counts.set(fingerprint, (counts.get(fingerprint) || 0) + 1);
  }
  return counts;
}

function getKeyedEntryFingerprints(entries: ParsedBibEntry[]): Map<string, string[]> {
  const keyedEntries = new Map<string, string[]>();
  for (const entry of entries) {
    const key = getEntryKey(entry);
    if (!key) {
      continue;
    }
    const fingerprints = keyedEntries.get(key) || [];
    fingerprints.push(getEntryFingerprint(entry));
    keyedEntries.set(key, fingerprints);
  }
  return keyedEntries;
}

function isOrderedSubsequence(expected: string, actual: string): boolean {
  let expectedIndex = 0;
  for (let actualIndex = 0; actualIndex < actual.length && expectedIndex < expected.length; actualIndex += 1) {
    if (actual[actualIndex] === expected[expectedIndex]) {
      expectedIndex += 1;
    }
  }
  return expectedIndex === expected.length;
}

function isSafeSemanticSuperset(
  expectedEntries: ParsedBibEntry[],
  writtenEntries: ParsedBibEntry[]
): boolean {
  const remainingExpected = getFingerprintCounts(expectedEntries);
  const expectedKeys = new Set(expectedEntries.map(getEntryKey).filter((key) => key.length > 0));
  const additionalKeys = new Set<string>();

  for (const entry of writtenEntries) {
    const fingerprint = getEntryFingerprint(entry);
    const remainingCount = remainingExpected.get(fingerprint) || 0;
    if (remainingCount > 0) {
      remainingExpected.set(fingerprint, remainingCount - 1);
      continue;
    }

    const key = getEntryKey(entry);
    if (!key || entry.unparsedBibtex !== undefined || expectedKeys.has(key) || additionalKeys.has(key)) {
      return false;
    }
    additionalKeys.add(key);
  }

  return (
    additionalKeys.size > 0 &&
    Array.from(remainingExpected.values()).every((remainingCount) => remainingCount === 0)
  );
}

async function verifyBibTextWrite(
  bibPath: vscode.Uri,
  expectedContent: string,
  appendMode = false,
  allowSemanticSuperset = false
): Promise<void> {
  const writtenBytes = await vscode.workspace.fs.readFile(bibPath);
  const writtenContent = Buffer.from(writtenBytes).toString("utf8");
  const writtenEntries = appendMode
    ? (await parseBibtexForAppend(writtenContent)).entries
    : await parseBibtex(writtenContent);

  if (writtenContent === expectedContent) {
    return;
  }

  const expectedEntries = allowSemanticSuperset
    ? (await parseBibtexForAppend(expectedContent)).entries
    : [];
  if (
    !allowSemanticSuperset ||
    !isOrderedSubsequence(expectedContent, writtenContent) ||
    !isSafeSemanticSuperset(expectedEntries, writtenEntries)
  ) {
    throw new Error(t("error.bibliographyWriteVerificationFailed", { file: bibPath.path }));
  }
}

async function atomicWriteLocalBibText(bibPath: vscode.Uri, content: string, appendMode: boolean): Promise<void> {
  const tempName = `.${path.basename(bibPath.path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const tempPath = vscode.Uri.joinPath(bibPath, "..", tempName);

  try {
    await vscode.workspace.fs.writeFile(tempPath, Buffer.from(content, "utf8"));

    await verifyBibTextWrite(tempPath, content, appendMode);

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

async function writeBibTextSafely(
  bibPath: vscode.Uri,
  content: string,
  appendMode = false
): Promise<void> {
  if (appendMode) {
    await parseBibtexForAppend(content);
  } else {
    await parseBibtex(content);
  }

  if (bibPath.scheme === "file") {
    await atomicWriteLocalBibText(bibPath, content, appendMode);
    return;
  }

  // Virtual file-system providers do not necessarily support atomic overwrite
  // through rename. Write through the provider's native update path and verify
  // the committed content before reporting success.
  await vscode.workspace.fs.writeFile(bibPath, Buffer.from(content, "utf8"));
  await verifyBibTextWrite(bibPath, content, appendMode, appendMode);
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
    const existing = await parseBibtexForAppend(existingContent);
    const existingKeys = existing.entries.map(getEntryKey).filter((key) => key.length > 0);
    const missingKeys = getMissingCiteKeys(existingKeys, requestedKeys);

    if (missingKeys.length === 0) {
      return appendResult([], existing.syntaxWarnings);
    }

    let fetchedText = "";
    let fetchError: unknown;
    try {
      fetchedText = await fetchBibliography(missingKeys);
    } catch (error) {
      // A source failure may concern a key which a collaborator added while
      // the request was in flight. Recheck the file before surfacing it.
      fetchError = error;
    }
    const fetchedEntries = fetchedText.trim() ? await parseBibtex(fetchedText) : [];
    const requestedSet = new Set(missingKeys);
    const fetchedByKey = new Map<string, ParsedBibEntry>();

    for (const entry of fetchedEntries) {
      const key = getEntryKey(entry);
      if (key && requestedSet.has(key) && !fetchedByKey.has(key)) {
        fetchedByKey.set(key, entry);
      }
    }

    // Fetching may take long enough for a collaborator to update the file. Base
    // the full-file write on this fresh snapshot rather than the initial read.
    const latestContent = (await readBibTextIfExists(bibPath)) || "";
    const latest = await parseBibtexForAppend(latestContent);
    const latestByKey = getKeyedEntryFingerprints(latest.entries);
    const appendedKeys: string[] = [];
    for (const key of uniqueCiteKeys(missingKeys)) {
      const latestFingerprints = latestByKey.get(key) || [];
      if (latestFingerprints.length === 0) {
        appendedKeys.push(key);
        continue;
      }

      const fetchedEntry = fetchedByKey.get(key);
      if (
        !fetchedEntry ||
        latestFingerprints.length !== 1 ||
        latestFingerprints[0] !== getEntryFingerprint(fetchedEntry)
      ) {
        throw new Error(t("error.bibliographyWriteVerificationFailed", { file: bibPath.path }));
      }
    }

    if (appendedKeys.length === 0) {
      return appendResult([], latest.syntaxWarnings);
    }

    if (fetchError !== undefined) {
      throw fetchError;
    }

    const absentKeys = appendedKeys.filter((key) => !fetchedByKey.has(key));
    if (absentKeys.length > 0) {
      if (!fetchedText.trim()) {
        throw new Error(t("error.emptyBibliographyFromZotero"));
      }
      throw new Error(t("error.missingBibliographyEntries", { keys: absentKeys.join(", ") }));
    }

    const newText = appendedKeys
      .map((key) => {
        const entry = fetchedByKey.get(key);
        if (!entry) {
          throw new Error(t("error.missingBibliographyEntries", { keys: key }));
        }
        return serializeBibtex([entry]).trim();
      })
      .join("\n\n");
    const separator = latestContent.length === 0
      ? ""
      : latestContent.endsWith("\n\n")
        ? ""
        : latestContent.endsWith("\n")
          ? "\n"
          : "\n\n";
    // Preserve the fresh remote text as an exact prefix. Collaborative
    // providers can then authorize this as insertion-only; trailing comments,
    // whitespace, and line endings are never normalized away.
    const combined = `${latestContent}${separator}${newText}\n`;

    // Read-back must retain the exact pre-write text sequence and every parsed
    // entry. Only unique, non-overlapping citekeys added by the provider are safe.
    await writeBibTextSafely(bibPath, combined, true);
    return appendResult(appendedKeys, latest.syntaxWarnings);
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
