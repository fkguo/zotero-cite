import * as vscode from "vscode";

import { t } from "./i18n";
import { getBibliographyInGroup, getGroups, getItemGroupName } from "./zotero";

export async function getBibliography(keys: string[]): Promise<string> {
  const groups = await getGroups();
  const groupNames = Object.keys(groups);

  if (groupNames.length === 0) {
    throw new Error(t("error.noZoteroGroups"));
  }

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

      const groupItems: Record<string, string[]> = {};

      for (const itemKey of keys) {
        if (token.isCancellationRequested) {
          throw new vscode.CancellationError();
        }

        progress.report({
          increment: 0,
          message: t("progress.fetchingItemGroup", { itemKey }),
        });

        const groupName = await getItemGroupName(itemKey);
        if (!groups[groupName]) {
          throw new Error(t("error.groupNotFound", { groupName, itemKey }));
        }
        if (!groupItems[groupName]) {
          groupItems[groupName] = [];
        }
        groupItems[groupName].push(itemKey);

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

        const groupId = groups[groupName];
        const bib = await getBibliographyInGroup(groupItems[groupName], groupId);
        bibs.push(bib);

        progress.report({ increment: 100 / totalProgress });
      }

      return bibs.join("\n\n");
    }
  );
}
