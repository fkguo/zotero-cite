import * as vscode from "vscode";

import { getShowCommandPickerInStatusBar, getStatusMessageDuration } from "./config";
import { t } from "./i18n";

const outputChannel = vscode.window.createOutputChannel("Zotero Cite");
const taskPickerStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1100);

export function getOutputChannel(): vscode.OutputChannel {
  return outputChannel;
}

export function showStatusMessage(message: string): void {
  vscode.window.setStatusBarMessage(message, getStatusMessageDuration());
}

export function showErrorMessage(message: string): void {
  void vscode.window.showErrorMessage(message);
}

export function showInformationMessage(message: string): void {
  void vscode.window.showInformationMessage(message);
}

function updateTaskPickerStatusBarItem(): void {
  if (!getShowCommandPickerInStatusBar()) {
    taskPickerStatusBarItem.hide();
    return;
  }

  if (!vscode.window.activeTextEditor) {
    taskPickerStatusBarItem.hide();
    return;
  }

  taskPickerStatusBarItem.text = t("statusBar.taskPickerText");
  taskPickerStatusBarItem.tooltip = t("statusBar.taskPickerTooltip");
  taskPickerStatusBarItem.command = "zotero-cite.showTaskPicker";
  taskPickerStatusBarItem.show();
}

export function initializeUi(context: vscode.ExtensionContext): void {
  updateTaskPickerStatusBarItem();

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateTaskPickerStatusBarItem();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("zotero-cite.showCommandPickerInStatusBar")) {
        updateTaskPickerStatusBarItem();
      }
    })
  );
}

export function disposeUiResources(): void {
  outputChannel.dispose();
  taskPickerStatusBarItem.dispose();
}
