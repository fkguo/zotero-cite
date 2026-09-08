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
  const writeCalls = [];
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
      writeCalls.push({ uri, value: Buffer.from(value) });
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
    writeCalls,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
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
  const broken = '@misc{Existing2026,\ntitle={Existing work}\nnote="in preparation"\nyear={2026}\n}\n';
  const target = '@phdthesis{Hauenstein:2015ibu, title={A thesis}, year={2015}}';

  for (const scheme of ["file", "overleaf-workshop", "another-virtual-provider"]) {
    test(`appends past malformed old fields and preserves their exact bytes (${scheme})`, async () => {
      const { vscode, files } = createMemoryVscode();
      const { ensureBibliographyEntries } = loadBibtexStore(vscode);
      const bibPath = new MemoryUri("/workspace/reference.bib", scheme);
      files.set(bibPath.fsPath, Buffer.from(broken));
      const result = await ensureBibliographyEntries(bibPath, ["Hauenstein:2015ibu"], async () => target);
      assert.deepStrictEqual(result.appendedKeys, ["Hauenstein:2015ibu"]);
      assert.strictEqual(result.syntaxWarnings[0].key, "Existing2026");
      assert.strictEqual(result.syntaxWarnings[0].line, 1);
      const written = files.get(bibPath.fsPath).toString("utf8");
      assert.strictEqual(written.slice(0, broken.length), broken);
      const appended = await require("../../out/bibtexParser").parseBibtex(written.slice(broken.length));
      assert.deepStrictEqual(appended.map(entry => entry.citationKey), ["Hauenstein:2015ibu"]);
    });
  }

  test("reserves the key of a malformed existing entry without fetching or overwriting it", async () => {
    const { vscode, files, writeCalls } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/reference.bib", "overleaf-workshop");
    files.set(bibPath.fsPath, Buffer.from(broken));
    const result = await ensureBibliographyEntries(bibPath, ["Existing2026"], async () => {
      assert.fail("A malformed existing entry must still reserve its citation key");
    });
    assert.deepStrictEqual(result.appendedKeys, []);
    assert.strictEqual(result.syntaxWarnings.length, 1);
    assert.strictEqual(writeCalls.length, 0);
    assert.strictEqual(files.get(bibPath.fsPath).toString("utf8"), broken);
  });

  test("uses a fresh malformed bibliography added by a collaborator during fetch", async () => {
    const { vscode, files } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/reference.bib", "overleaf-workshop");
    const original = '@article{First, title={Keep}}\n';
    files.set(bibPath.fsPath, Buffer.from(original));
    const result = await ensureBibliographyEntries(bibPath, ["Hauenstein:2015ibu"], async () => {
      files.set(bibPath.fsPath, Buffer.from(original + broken));
      return target;
    });
    assert.strictEqual(result.syntaxWarnings[0].key, "Existing2026");
    assert.ok(files.get(bibPath.fsPath).toString("utf8").startsWith(original + broken));
  });

  test("refuses malformed fetched entries and ambiguous old entry boundaries without writing", async () => {
    for (const [original, fetched] of [
      [broken, '@article{New, title={Bad} year={2026}}'],
      ['@article{Unclosed, title={Open}\n', '@article{New, title={Valid}}'],
    ]) {
      const { vscode, files, writeCalls } = createMemoryVscode();
      const { ensureBibliographyEntries } = loadBibtexStore(vscode);
      const bibPath = new MemoryUri("/workspace/reference.bib", "overleaf-workshop");
      files.set(bibPath.fsPath, Buffer.from(original));
      await assert.rejects(ensureBibliographyEntries(bibPath, ["New"], async () => fetched), /Invalid BibTeX/);
      assert.strictEqual(writeCalls.length, 0);
      assert.strictEqual(files.get(bibPath.fsPath).toString("utf8"), original);
    }
  });

  test("rejects an unparseable same-key entry added concurrently", async () => {
    const { vscode, files, writeCalls } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/reference.bib", "overleaf-workshop");
    files.set(bibPath.fsPath, Buffer.from(broken));
    const concurrent = broken + '@phdthesis{Hauenstein:2015ibu, title={Thesis} year={2015}}\n';
    await assert.rejects(ensureBibliographyEntries(bibPath, ["Hauenstein:2015ibu"], async () => {
      files.set(bibPath.fsPath, Buffer.from(concurrent));
      return target;
    }), /could not be verified/);
    assert.strictEqual(writeCalls.length, 0);
    assert.strictEqual(files.get(bibPath.fsPath).toString("utf8"), concurrent);
  });

  test("permits unique valid provider additions beside preserved malformed entries", async () => {
    const { vscode, files } = createMemoryVscode({
      transformWrite: (_uri, value) => Buffer.from('@article{Concurrent, title={Valid}}\n' + value.toString("utf8")),
    });
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/reference.bib", "overleaf-workshop");
    files.set(bibPath.fsPath, Buffer.from(broken));
    const result = await ensureBibliographyEntries(bibPath, ["Hauenstein:2015ibu"], async () => target);
    assert.deepStrictEqual(result.appendedKeys, ["Hauenstein:2015ibu"]);
    assert.ok(files.get(bibPath.fsPath).toString("utf8").includes(broken));
  });

  test("rejects provider changes to opaque old text, target entries, or malformed extra entries", async function () {
    this.timeout(5000);
    const transforms = [
      text => text.replace('in preparation', 'changed'),
      text => text.replace(broken, ''),
      text => text.replace('A thesis', 'Changed thesis'),
      text => text + '@article{Extra, title={Invalid} year={2026}}\n',
    ];
    for (const transform of transforms) {
      const { vscode, files } = createMemoryVscode({
        transformWrite: (_uri, value) => Buffer.from(transform(value.toString("utf8"))),
      });
      const { ensureBibliographyEntries } = loadBibtexStore(vscode);
      const bibPath = new MemoryUri("/workspace/reference.bib", "overleaf-workshop");
      files.set(bibPath.fsPath, Buffer.from(broken));
      await assert.rejects(ensureBibliographyEntries(bibPath, ["Hauenstein:2015ibu"], async () => target), /could not be verified/);
    }
  });

  test("keeps full-file replacement and refresh strict when entries are malformed", async () => {
    const { vscode, files, writeCalls } = createMemoryVscode();
    const { writeBibliographyText, transformBibEntriesAtomically } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/reference.bib", "overleaf-workshop");
    files.set(bibPath.fsPath, Buffer.from(broken));
    await assert.rejects(writeBibliographyText(bibPath, broken), /Invalid BibTeX/);
    await assert.rejects(transformBibEntriesAtomically(bibPath, async () => {
      assert.fail("Refreshing cannot discard malformed old content");
    }), /Invalid BibTeX/);
    assert.strictEqual(writeCalls.length, 0);
  });

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
    assert.strictEqual((content.match(/@article\{Existing2020,/g) || []).length, 1);
    assert.strictEqual((content.match(/@article\{Remote2026,/g) || []).length, 1);
    assert.strictEqual(renameCalls.length, 0);
  });

  test("preserves the fresh bibliography text exactly while appending", async function () {
    this.timeout(3000);
    const { vscode, files } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    const original = "% keep spacing  \n@article{Existing2020, title={Keep me}}\n  \n";
    files.set(bibPath.fsPath, Buffer.from(original));

    await ensureBibliographyEntries(
      bibPath,
      ["Remote2026"],
      async () => "@article{Remote2026, title={Append only}}"
    );

    const content = files.get(bibPath.fsPath).toString("utf8");
    assert.equal(content.slice(0, original.length), original);
    assert.match(content, /@article\{Remote2026,/);
    assert.match(content, /Append only/);
  });

  test("uses the fresh bibliography snapshot taken after Zotero finishes fetching", async function () {
    this.timeout(3000);
    const { vscode, files } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    const original = "@article{Existing2020, title={Keep me}}\n";
    files.set(bibPath.fsPath, Buffer.from(original));

    const fetchStarted = deferred();
    const releaseFetch = deferred();
    const operation = ensureBibliographyEntries(bibPath, ["Target2026"], async () => {
      fetchStarted.resolve();
      await releaseFetch.promise;
      return "@article{Target2026, title={Fetched target}}";
    });

    await fetchStarted.promise;
    files.set(
      bibPath.fsPath,
      Buffer.from(`${original}\n@article{Collaborator2025, title={Added remotely}}\n`)
    );
    releaseFetch.resolve();

    const result = await operation;
    assert.deepStrictEqual(result.appendedKeys, ["Target2026"]);
    const content = files.get(bibPath.fsPath).toString("utf8");
    assert.match(content, /@article\{Existing2020,/);
    assert.match(content, /@article\{Collaborator2025,/);
    assert.match(content, /@article\{Target2026,/);
  });

  test("rejects read-back that silently drops a percent comment", async function () {
    this.timeout(3000);
    const { vscode, files } = createMemoryVscode({
      transformWrite(uri, value) {
        return uri.scheme === "overleaf-workshop"
          ? Buffer.from(
              [
                "@article{Existing2020, title={Keep me}}",
                "@article{Target2026, title={Fetched target}}",
              ].join("\n\n")
            )
          : value;
      },
    });
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    files.set(
      bibPath.fsPath,
      Buffer.from("% preserve this provenance\n@article{Existing2020, title={Keep me}}\n")
    );

    await assert.rejects(
      ensureBibliographyEntries(
        bibPath,
        ["Target2026"],
        async () => "@article{Target2026, title={Fetched target}}"
      ),
      /could not be verified/
    );
  });

  test("accepts a safe read-back superset added by a collaborative provider", async function () {
    this.timeout(3000);
    const { vscode, files } = createMemoryVscode({
      transformWrite(uri, value) {
        return uri.scheme === "overleaf-workshop"
          ? Buffer.from(
              "@article{DuringWrite2026, title={Rebased by provider}}\n\n" +
                value.toString("utf8")
            )
          : value;
      },
    });
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    files.set(bibPath.fsPath, Buffer.from("@article{Existing2020, title={Keep me}}\n"));

    const result = await ensureBibliographyEntries(
      bibPath,
      ["Target2026"],
      async () => "@article{Target2026, title={Fetched target}}"
    );

    assert.deepStrictEqual(result.appendedKeys, ["Target2026"]);
    const content = files.get(bibPath.fsPath).toString("utf8");
    assert.match(content, /@article\{Existing2020,/);
    assert.match(content, /@article\{Target2026,/);
    assert.match(content, /@article\{DuringWrite2026,/);
  });

  test("keeps exact read-back verification for virtual full-file replacements", async function () {
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

  test("preserves an existing target added while Zotero is fetching", async function () {
    this.timeout(3000);
    const { vscode, files, writeCalls } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    const original = "@article{Existing2020, title={Keep me}}\n";
    files.set(bibPath.fsPath, Buffer.from(original));

    const fetchStarted = deferred();
    const releaseFetch = deferred();
    const operation = ensureBibliographyEntries(bibPath, ["Target2026"], async () => {
      fetchStarted.resolve();
      await releaseFetch.promise;
      return "@article{Target2026, title={Fetched target}}";
    });

    await fetchStarted.promise;
    const collaboratorContent = `${original}\n@article{Target2026, title={Fetched target}}\n`;
    files.set(bibPath.fsPath, Buffer.from(collaboratorContent));
    releaseFetch.resolve();

    assert.deepStrictEqual(await operation, { appendedKeys: [] });
    assert.strictEqual(writeCalls.length, 0);
    assert.strictEqual(files.get(bibPath.fsPath).toString("utf8"), collaboratorContent);
  });

  test("fails closed when a collaborator adds a conflicting target during fetch", async function () {
    this.timeout(3000);
    const { vscode, files, writeCalls } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    const original = "@article{Existing2020, title={Keep me}}\n";
    files.set(bibPath.fsPath, Buffer.from(original));

    const fetchStarted = deferred();
    const releaseFetch = deferred();
    const operation = ensureBibliographyEntries(bibPath, ["Target2026"], async () => {
      fetchStarted.resolve();
      await releaseFetch.promise;
      return "@article{Target2026, title={Fetched target}}";
    });

    await fetchStarted.promise;
    const collaboratorContent =
      `${original}\n@article{Target2026, title={Different collaborator target}}\n`;
    files.set(bibPath.fsPath, Buffer.from(collaboratorContent));
    releaseFetch.resolve();

    await assert.rejects(operation, /could not be verified/);
    assert.strictEqual(writeCalls.length, 0);
    assert.strictEqual(files.get(bibPath.fsPath).toString("utf8"), collaboratorContent);
  });

  test("does not fetch when every requested key already exists", async function () {
    this.timeout(3000);
    const { vscode, files, writeCalls } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    const original = "@article{Already2025, title={Keep me}}\n";
    files.set(bibPath.fsPath, Buffer.from(original));
    let fetchCount = 0;

    const result = await ensureBibliographyEntries(
      bibPath,
      ["Already2025"],
      async () => {
        fetchCount += 1;
        throw new Error("source unavailable");
      }
    );

    assert.deepStrictEqual(result, { appendedKeys: [] });
    assert.strictEqual(fetchCount, 0);
    assert.strictEqual(writeCalls.length, 0);
    assert.strictEqual(files.get(bibPath.fsPath).toString("utf8"), original);
  });

  test("propagates a fetch failure when the fresh bibliography still lacks the key", async function () {
    this.timeout(3000);
    const { vscode, files, writeCalls } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    const original = "@article{Existing2025, title={Keep me}}\n";
    files.set(bibPath.fsPath, Buffer.from(original));

    await assert.rejects(
      ensureBibliographyEntries(bibPath, ["Missing2026"], async () => {
        throw new Error("source unavailable");
      }),
      /source unavailable/
    );
    assert.strictEqual(writeCalls.length, 0);
    assert.strictEqual(files.get(bibPath.fsPath).toString("utf8"), original);
  });

  test("fails closed when fetch cannot verify a concurrently added target", async function () {
    this.timeout(3000);
    const { vscode, files, writeCalls } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    const original = "@article{Existing2025, title={Keep me}}\n";
    files.set(bibPath.fsPath, Buffer.from(original));

    const collaboratorContent =
      `${original}\n@article{Target2026, title={Unverified collaborator target}}\n`;
    await assert.rejects(
      ensureBibliographyEntries(bibPath, ["Target2026"], async () => {
        files.set(bibPath.fsPath, Buffer.from(collaboratorContent));
        throw new Error("source unavailable");
      }),
      /could not be verified/
    );
    assert.strictEqual(writeCalls.length, 0);
    assert.strictEqual(files.get(bibPath.fsPath).toString("utf8"), collaboratorContent);
  });

  test("adds only requested keys still absent from the fresh snapshot", async function () {
    this.timeout(3000);
    const { vscode, files, writeCalls } = createMemoryVscode();
    const { ensureBibliographyEntries } = loadBibtexStore(vscode);
    const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
    files.set(bibPath.fsPath, Buffer.from("@article{Already2025, title={Keep me}}\n"));

    const result = await ensureBibliographyEntries(
      bibPath,
      ["Already2025", "New2026", "New2026"],
      async () => "@article{New2026, title={Append me}}"
    );

    assert.deepStrictEqual(result.appendedKeys, ["New2026"]);
    assert.strictEqual(writeCalls.length, 1);
    const content = files.get(bibPath.fsPath).toString("utf8");
    assert.match(content, /@article\{Already2025, title=\{Keep me\}\}/);
    assert.strictEqual((content.match(/@article\{New2026,/g) || []).length, 1);
  });

  test("rejects a read-back that loses pre-write content or changes the target", async function () {
    this.timeout(3000);
    const cases = [
      "@article{Target2026, title={Fetched target}}\n",
      [
        "@article{Existing2020, title={Keep me}}",
        "@article{Target2026, title={Conflicting target}}",
      ].join("\n\n"),
      [
        "@article{Existing2020, title={Keep me}}",
        "@article{Target2026, title={Fetched target}}",
        "@comment{Unkeyed concurrent content}",
      ].join("\n\n"),
      [
        "@article{Existing2020, title={Keep me}}",
        "@article{Target2026, title={Fetched target}}",
        "@article{Concurrent2026, title={Duplicate one}}",
        "@article{Concurrent2026, title={Duplicate two}}",
      ].join("\n\n"),
    ];

    for (const readBack of cases) {
      const { vscode, files } = createMemoryVscode({
        transformWrite(uri, value) {
          return uri.scheme === "overleaf-workshop" ? Buffer.from(readBack) : value;
        },
      });
      const { ensureBibliographyEntries } = loadBibtexStore(vscode);
      const bibPath = new MemoryUri("/workspace/overleaf.bib", "overleaf-workshop");
      files.set(bibPath.fsPath, Buffer.from("@article{Existing2020, title={Keep me}}\n"));

      await assert.rejects(
        ensureBibliographyEntries(
          bibPath,
          ["Target2026"],
          async () => "@article{Target2026, title={Fetched target}}"
        ),
        /could not be verified/
      );
    }
  });
});
