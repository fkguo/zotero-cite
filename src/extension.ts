import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { registerMarkdownCitationPreview } from "./hoverPreview";
import { t } from "./i18n";
import { registerMarkdownCitationCompletion } from "./markdownCompletion";
import { disposeUiResources, initializeUi } from "./ui";

export function activate(context: vscode.ExtensionContext): void {
  console.log(t("activate.message"));
  registerCommands(context);
  registerMarkdownCitationPreview(context);
  registerMarkdownCitationCompletion(context);
  initializeUi(context);
}

export function deactivate(): void {
  disposeUiResources();
}
