import * as path from "path";
import * as vscode from "vscode";

import { t } from "./i18n";

export function validateBibName(bibName: string): void {
  if (bibName.length < 5 || path.extname(bibName) !== ".bib") {
    throw new Error(t("error.invalidBibName"));
  }
}

export function applyBibTemplateVariables(template: string, filePath: string): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
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
  const replaced = applyBibTemplateVariables(bibNameTemplate, currentFileUri.fsPath);

  if (path.isAbsolute(replaced)) {
    const localFileUri = vscode.Uri.file(replaced);
    if (currentFileUri.scheme === "file") {
      return localFileUri;
    }

    return currentFileUri.with({
      path: localFileUri.path,
    });
  }

  return vscode.Uri.joinPath(currentFileUri, "..", replaced);
}
