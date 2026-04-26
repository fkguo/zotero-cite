import * as vscode from "vscode";

import { errorToMessage, t } from "./i18n";
import { getOutputChannel, showInformationMessage, showStatusMessage } from "./ui";
import { getBibliographyInGroup, getGroups, getItemGroupName } from "./zotero";

export async function getBibliography(keys: string[]): Promise<string> {
  const groups = await getGroups();
  const groupNames = Object.keys(groups);

  if (groupNames.length === 1) {
    return getBibliographyInGroup(keys, groups[groupNames[0]]);
  }

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t("progress.exportBibliography"),
      cancellable: true,
    },
    async (progress, token) => {
      const totalProgress = groupNames.length + keys.length;
      progress.report({ increment: 0 });

      const outputChannel = getOutputChannel();
      const groupItems: Record<string, string[]> = {};
      const allErrors: string[] = [];

      for (const itemKey of keys) {
        if (token.isCancellationRequested) {
          throw new vscode.CancellationError();
        }

        progress.report({
          increment: 0,
          message: t("progress.fetchingItemGroup", { itemKey }),
        });

        try {
          const groupName = await getItemGroupName(itemKey);
          if (!groupItems[groupName]) {
            groupItems[groupName] = [];
          }
          groupItems[groupName].push(itemKey);
        } catch (error) {
          const message = errorToMessage(error);
          outputChannel.appendLine(message);
          if (message && !message.includes("is not found")) {
            allErrors.push(message);
          }
        }

        progress.report({ increment: 100 / totalProgress });
      }

      const bibs: string[] = [];
      const groupedNames = Object.keys(groupItems);
      for (const groupName of groupedNames) {
        if (token.isCancellationRequested) {
          throw new vscode.CancellationError();
        }

        progress.report({
          increment: 0,
          message: t("progress.fetchingGroupBibliography", { groupName }),
        });

        try {
          const groupId = groups[groupName];
          const bib = await getBibliographyInGroup(groupItems[groupName], groupId);
          bibs.push(bib);
        } catch (error) {
          const message = errorToMessage(error);
          outputChannel.appendLine(
            t("error.fetchGroupBibliographyFailed", { groupName, message })
          );
          if (message && !message.includes("is not found")) {
            allErrors.push(message);
          }
        }

        progress.report({ increment: 100 / totalProgress });
      }

      if (allErrors.length > 0) {
        showInformationMessage(t("info.exportSuccessWithErrors"));
      } else {
        showStatusMessage(t("status.exportBibliographySuccess"));
      }

      return bibs.join("\n\n");
    }
  );
}
