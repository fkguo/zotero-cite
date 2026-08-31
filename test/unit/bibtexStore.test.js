const assert = require("assert");
const path = require("path");
const Module = require("module");

class MemoryUri {
  constructor(fsPath) {
    this.fsPath = path.resolve(fsPath);
    this.path = this.fsPath;
    this.scheme = "file";
    this.authority = "";
  }

  toString() {
    return `file://${this.fsPath}`;
  }

  static joinPath(base, ...parts) {
    return new MemoryUri(path.join(base.fsPath, ...parts));
  }
}

function createMemoryVscode() {
  const files = new Map();
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
      files.set(uri.fsPath, Buffer.from(value));
    },
    async rename(source, target) {
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
  };
}

suite("duplicate-safe BibTeX store", () => {
  test("serializes overlapping additions and writes one entry per citekey", async function () {
    this.timeout(3000);
    const { vscode, files } = createMemoryVscode();
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "vscode") {
        return vscode;
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    let ensureBibliographyEntries;
    try {
      ({ ensureBibliographyEntries } = require("../../out/bibtexStore"));
    } finally {
      Module._load = originalLoad;
    }

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
});
