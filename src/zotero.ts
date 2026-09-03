import axios from "axios";

import { parseBibtex, ParsedBibEntry, serializeBibtex } from "./bibtexParser";
import { uniqueCiteKeys } from "./citeKeys";
import {
  getBibliographyStyle,
  getCaywUrl,
  getExcludedBibFields,
  getJsonRpcUrl,
  getLatexBibStyle,
  getMinimizeZotero,
} from "./config";
import { errorToMessage, t } from "./i18n";

type JsonRpcError = {
  message?: string;
};

type JsonRpcResponse<T> = {
  error?: JsonRpcError;
  result?: T;
};

type ZoteroLibraryId = string | number;

class EndpointAccessError extends Error {}

const HTTP_TIMEOUT_MS = 15_000;
const CAYW_SELECTION_TIMEOUT_MS = 5 * 60_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

function validateEndpointUrl(endpointUrl: string, settingKey: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch (_error) {
    throw new Error(t("error.invalidEndpointUrl", { settingKey, url: endpointUrl }));
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new Error(t("error.invalidEndpointUrl", { settingKey, url: endpointUrl }));
  }

  return parsed.toString();
}

function getHttpRequestOptions(timeout = HTTP_TIMEOUT_MS): Record<string, unknown> {
  return {
    timeout,
    maxContentLength: MAX_RESPONSE_BYTES,
    maxBodyLength: MAX_RESPONSE_BYTES,
    maxRedirects: 0,
  };
}

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

export async function sanitizeBibtexFields(bibText: string): Promise<string> {
  if (!bibText.trim()) {
    return bibText;
  }

  const excludedFields = new Set(getExcludedBibFields());
  if (excludedFields.size === 0) {
    return bibText;
  }

  const entries = await parseBibtex(bibText);
  entries.forEach((entry: ParsedBibEntry) => {
    const entryTags = (entry.entryTags || {}) as Record<string, unknown>;
    Object.keys(entryTags).forEach((tagKey) => {
      if (excludedFields.has(tagKey.toLowerCase())) {
        delete entryTags[tagKey];
      }
    });
    entry.entryTags = entryTags;
  });

  const sanitized = serializeBibtex(entries);
  return sanitized || bibText;
}

async function postJsonRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const configuredUrl = getJsonRpcUrl();
  const jsonRpcUrl = validateEndpointUrl(configuredUrl, "zotero-cite.jsonRpcUrl");
  let response;

  try {
    response = await axios.post(
      jsonRpcUrl,
      {
        jsonrpc: "2.0",
        method,
        params,
      },
      getHttpRequestOptions()
    );
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
  const configuredUrl = getCaywUrl();
  const caywUrl = validateEndpointUrl(configuredUrl, "zotero-cite.caywUrl");
  let response;

  // Better BibTeX keeps the CAYW request open while its interactive picker is
  // visible. Probe the service separately so endpoint failures stay fast while
  // users get enough time to find and select an item.
  try {
    await axios({
      method: "get",
      url: caywUrl,
      params: { probe: "1" },
      ...getHttpRequestOptions(),
    });
  } catch (error) {
    throw createEndpointAccessError("CAYW", caywUrl, "zotero-cite.caywUrl", error);
  }

  try {
    response = await axios({
      method: "get",
      url: caywUrl,
      params: {
        format: "pandoc",
        brackets: "1",
        minimize: getMinimizeZotero(),
      },
      ...getHttpRequestOptions(CAYW_SELECTION_TIMEOUT_MS),
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
      throw new Error(
        t("error.caywSelectionTimeout", {
          minutes: CAYW_SELECTION_TIMEOUT_MS / 60_000,
        })
      );
    }
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

  return uniqueCiteKeys(citeKeys);
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

export async function getGroups(): Promise<Record<string, ZoteroLibraryId>> {
  const result = await postJsonRpc<Array<{ id: ZoteroLibraryId; name: string }>>("user.groups");

  const groups: Record<string, ZoteroLibraryId> = {};
  (result || []).forEach((item) => {
    if (Object.prototype.hasOwnProperty.call(groups, item.name) && groups[item.name] !== item.id) {
      throw new Error(t("error.duplicateZoteroGroupName", { groupName: item.name }));
    }
    groups[item.name] = item.id;
  });

  return groups;
}

export async function getItemGroupName(key: string): Promise<string> {
  // Better BibTeX 9 on Zotero 8 currently fails its plain-string quick-search
  // path because it adds the removed `blockStart` search condition. The
  // structured citation-key condition is both exact and supported by current
  // and older JSON-RPC implementations.
  const result = await postJsonRpc<
    Array<{ "citation-key"?: string; citekey?: string; library: string }>
  >("item.search", [[["citationKey", "is", key]], "*"]);

  for (const item of result || []) {
    if ((item.citekey || item["citation-key"]) === key) {
      return item.library;
    }
  }

  throw new Error(t("error.itemNotFound", { key }));
}

export async function getBibliographyInGroup(
  keys: string[],
  groupId: ZoteroLibraryId
): Promise<string> {
  const bibText = await postJsonRpc<string>("item.export", [keys, getLatexBibStyle(), groupId]);
  return sanitizeBibtexFields(String(bibText || ""));
}

export async function getBibtexFromZotero(citeKey: string): Promise<string | null> {
  try {
    const result = await postJsonRpc<string>("item.export", [[citeKey], "bibtex"]);
    return result ? await sanitizeBibtexFields(String(result)) : null;
  } catch (error) {
    if (error instanceof EndpointAccessError) {
      throw error;
    }

    // Keep compatibility: missing/unreachable entries are handled as null by caller.
    console.warn(errorToMessage(error));
    return null;
  }
}
