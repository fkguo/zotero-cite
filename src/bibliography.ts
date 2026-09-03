import * as vscode from "vscode";

import { getBibtexSource } from "./config";
import {
  BibtexFailure,
  fetchInspireBibtexEntries,
  getInspireBibliography,
} from "./inspireBibtex";
import { t } from "./i18n";
import {
  getBibliographyInGroup,
  getBibtexFromZotero,
  getGroups,
  getItemGroupName,
} from "./zotero";

export type BibtexEntryFetchResult = {
  entries: Map<string, string>;
  failures: Map<string, BibtexFailure>;
};

async function getBetterBibtexBibliography(keys: string[]): Promise<string> {
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

export async function getBibliography(keys: string[]): Promise<string> {
  if (getBibtexSource() === "zotero-inspire") {
    return getInspireBibliography(keys);
  }
  return getBetterBibtexBibliography(keys);
}

export async function getBibtexEntries(keys: string[]): Promise<BibtexEntryFetchResult> {
  if (getBibtexSource() === "zotero-inspire") {
    return fetchInspireBibtexEntries(keys);
  }

  const entries = new Map<string, string>();
  const failures = new Map<string, BibtexFailure>();
  for (const key of Array.from(new Set(keys))) {
    const bibtex = await getBibtexFromZotero(key);
    if (bibtex === null) {
      failures.set(key, { code: "NOT_FOUND", message: t("error.itemNotFound", { key }) });
    } else {
      entries.set(key, bibtex);
    }
  }
  return { entries, failures };
}
