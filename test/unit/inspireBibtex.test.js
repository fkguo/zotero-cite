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
    return client;
  } finally {
    Module._load = originalLoad;
  }
}

function pingResponse(maxKeys = 20) {
  return {
    data: {
      ok: true,
      op: "ping",
      api_version: "1",
      limits: { max_citation_keys: maxKeys },
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

suite("zotero-inspire BibTeX client", () => {
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
      getInspireBibliography(["Local:2026abc"]),
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
