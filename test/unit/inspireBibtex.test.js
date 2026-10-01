const assert = require("assert");
const Module = require("module");

const VALID_TOKEN = "A".repeat(43);

function createVscode(configuration = {}) {
  return {
    env: { language: "en" },
    workspace: {
      getConfiguration() {
        return {
          get(key, fallback) {
            return Object.prototype.hasOwnProperty.call(configuration, key)
              ? configuration[key]
              : fallback;
          },
        };
      },
    },
  };
}

function loadInspireClient(axiosMock, options = {}) {
  const modules = [
    "../../out/inspireBibtex",
    "../../out/inspireSecret",
    "../../out/zotero",
    "../../out/config",
    "../../out/i18n",
    "../../out/bibliography",
  ];
  modules.forEach((request) => {
    delete require.cache[require.resolve(request)];
  });

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "axios") {
      return axiosMock;
    }
    if (request === "vscode") {
      return createVscode(options.configuration);
    }
    if (request === "./zoteroProfile") {
      return {
        discoverZoteroInspireReadTokens: async () => options.discoveredTokens || [],
      };
    }
    if (request === "./ui") {
      return {
        getOutputChannel: () => ({ appendLine: (message) => options.logs?.push(message) }),
        showInformationMessage: (message) => options.notifications?.push(message),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const client = require("../../out/inspireBibtex");
    const secrets = require("../../out/inspireSecret");
    secrets.initializeInspireSecretStorage({
      get: async () => options.token,
      store: async (_key, value) => {
        if (options.storedTokens) {
          options.storedTokens.push(value);
        }
      },
      delete: async () => undefined,
      onDidChange: () => ({ dispose: () => undefined }),
    });
    return { ...client, bibliography: require("../../out/bibliography") };
  } finally {
    Module._load = originalLoad;
  }
}

function pingResponse(maxKeys = 20, networkConcurrency = 4) {
  return {
    data: {
      ok: true,
      op: "ping",
      api_version: "1",
      limits: { max_citation_keys: maxKeys, network_concurrency: networkConcurrency },
    },
  };
}

function successResult(key, provider = "INSPIRE-HEP") {
  return {
    citation_key: key,
    status: "ok",
    source: { provider },
    bibtex: {
      text: `@article{${key},\n  title = {Example},\n  file = {private.pdf}\n}`,
    },
  };
}

function networkFailure(key, code = "INSPIRE_NETWORK_ERROR") {
  return {
    citation_key: key,
    status: "error",
    code,
    error: "INSPIRE is unreachable",
    item: { library_id: 2, zotero_item_key: "ABCD1234" },
  };
}

function fallbackAxios(results, options = {}) {
  const calls = [];
  const mock = {
    calls,
    isAxiosError: () => false,
    async post(_url, body) {
      calls.push(body);
      if (body.op === "ping") {
        return pingResponse();
      }
      if (body.op === "fetch") {
        return { data: { op: "fetch", api_version: "1", results } };
      }
      if (body.method === "item.citationkey") {
        return { data: { result: { "2:ABCD1234": options.resolvedKey || results[0].citation_key } } };
      }
      if (body.method === "item.export") {
        if (options.exportError) {
          throw options.exportError;
        }
        return {
          data: { result: options.bibtex ?? `@article{${body.params[0][0]}, title={Local}, file={private.pdf}}` },
        };
      }
      throw new Error(`unexpected method: ${body.method}`);
    },
  };
  return mock;
}

suite("zotero-inspire BibTeX client", () => {
  for (const code of ["INSPIRE_NETWORK_ERROR", "INSPIRE_TIMEOUT", "INSPIRE_NETWORK_UNAVAILABLE"]) {
    test(`falls back for ${code} using the resolved item's library and citation key`, async () => {
      const key = "Offline:2026abc";
      const axiosMock = fallbackAxios([networkFailure(key, code)]);
      const notifications = [];
      const logs = [];
      const configuration = { bibtexSource: "zotero-inspire" };
      const { bibliography } = loadInspireClient(axiosMock, {
        token: VALID_TOKEN, configuration, notifications, logs,
      });
      const bibtex = await bibliography.getBibliography([key, key]);
      assert.match(bibtex, /title = \{Local\}/);
      assert.doesNotMatch(bibtex, /file\s*=/i);
      assert.strictEqual((bibtex.match(/@article/g) || []).length, 1);
      assert.deepStrictEqual(axiosMock.calls.find((call) => call.method === "item.citationkey").params,
        [["2:ABCD1234"]]);
      assert.deepStrictEqual(axiosMock.calls.find((call) => call.method === "item.export").params,
        [[key], "bibtex", 2]);
      assert.strictEqual(configuration.bibtexSource, "zotero-inspire");
      assert.strictEqual(notifications.length, 1);
      assert.match(notifications[0], new RegExp(`${key}.*${code}`));
      assert.deepStrictEqual(logs, notifications);
    });
  }

  test("keeps online INSPIRE results and retries INSPIRE on the next request", async () => {
    const keys = ["Online:2026abc", "Offline:2026abc"];
    const results = [successResult(keys[0]), networkFailure(keys[1])];
    const axiosMock = fallbackAxios(results, { resolvedKey: keys[1] });
    const { bibliography } = loadInspireClient(axiosMock, {
      token: VALID_TOKEN, configuration: { bibtexSource: "zotero-inspire" },
    });
    const first = await bibliography.getBibliography(keys);
    assert.match(first, /title = \{Example\}/);
    assert.match(first, /title = \{Local\}/);
    assert.deepStrictEqual(axiosMock.calls.find((call) => call.method === "item.export").params[0], [keys[1]]);
    results[1] = successResult(keys[1]);
    const second = await bibliography.getBibliography(keys);
    assert.doesNotMatch(second, /Local/);
    assert.strictEqual(axiosMock.calls.filter((call) => call.method === "item.export").length, 1);
    assert.strictEqual(axiosMock.calls.filter((call) => call.op === "ping").length, 2);
  });

  test("bounds fallback-enabled batches to one advertised network wave", async () => {
    const sizes = [];
    const axiosMock = {
      isAxiosError: () => false,
      async post(_url, body) {
        if (body.op === "ping") {
          return pingResponse(20, 2);
        }
        sizes.push(body.citation_keys.length);
        return {
          data: { op: "fetch", api_version: "1", results: body.citation_keys.map((key) => successResult(key)) },
        };
      },
    };
    const { getInspireBibliography } = loadInspireClient(axiosMock, { token: VALID_TOKEN });
    await getInspireBibliography(["A:2026a", "B:2026b", "C:2026c"], { allowNetworkFallback: true });
    assert.deepStrictEqual(sizes, [2, 1]);
  });

  test("does not return a partial export when another key remains unavailable after fallback", async () => {
    const offline = "Offline:2026abc";
    const missing = "Missing:2026abc";
    const axiosMock = fallbackAxios([networkFailure(offline), networkFailure(missing, "CITATION_KEY_NOT_FOUND")]);
    const { getInspireBibliography } = loadInspireClient(axiosMock, { token: VALID_TOKEN });
    await assert.rejects(getInspireBibliography([offline, missing], { allowNetworkFallback: true }),
      /Missing:2026abc: CITATION_KEY_NOT_FOUND/);
    assert.strictEqual(axiosMock.calls.filter((call) => call.method === "item.export").length, 1);
  });

  test("leaves unavailable entries for the existing-bibliography update to preserve", async () => {
    const key = "Offline:2026abc";
    const axiosMock = fallbackAxios([networkFailure(key)]);
    const { bibliography } = loadInspireClient(axiosMock, {
      token: VALID_TOKEN, configuration: { bibtexSource: "zotero-inspire" },
    });
    const fetched = await bibliography.getBibtexEntries([key]);
    assert.strictEqual(fetched.entries.size, 0);
    assert.strictEqual(fetched.failures.get(key).code, "INSPIRE_NETWORK_ERROR");
    assert.strictEqual(axiosMock.calls.filter((call) => call.method).length, 0);
  });

  for (const code of ["CITATION_KEY_AMBIGUOUS", "CITATION_KEY_NOT_FOUND", "INSPIRE_HTTP_ERROR",
    "INSPIRE_RATE_LIMITED", "INVALID_BIBTEX", "INTERNAL_ERROR"]) {
    test(`does not mask ${code} with automatic fallback`, async () => {
      const key = "Failed:2026abc";
      const axiosMock = fallbackAxios([networkFailure(key, code)]);
      const { bibliography } = loadInspireClient(axiosMock, {
        token: VALID_TOKEN, configuration: { bibtexSource: "zotero-inspire" },
      });
      await assert.rejects(bibliography.getBibliography([key]), new RegExp(code));
      assert.strictEqual(axiosMock.calls.filter((call) => call.method).length, 0);
    });
  }

  test("requires a resolved item identity before attempting network fallback", async () => {
    const key = "Offline:2026abc";
    const failure = networkFailure(key);
    delete failure.item;
    const axiosMock = fallbackAxios([failure]);
    const { bibliography } = loadInspireClient(axiosMock, {
      token: VALID_TOKEN, configuration: { bibtexSource: "zotero-inspire" },
    });
    await assert.rejects(bibliography.getBibliography([key]), /INSPIRE_NETWORK_ERROR/);
    assert.strictEqual(axiosMock.calls.filter((call) => call.method).length, 0);
  });

  test("rejects fallback if the resolved Zotero item's citation key changed", async () => {
    const key = "Offline:2026abc";
    const axiosMock = fallbackAxios([networkFailure(key)], { resolvedKey: "Changed:2026abc" });
    const { fetchInspireBibtexEntries } = loadInspireClient(axiosMock, { token: VALID_TOKEN });
    const fetched = await fetchInspireBibtexEntries([key], { allowNetworkFallback: true });
    assert.strictEqual(fetched.entries.size, 0);
    assert.match(fetched.failures.get(key).message, /no longer has that citation key/);
    assert.strictEqual(axiosMock.calls.filter((call) => call.method === "item.export").length, 0);
  });

  for (const bibtex of ["", "@article{Wrong, title={Wrong}}",
    "@article{Offline:2026abc, title={First}}\n@article{Offline:2026abc, title={Second}}",
    "@article{Offline:2026abc, title={unclosed}"]) {
    test(`rejects invalid fallback output: ${bibtex.slice(0, 35)}`, async () => {
      const key = "Offline:2026abc";
      const axiosMock = fallbackAxios([networkFailure(key)], { bibtex });
      const { getInspireBibliography } = loadInspireClient(axiosMock, { token: VALID_TOKEN });
      await assert.rejects(getInspireBibliography([key], { allowNetworkFallback: true }),
        /BETTER_BIBTEX_FALLBACK_FAILED/);
    });
  }

  test("preserves the INSPIRE error when the local Better BibTeX export fails", async () => {
    const key = "Offline:2026abc";
    const axiosMock = fallbackAxios([networkFailure(key)], { exportError: new Error("duplicates found") });
    const { fetchInspireBibtexEntries } = loadInspireClient(axiosMock, { token: VALID_TOKEN });
    const fetched = await fetchInspireBibtexEntries([key], { allowNetworkFallback: true });
    assert.strictEqual(fetched.entries.size, 0);
    assert.strictEqual(fetched.fallbacks.size, 0);
    assert.match(fetched.failures.get(key).message, /INSPIRE_NETWORK_ERROR.*duplicates found/);
  });

  test("does not fall back when local endpoint authentication fails", async () => {
    const calls = [];
    const axiosMock = {
      isAxiosError: () => true,
      async post(_url, body) {
        calls.push(body);
        const error = new Error("rejected");
        error.response = { status: 403, data: { code: "FORBIDDEN" } };
        throw error;
      },
    };
    const { bibliography } = loadInspireClient(axiosMock, {
      token: VALID_TOKEN, configuration: { bibtexSource: "zotero-inspire" },
    });
    await assert.rejects(bibliography.getBibliography(["Offline:2026abc"]), /rejected every read token/);
    assert.strictEqual(calls.filter((call) => call.method).length, 0);
  });

  test("probes API v1, authenticates, and accepts INSPIRE-only entries", async () => {
    const calls = [];
    const axiosMock = { isAxiosError: () => false };
    axiosMock.post = async (url, body, options) => {
      calls.push({ url, body, options });
      if (body.op === "ping") {
        return pingResponse();
      }
      return {
        data: {
          op: "fetch",
          api_version: "1",
          results: body.citation_keys.map((key) => successResult(key)),
        },
      };
    };

    const { getInspireBibliography } = loadInspireClient(axiosMock, { token: VALID_TOKEN });
    const result = await getInspireBibliography(["Smith:2026abc"]);

    assert.match(result, /@article\{Smith:2026abc,/);
    assert.doesNotMatch(result, /file\s*=/i);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].url, "http://127.0.0.1:23119/connector/zinspireBibtex");
    assert.strictEqual(calls[0].options.headers["x-zinspire-read-token"], VALID_TOKEN);
    assert.strictEqual(calls[0].options.headers["zotero-allowed-request"], "true");
  });

  test("automatically discovers and caches the Zotero profile token", async () => {
    const storedTokens = [];
    const calls = [];
    const axiosMock = { isAxiosError: () => false };
    axiosMock.post = async (_url, body, options) => {
      calls.push({ body, options });
      if (body.op === "ping") {
        return pingResponse();
      }
      return {
        data: {
          op: "fetch",
          api_version: "1",
          results: body.citation_keys.map((key) => successResult(key)),
        },
      };
    };

    const { getInspireBibliography } = loadInspireClient(axiosMock, {
      discoveredTokens: [VALID_TOKEN],
      storedTokens,
    });
    await getInspireBibliography(["Auto:2026abc"]);

    assert.strictEqual(calls[0].options.headers["x-zinspire-read-token"], VALID_TOKEN);
    assert.deepStrictEqual(storedTokens, [VALID_TOKEN]);
  });

  test("rejects a Better BibTeX fallback when zotero-inspire is selected", async () => {
    const axiosMock = { isAxiosError: () => false };
    axiosMock.post = async (_url, body) => {
      if (body.op === "ping") {
        return pingResponse();
      }
      return {
        data: {
          op: "fetch",
          api_version: "1",
          results: [successResult(body.citation_keys[0], "Better BibTeX")],
        },
      };
    };

    const { fetchInspireBibtexEntries, getInspireBibliography } = loadInspireClient(axiosMock, {
      token: VALID_TOKEN,
    });
    const fetched = await fetchInspireBibtexEntries(["Local:2026abc"]);
    assert.strictEqual(fetched.entries.size, 0);
    assert.strictEqual(fetched.failures.get("Local:2026abc").code, "NON_INSPIRE_PROVIDER_REJECTED");
    await assert.rejects(
      getInspireBibliography(["Local:2026abc"], { allowNetworkFallback: true }),
      /NON_INSPIRE_PROVIDER_REJECTED/
    );
  });

  test("preserves per-item failures without accepting partial bibliography output", async () => {
    const axiosMock = { isAxiosError: () => false };
    axiosMock.post = async (_url, body) => {
      if (body.op === "ping") {
        return pingResponse();
      }
      return {
        data: {
          op: "fetch",
          api_version: "1",
          results: [
            successResult(body.citation_keys[0]),
            {
              citation_key: body.citation_keys[1],
              status: "error",
              code: "CITATION_KEY_NOT_FOUND",
              error: "not found",
            },
          ],
        },
      };
    };

    const { fetchInspireBibtexEntries, getInspireBibliography } = loadInspireClient(axiosMock, {
      token: VALID_TOKEN,
    });
    const keys = ["Found:2026abc", "Missing:2026abc"];
    const fetched = await fetchInspireBibtexEntries(keys);
    assert.strictEqual(fetched.entries.has(keys[0]), true);
    assert.strictEqual(fetched.failures.get(keys[1]).code, "CITATION_KEY_NOT_FOUND");
    await assert.rejects(getInspireBibliography(keys), /Missing:2026abc: CITATION_KEY_NOT_FOUND/);
  });

  test("uses the advertised request limit to split large batches", async () => {
    const fetchSizes = [];
    const axiosMock = { isAxiosError: () => false };
    axiosMock.post = async (_url, body) => {
      if (body.op === "ping") {
        return pingResponse(2);
      }
      fetchSizes.push(body.citation_keys.length);
      return {
        data: {
          op: "fetch",
          api_version: "1",
          results: body.citation_keys.map((key) => successResult(key)),
        },
      };
    };

    const { fetchInspireBibtexEntries } = loadInspireClient(axiosMock, { token: VALID_TOKEN });
    const fetched = await fetchInspireBibtexEntries(["A:2026a", "B:2026b", "C:2026c"]);
    assert.deepStrictEqual(fetchSizes, [2, 1]);
    assert.strictEqual(fetched.entries.size, 3);
  });

  test("fails before network access when no local token exists or endpoint is invalid", async () => {
    let calls = 0;
    const axiosMock = {
      isAxiosError: () => false,
      post: async () => {
        calls += 1;
        return pingResponse();
      },
    };

    const missingTokenClient = loadInspireClient(axiosMock, { token: undefined });
    await assert.rejects(
      missingTokenClient.fetchInspireBibtexEntries(["A:2026a"]),
      /could not find the zotero-inspire read token/
    );

    const remoteEndpointClient = loadInspireClient(axiosMock, {
      token: VALID_TOKEN,
      configuration: {
        zoteroInspireBibtexUrl: "https://example.com/connector/zinspireBibtex",
      },
    });
    await assert.rejects(
      remoteEndpointClient.fetchInspireBibtexEntries(["A:2026a"]),
      /must use HTTP loopback/
    );
    assert.strictEqual(calls, 0);
  });
});
