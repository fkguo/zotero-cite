import axios from "axios";

import { getZoteroInspireBibtexUrl } from "./config";
import { parseBibtex } from "./bibtexParser";
import { sanitizeBibtexFields } from "./zotero";
import { getInspireReadToken, isValidInspireReadToken } from "./inspireSecret";
import { storeInspireReadToken } from "./inspireSecret";
import { errorToMessage, t } from "./i18n";
import { discoverZoteroInspireReadTokens } from "./zoteroProfile";

const API_VERSION = "1";
const DEFAULT_MAX_KEYS = 20;
const HTTP_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const ENDPOINT_PATH = "/connector/zinspireBibtex";

type JsonObject = Record<string, unknown>;

export type BibtexFailure = {
  code: string;
  message: string;
};

export type InspireBibtexEntries = {
  entries: Map<string, string>;
  failures: Map<string, BibtexFailure>;
};

type InspireConnection = {
  url: string;
  token: string;
  maxKeys: number;
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateEndpointUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (_error) {
    throw new Error(t("error.invalidEndpointUrl", {
      settingKey: "zotero-cite.zoteroInspireBibtexUrl",
      url: value,
    }));
  }

  const loopbackHosts = new Set(["127.0.0.1", "[::1]"]);
  if (
    url.protocol !== "http:" ||
    !loopbackHosts.has(url.hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== ENDPOINT_PATH ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(t("error.invalidInspireEndpointUrl", { url: value }));
  }

  return url.toString();
}

function requestOptions(token: string): Record<string, unknown> {
  return {
    timeout: HTTP_TIMEOUT_MS,
    maxContentLength: MAX_RESPONSE_BYTES,
    maxBodyLength: MAX_RESPONSE_BYTES,
    maxRedirects: 0,
    headers: {
      "content-type": "application/json",
      "x-zinspire-read-token": token,
      "zotero-allowed-request": "true",
    },
  };
}

function responseErrorCode(error: unknown): string | undefined {
  if (!axios.isAxiosError(error) || !isJsonObject(error.response?.data)) {
    return undefined;
  }
  const code = error.response.data.code;
  return typeof code === "string" ? code : undefined;
}

function endpointError(error: unknown): Error {
  const code = responseErrorCode(error);
  if (code === "FORBIDDEN") {
    return new Error(t("error.inspireTokenRejected"));
  }
  if (code === "TOKEN_UNAVAILABLE") {
    return new Error(t("error.inspireTokenUnavailable"));
  }
  if (axios.isAxiosError(error) && error.response?.status === 404) {
    return new Error(t("error.inspireEndpointMissing"));
  }
  return new Error(t("error.inspireEndpointUnavailable", { message: errorToMessage(error) }));
}

function assertApiVersion(data: unknown): asserts data is JsonObject {
  if (!isJsonObject(data) || data.api_version !== API_VERSION) {
    throw new Error(t("error.unsupportedInspireApiVersion", {
      version: isJsonObject(data) ? String(data.api_version ?? "missing") : "missing",
    }));
  }
}

async function connect(): Promise<InspireConnection> {
  const url = validateEndpointUrl(getZoteroInspireBibtexUrl());
  const storedToken = await getInspireReadToken();
  const candidates = storedToken && isValidInspireReadToken(storedToken) ? [storedToken] : [];
  const discoveredTokens = await discoverZoteroInspireReadTokens();
  for (const token of discoveredTokens) {
    if (isValidInspireReadToken(token) && !candidates.includes(token)) {
      candidates.push(token);
    }
  }
  if (candidates.length === 0) {
    throw new Error(t("error.inspireTokenAutoDiscoveryFailed"));
  }

  for (const token of candidates) {
    let response;
    try {
      response = await axios.post(url, { op: "ping" }, requestOptions(token));
    } catch (error) {
      if (responseErrorCode(error) === "FORBIDDEN") {
        continue;
      }
      throw endpointError(error);
    }

    assertApiVersion(response.data);
    if (response.data.ok !== true || response.data.op !== "ping") {
      throw new Error(t("error.invalidInspireApiResponse"));
    }

    const limits = isJsonObject(response.data.limits) ? response.data.limits : {};
    const advertisedMaxKeys = Number(limits.max_citation_keys);
    const maxKeys = Number.isInteger(advertisedMaxKeys) && advertisedMaxKeys > 0
      ? Math.min(advertisedMaxKeys, DEFAULT_MAX_KEYS)
      : DEFAULT_MAX_KEYS;

    if (token !== storedToken) {
      try {
        await storeInspireReadToken(token);
      } catch (_error) {
        // Authentication already succeeded; a keychain cache failure must not block the request.
      }
    }
    return { url, token, maxKeys };
  }

  throw new Error(t("error.inspireTokenRejected"));
}

async function validateSuccessfulResult(
  requestedKey: string,
  result: JsonObject
): Promise<string | BibtexFailure> {
  const source = isJsonObject(result.source) ? result.source : {};
  if (source.provider !== "INSPIRE-HEP") {
    return {
      code: "NON_INSPIRE_PROVIDER_REJECTED",
      message: t("error.inspireFallbackRejected", { key: requestedKey }),
    };
  }

  const bibtex = isJsonObject(result.bibtex) ? result.bibtex : {};
  if (typeof bibtex.text !== "string" || bibtex.text.trim() === "") {
    return { code: "INVALID_RESPONSE", message: t("error.invalidInspireApiResponse") };
  }

  const sanitized = await sanitizeBibtexFields(bibtex.text);
  const parsed = await parseBibtex(sanitized);
  if (parsed.length !== 1 || String(parsed[0].citationKey) !== requestedKey) {
    return { code: "ENTRY_KEY_MISMATCH", message: t("error.inspireEntryKeyMismatch", { key: requestedKey }) };
  }

  return sanitized;
}

async function fetchChunk(
  connection: InspireConnection,
  keys: string[]
): Promise<InspireBibtexEntries> {
  let response;
  try {
    response = await axios.post(
      connection.url,
      { op: "fetch", citation_keys: keys },
      requestOptions(connection.token)
    );
  } catch (error) {
    throw endpointError(error);
  }

  assertApiVersion(response.data);
  if (response.data.op !== "fetch" || !Array.isArray(response.data.results)) {
    throw new Error(t("error.invalidInspireApiResponse"));
  }
  if (response.data.results.length !== keys.length) {
    throw new Error(t("error.invalidInspireApiResponse"));
  }

  const entries = new Map<string, string>();
  const failures = new Map<string, BibtexFailure>();
  for (let index = 0; index < keys.length; index += 1) {
    const requestedKey = keys[index];
    const result = response.data.results[index];
    if (!isJsonObject(result) || result.citation_key !== requestedKey) {
      throw new Error(t("error.invalidInspireApiResponse"));
    }

    if (result.status === "ok") {
      const validated = await validateSuccessfulResult(requestedKey, result);
      if (typeof validated === "string") {
        entries.set(requestedKey, validated);
      } else {
        failures.set(requestedKey, validated);
      }
      continue;
    }

    if (result.status !== "error") {
      throw new Error(t("error.invalidInspireApiResponse"));
    }
    failures.set(requestedKey, {
      code: typeof result.code === "string" ? result.code : "UNKNOWN_ERROR",
      message: typeof result.error === "string" ? result.error : t("error.invalidInspireApiResponse"),
    });
  }

  return { entries, failures };
}

export async function fetchInspireBibtexEntries(keys: string[]): Promise<InspireBibtexEntries> {
  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0) {
    return { entries: new Map(), failures: new Map() };
  }

  const connection = await connect();
  const combined: InspireBibtexEntries = { entries: new Map(), failures: new Map() };
  for (let offset = 0; offset < uniqueKeys.length; offset += connection.maxKeys) {
    const chunk = uniqueKeys.slice(offset, offset + connection.maxKeys);
    const result = await fetchChunk(connection, chunk);
    result.entries.forEach((value, key) => combined.entries.set(key, value));
    result.failures.forEach((value, key) => combined.failures.set(key, value));
  }
  return combined;
}

export async function getInspireBibliography(keys: string[]): Promise<string> {
  const result = await fetchInspireBibtexEntries(keys);
  if (result.failures.size > 0) {
    const details = Array.from(result.failures.entries())
      .map(([key, failure]) => `${key}: ${failure.code}`)
      .join(", ");
    throw new Error(t("error.inspireBibtexFailed", { details }));
  }

  return keys.map((key) => result.entries.get(key) || "").filter(Boolean).join("\n\n");
}
