import * as vscode from "vscode";

const INSPIRE_READ_TOKEN_SECRET = "zotero-cite.zoteroInspireReadToken";
const READ_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

let secretStorage: vscode.SecretStorage | undefined;

export function initializeInspireSecretStorage(storage: vscode.SecretStorage): void {
  secretStorage = storage;
}

export function disposeInspireSecretStorage(): void {
  secretStorage = undefined;
}

export function isValidInspireReadToken(value: string): boolean {
  return READ_TOKEN_PATTERN.test(value);
}

export async function getInspireReadToken(): Promise<string | undefined> {
  return secretStorage?.get(INSPIRE_READ_TOKEN_SECRET);
}

export async function storeInspireReadToken(value: string): Promise<void> {
  if (!secretStorage) {
    return;
  }
  if (!isValidInspireReadToken(value)) {
    throw new Error("Invalid Zotero Inspire read token");
  }
  await secretStorage.store(INSPIRE_READ_TOKEN_SECRET, value);
}
