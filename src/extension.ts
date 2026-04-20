import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { registerMarkdownCitationPreview } from "./hoverPreview";
import { t } from "./i18n";
import { disposeUiResources, initializeUi } from "./ui";

export function activate(context: vscode.ExtensionContext): void {
  console.log(t("activate.message"));
  registerCommands(context);
  registerMarkdownCitationPreview(context);
  initializeUi(context);
}

export function deactivate(): void {
  disposeUiResources();
}
