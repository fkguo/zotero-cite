const assert = require("assert");
const path = require("path");
const Module = require("module");

class MemoryUri {
  constructor(fsPath, scheme = "file") {
    this.fsPath = path.resolve(fsPath);
    this.path = this.fsPath;
    this.scheme = scheme;
    this.authority = "";
  }

  toString() {
    return `${this.scheme}://${this.fsPath}`;
  }

  static joinPath(base, ...parts) {
    return new MemoryUri(path.join(base.fsPath, ...parts), base.scheme);
  }
}

function createMemoryVscode(options = {}) {
  const files = new Map();
  const renameCalls = [];
  const fs = {
    async readFile(uri) {
      const value = files.get(uri.fsPath);
      if (value === undefined) {
        const error = new Error("not found");
        error.code = "FileNotFound";
        throw error;
      }
      return Buffer.from(value);
    },
    async writeFile(uri, value) {
      const writtenValue = options.transformWrite
        ? options.transformWrite(uri, Buffer.from(value))
        : Buffer.from(value);
      files.set(uri.fsPath, writtenValue);
    },
    async rename(source, target, renameOptions = {}) {
      renameCalls.push({ source, target, options: renameOptions });
      if (target.scheme !== "file" && files.has(target.fsPath) && renameOptions.overwrite) {
        throw new Error("Safe overwrite is not supported for remote rename operations");
      }
      const value = files.get(source.fsPath);
      if (value === undefined) {
        throw new Error("source not found");
      }
      files.set(target.fsPath, value);
      files.delete(source.fsPath);
    },
    async delete(uri) {
      files.delete(uri.fsPath);
    },
  };

  return {
    vscode: { Uri: MemoryUri, env: { language: "en" }, workspace: { fs } },
    files,
    renameCalls,
  };
}

function loadBibtexStore(vscode) {
  const modulePath = require.resolve("../../out/bibtexStore");
  delete require.cache[modulePath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "vscode") {
      return vscode;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

suite("duplicate-safe BibTeX store", () => {
  test("serializes overlapping additions and writes one entry per citekey", async function () {
    this.timeout(3000);
    const { vscode, files } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);

    const bibPath = new MemoryUri("/workspace/references.bib");
    let fetchCount = 0;
    const fetchBibliography = async () => {
      fetchCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return [
        "@article{Key2024, title={First copy}}",
        "@article{Key2024, title={Duplicate copy}}",
      ].join("\n\n");
    };

    const [first, second] = await Promise.all([
      ensureBibliographyEntries(bibPath, ["Key2024", "Key2024"], fetchBibliography),
      ensureBibliographyEntries(bibPath, ["Key2024"], fetchBibliography),
    ]);

    assert.strictEqual(fetchCount, 1);
    assert.deepStrictEqual(first.appendedKeys, ["Key2024"]);
    assert.deepStrictEqual(second.appendedKeys, []);

    const content = files.get(bibPath.fsPath).toString("utf8");
    assert.strictEqual((content.match(/@article\{Key2024,/g) || []).length, 1);

    const partialPath = new MemoryUri("/workspace/partial.bib");
    const original = "@article{Existing2020, title={Keep me}}\n";
    files.set(partialPath.fsPath, Buffer.from(original));
    await assert.rejects(
      ensureBibliographyEntries(
        partialPath,
        ["Missing2025"],
        async () => "@article{WrongKey2025, title={Unexpected}}"
      ),
      /Missing2025/
    );
    assert.strictEqual(files.get(partialPath.fsPath).toString("utf8"), original);
  });

  test("updates an existing bibliography through a virtual file-system provider", async function () {
    this.timeout(3000);
    const { vscode, files, renameCalls } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    files.set(bibPath.fsPath, Buffer.from("@article{Existing2020, title={Keep me}}\n"));

    const result = await ensureBibliographyEntries(
      bibPath,
      ["Remote2026"],
      async () => "@article{Remote2026, title={Written through provider}}"
    );

    assert.deepStrictEqual(result.appendedKeys, ["Remote2026"]);
    const content = files.get(bibPath.fsPath).toString("utf8");
    assert.match(content, /@article\{Existing2020,/);
    assert.match(content, /@article\{Remote2026,/);
    assert.strictEqual(renameCalls.length, 0);
  });

  test("rejects a virtual-workspace write whose read-back content differs", async function () {
    this.timeout(3000);
    const { vscode } = createMemoryVscode({
      transformWrite(uri, value) {
        return uri.scheme === "overleaf-workshop"
          ? Buffer.from(`${value.toString("utf8")}\n`)
          : value;
      },
    });
    const { writeBibliographyText } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");

    await assert.rejects(
      writeBibliographyText(bibPath, "@article{Remote2026, title={Verify me}}"),
      /could not be verified/
    );
  });
});
