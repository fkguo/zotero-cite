import * as vscode from "vscode";

const CONFIG_SECTION = "zotero-cite";

let latestBibName = "";

function getConfiguration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

export function getStatusMessageDuration(): number {
  const duration = Number(getConfiguration().get<number>("statusMessageDuration", 1500));
  return Number.isFinite(duration) && duration > 0 ? duration : 1500;
}

export function getBibliographyStyle(): string {
  return getConfiguration().get("bibliograpyStyle", "http://www.zotero.org/styles/apa");
}

export function getLatexBibStyle(): string {
  return getConfiguration().get("latexBibStyle", "bibtex");
}

export function getDefaultBibName(): string {
  if (latestBibName === "") {
    latestBibName = getConfiguration().get("defaultBibName", "ref.bib");
  }
  return latestBibName;
}

export function setLatestBibName(value: string): void {
  latestBibName = value;
}

export function getMinimizeZotero(): string {
  return getConfiguration().get("minimizeZotero", "");
}

export function getJsonRpcUrl(): string {
  return getConfiguration().get("jsonRpcUrl", "http://localhost:23119/better-bibtex/json-rpc");
}

export function getCaywUrl(): string {
  return getConfiguration().get("caywUrl", "http://localhost:23119/better-bibtex/cayw");
}
