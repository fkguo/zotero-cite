import * as vscode from "vscode";

import { getStatusMessageDuration } from "./config";

const outputChannel = vscode.window.createOutputChannel("Zotero Cite");

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

export function disposeUiResources(): void {
  outputChannel.dispose();
}
