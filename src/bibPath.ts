import * as path from "path";
import * as vscode from "vscode";

import { t } from "./i18n";

export function isValidBibName(bibName: string): boolean {
  return bibName.length >= 5 && path.extname(bibName).toLowerCase() === ".bib";
}

export function validateBibName(bibName: string): void {
  if (!isValidBibName(bibName)) {
    const value = bibName.replace(/\s+/g, " ").slice(0, 120) || "<empty>";
    throw new Error(t("error.invalidBibName", { value }));
  }
}

export function applyBibTemplateVariables(
  template: string,
  filePath: string,
  workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath || ""
): string {
  const replacements: Record<string, string> = {
    "${workspaceFolder}": workspaceFolder,
    "${fileBasename}": path.basename(filePath),
    "${fileBasenameNoExtension}": path.parse(filePath).name,
    "${fileDirname}": path.dirname(filePath),
    "${fileExtname}": path.extname(filePath),
  };

  let result = template;
  Object.keys(replacements).forEach((key) => {
    result = result.split(key).join(replacements[key]);
  });

  return result;
}

export function resolveBibPath(currentFileUri: vscode.Uri, bibNameTemplate: string): vscode.Uri {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(currentFileUri);
  if (!workspaceFolder && bibNameTemplate.includes("${workspaceFolder}")) {
    throw new Error(t("error.noWorkspaceFolder"));
  }

  const replaced = applyBibTemplateVariables(
    bibNameTemplate,
    currentFileUri.fsPath,
    workspaceFolder?.uri.fsPath || ""
  );

  if (/\$\{[^}]+\}/.test(replaced)) {
    throw new Error(t("error.invalidBibName"));
  }

  let resolved: vscode.Uri;
  if (path.isAbsolute(replaced)) {
    const localFileUri = vscode.Uri.file(replaced);
    if (currentFileUri.scheme === "file") {
      resolved = localFileUri;
    } else {
      resolved = currentFileUri.with({
        path: localFileUri.path,
      });
    }
  } else {
    resolved = vscode.Uri.joinPath(currentFileUri, "..", replaced);
  }

  if (workspaceFolder && !isUriWithin(workspaceFolder.uri, resolved)) {
    throw new Error(t("error.bibPathOutsideWorkspace", { path: resolved.fsPath }));
  }

  return resolved;
}

export function isUriWithin(parent: vscode.Uri, child: vscode.Uri): boolean {
  if (parent.scheme !== child.scheme || parent.authority !== child.authority) {
    return false;
  }

  const relative = path.relative(parent.path, child.path);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
