import * as vscode from "vscode";

const CONFIG_SECTION = "zotero-cite";

export type BibtexSource = "better-bibtex" | "zotero-inspire";

let latestBibName: string | undefined;

function getConfiguration(resource?: vscode.Uri): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION, resource);
}

export function getStatusMessageDuration(): number {
  const duration = Number(getConfiguration().get<number>("statusMessageDuration", 1500));
  return Number.isFinite(duration) && duration > 0 ? duration : 1500;
}

export function getShowCommandPickerInStatusBar(): boolean {
  return getConfiguration().get<boolean>("showCommandPickerInStatusBar", true);
}

export function getShowMarkdownCitationHoverPreview(): boolean {
  return getConfiguration().get<boolean>("showMarkdownCitationHoverPreview", true);
}

export function getShowMarkdownCitationCompletion(): boolean {
  return getConfiguration().get<boolean>("showMarkdownCitationCompletion", true);
}

export function getBibliographyStyle(): string {
  return getConfiguration().get("bibliograpyStyle", "http://www.zotero.org/styles/apa");
}

export function getLatexBibStyle(): string {
  return getConfiguration().get("latexBibStyle", "bibtex");
}

export function getLatexCitationCommand(): string {
  const configuredValue = String(getConfiguration().get("latexCitationCommand", "cite")).trim();
  const normalized = configuredValue.replace(/^\\+/, "").trim();
  return /^[A-Za-z@]+$/.test(normalized) ? normalized : "cite";
}

export function getExcludedBibFields(): string[] {
  const defaultFields = ["file", "annotation"];
  const configuredValue = getConfiguration().get<unknown>("excludedBibFields", defaultFields);

  if (!Array.isArray(configuredValue)) {
    return defaultFields;
  }

  const normalized = configuredValue
    .map((value) => String(value).trim().toLowerCase())
    .filter((value) => value.length > 0);

  return Array.from(new Set(normalized));
}

export function getDefaultBibName(resource?: vscode.Uri): string {
  const configuredValue = String(getConfiguration(resource).get("defaultBibName", "ref.bib")).trim();
  return latestBibName || configuredValue || "ref.bib";
}

export function getExplicitBibName(resource?: vscode.Uri): string | undefined {
  if (latestBibName) {
    return latestBibName;
  }

  const configuration = getConfiguration(resource);
  const inspected = configuration.inspect<string>("defaultBibName");
  if (!inspected) {
    return undefined;
  }

  const explicitlyConfigured = [
    inspected.globalValue,
    inspected.workspaceValue,
    inspected.workspaceFolderValue,
    inspected.globalLanguageValue,
    inspected.workspaceLanguageValue,
    inspected.workspaceFolderLanguageValue,
  ].some((value) => value !== undefined);

  if (!explicitlyConfigured) {
    return undefined;
  }

  const value = String(configuration.get("defaultBibName", "")).trim();
  return value || undefined;
}

export function setLatestBibName(value: string): void {
  latestBibName = value.trim() || undefined;
}

export function resetLatestBibName(): void {
  latestBibName = undefined;
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

export function getBibtexSource(): BibtexSource {
  const source = String(getConfiguration().get("bibtexSource", "better-bibtex"));
  return source === "zotero-inspire" ? source : "better-bibtex";
}

export function getZoteroInspireBibtexUrl(): string {
  return getConfiguration().get(
    "zoteroInspireBibtexUrl",
    "http://127.0.0.1:23119/connector/zinspireBibtex"
  );
}
