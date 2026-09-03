const assert = require("assert");
const Module = require("module");

function createVscode() {
  return {
    env: { language: "en" },
    workspace: {
      getConfiguration() {
        return {
          get(key, fallback) {
            return fallback;
          },
        };
      },
    },
  };
}

function loadZotero(axiosMock) {
  const modules = ["../../out/zotero", "../../out/config", "../../out/i18n"];
  modules.forEach((request) => {
    delete require.cache[require.resolve(request)];
  });

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "axios") {
      return axiosMock;
    }
    if (request === "vscode") {
      return createVscode();
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require("../../out/zotero");
  } finally {
    Module._load = originalLoad;
  }
}

suite("Zotero requests", () => {
  test("uses a short probe and a separate interactive selection timeout", async () => {
    const calls = [];
    const axiosMock = async (options) => {
      calls.push(options);
      return options.params.probe ? { data: "ready" } : { data: "[@Selected2026]" };
    };
    axiosMock.post = async () => ({ data: { result: null } });
    axiosMock.isAxiosError = () => false;
    const { pickCiteKeys } = loadZotero(axiosMock);

    const keys = await pickCiteKeys();

    assert.deepStrictEqual(keys, ["Selected2026"]);
    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(calls[0].params, { probe: "1" });
    assert.strictEqual(calls[0].timeout, 15_000);
    assert.strictEqual(calls[1].params.format, "pandoc");
    assert.strictEqual(calls[1].timeout, 300_000);
  });

  test("reports an interactive selection timeout separately from endpoint access", async () => {
    let callCount = 0;
    const axiosMock = async () => {
      callCount += 1;
      if (callCount === 1) {
        return { data: "ready" };
      }
      const error = new Error("timeout of 300000ms exceeded");
      error.code = "ECONNABORTED";
      throw error;
    };
    axiosMock.post = async () => ({ data: { result: null } });
    axiosMock.isAxiosError = (error) => error && error.code === "ECONNABORTED";
    const { pickCiteKeys } = loadZotero(axiosMock);

    await assert.rejects(pickCiteKeys(), /did not finish within 5 minutes/);
  });

  test("uses a structured cross-library citation-key search", async () => {
    const axiosMock = async () => ({ data: "ready" });
    axiosMock.post = async (_url, payload) => {
      assert.strictEqual(payload.method, "item.search");
      assert.deepStrictEqual(payload.params, [[["citationKey", "is", "Selected2026"]], "*"]);
      return {
        data: {
          result: [
            {
              "citation-key": "Selected2026",
              citekey: "Selected2026",
              library: "My Library",
            },
          ],
        },
      };
    };
    axiosMock.isAxiosError = () => false;
    const { getItemGroupName } = loadZotero(axiosMock);

    assert.strictEqual(await getItemGroupName("Selected2026"), "My Library");
  });

  test("preserves numeric library IDs when exporting bibliography entries", async () => {
    const requests = [];
    const axiosMock = async () => ({ data: "ready" });
    axiosMock.post = async (_url, payload) => {
      requests.push(payload);
      if (payload.method === "user.groups") {
        return {
          data: {
            result: [
              { id: 1, name: "My Library" },
              { id: 2, name: "HadronPhysics" },
            ],
          },
        };
      }
      if (payload.method === "item.export") {
        return { data: { result: "" } };
      }
      throw new Error(`unexpected method ${payload.method}`);
    };
    axiosMock.isAxiosError = () => false;
    const { getBibliographyInGroup, getGroups } = loadZotero(axiosMock);

    const groups = await getGroups();
    assert.strictEqual(groups["My Library"], 1);
    assert.strictEqual(groups.HadronPhysics, 2);

    await getBibliographyInGroup(["Selected2026"], groups["My Library"]);
    const exportRequest = requests.find((request) => request.method === "item.export");
    assert.strictEqual(exportRequest.params[2], 1);
  });
});
