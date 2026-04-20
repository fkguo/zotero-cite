import axios from "axios";

import {
  getBibliographyStyle,
  getCaywUrl,
  getExcludedBibFields,
  getJsonRpcUrl,
  getLatexBibStyle,
  getMinimizeZotero,
} from "./config";
import { errorToMessage, t } from "./i18n";

const bibtexParse = require("@orcid/bibtex-parse-js") as {
  toJSON: (content: string) => Array<Record<string, unknown>>;
  toBibtex: (entries: unknown[], compact: boolean) => string;
};

type ParsedBibEntry = {
  citationKey?: string;
  entryType?: string;
  entryTags?: Record<string, unknown>;
};

type JsonRpcError = {
  message?: string;
};

type JsonRpcResponse<T> = {
  error?: JsonRpcError;
  result?: T;
};

class EndpointAccessError extends Error {}

function createEndpointAccessError(
  endpointName: string,
  endpointUrl: string,
  settingKey: string,
  error: unknown
): EndpointAccessError {
  return new EndpointAccessError(
    t("error.zoteroEndpointUnavailable", {
      endpoint: endpointName,
      url: endpointUrl,
      settingKey,
      message: errorToMessage(error),
    })
  );
}

function removeExcludedBibFields(bibText: string): string {
  if (!bibText.trim()) {
    return bibText;
  }

  const excludedFields = new Set(getExcludedBibFields());
  if (excludedFields.size === 0) {
    return bibText;
  }

  try {
    const entries = bibtexParse.toJSON(bibText) as ParsedBibEntry[];
    entries.forEach((entry) => {
      const entryTags = (entry.entryTags || {}) as Record<string, unknown>;
      Object.keys(entryTags).forEach((tagKey) => {
        if (excludedFields.has(tagKey.toLowerCase())) {
          delete entryTags[tagKey];
        }
      });
      entry.entryTags = entryTags;
    });

    const sanitized = bibtexParse.toBibtex(entries, false);
    return sanitized || bibText;
  } catch (_error) {
    // If parsing fails, keep original output to avoid blocking user workflows.
    return bibText;
  }
}

async function postJsonRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const jsonRpcUrl = getJsonRpcUrl();
  let response;

  try {
    response = await axios.post(jsonRpcUrl, {
      jsonrpc: "2.0",
      method,
      params,
    });
  } catch (error) {
    throw createEndpointAccessError("JSON-RPC", jsonRpcUrl, "zotero-cite.jsonRpcUrl", error);
  }

  const data = response.data as JsonRpcResponse<T>;
  if (data.error) {
    throw new Error(data.error.message || "Unknown Zotero error");
  }

  return data.result as T;
}

export async function pickCiteKeys(): Promise<string[]> {
  const caywUrl = getCaywUrl();
  let response;

  try {
    response = await axios({
      method: "get",
      url: caywUrl,
      params: {
        format: "pandoc",
        brackets: "1",
        minimize: getMinimizeZotero(),
      },
    });
  } catch (error) {
    throw createEndpointAccessError("CAYW", caywUrl, "zotero-cite.caywUrl", error);
  }

  const citeKeys: string[] = [];
  const pattern = /@([\w-:\d]+)/g;
  const dataText = String(response.data ?? "");

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(dataText)) !== null) {
    citeKeys.push(match[1]);
  }

  if (citeKeys.length === 0) {
    throw new Error(t("error.noItemSelected"));
  }

  return citeKeys;
}

export async function getMarkdownBibliography(citeKey: string): Promise<string> {
  const result = await postJsonRpc<string>("item.bibliography", [
    ["@" + citeKey],
    {
      id: getBibliographyStyle(),
    },
  ]);

  return result || "";
}

export async function getGroups(): Promise<Record<string, string>> {
  const result = await postJsonRpc<Array<{ id: string; name: string }>>("user.groups");

  const groups: Record<string, string> = {};
  (result || []).forEach((item) => {
    groups[item.name] = String(item.id);
  });

  return groups;
}

export async function getItemGroupName(key: string): Promise<string> {
  const result = await postJsonRpc<Array<{ "citation-key": string; library: string }>>("item.search", [key]);

  for (const item of result || []) {
    if (item["citation-key"] === key) {
      return item.library;
    }
  }

  throw new Error(t("error.itemNotFound", { key }));
}

export async function getBibliographyInGroup(keys: string[], groupId: string): Promise<string> {
  const bibText = await postJsonRpc<string>("item.export", [keys, getLatexBibStyle(), groupId]);
  return removeExcludedBibFields(String(bibText || ""));
}

export async function getBibtexFromZotero(citeKey: string): Promise<string | null> {
  try {
    const result = await postJsonRpc<string>("item.export", [[citeKey], "bibtex"]);
    return result ? removeExcludedBibFields(String(result)) : null;
  } catch (error) {
    if (error instanceof EndpointAccessError) {
      throw error;
    }

    // Keep compatibility: missing/unreachable entries are handled as null by caller.
    console.warn(errorToMessage(error));
    return null;
  }
}
