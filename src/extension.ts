import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { t } from "./i18n";
import { disposeUiResources, initializeUi } from "./ui";

export function activate(context: vscode.ExtensionContext): void {
  console.log(t("activate.message"));
  registerCommands(context);
  initializeUi(context);
}

export function deactivate(): void {
  disposeUiResources();
}
