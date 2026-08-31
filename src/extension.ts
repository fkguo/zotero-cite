import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { resetLatestBibName } from "./config";
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
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("zotero-cite.defaultBibName")) {
        resetLatestBibName();
      }
    })
  );
}

export function deactivate(): void {
  disposeUiResources();
}
