const assert = require("assert");
const path = require("path");
const Module = require("module");

class MemoryUri {
  constructor(scheme, uriPath, authority = "", query = "") {
    this.scheme = scheme;
    this.path = path.posix.resolve(uriPath);
    this.fsPath = this.path;
    this.authority = authority;
    this.query = query;
  }

  toString() {
    const query = this.query ? `?${this.query}` : "";
    return `${this.scheme}://${this.authority}${this.path}${query}`;
  }

  with(changes) {
    return new MemoryUri(
      changes.scheme ?? this.scheme,
      changes.path ?? this.path,
      changes.authority ?? this.authority,
      changes.query ?? this.query
    );
  }

  static file(filePath) {
    return new MemoryUri("file", filePath);
  }

  static joinPath(base, ...parts) {
    return new MemoryUri(
      base.scheme,
      path.posix.join(base.path, ...parts),
      base.authority,
      base.query
    );
  }
}

class RelativePattern {
  constructor(base, pattern) {
    this.base = base;
    this.pattern = pattern;
  }
}

function createDocument(uri, content, languageId = "latex") {
  return {
    uri,
    isUntitled: false,
    languageId,
    getText: () => content,
  };
}

function createMemoryVscode({
  document,
  files = new Map(),
  directories = new Map(),
  explicitBibName,
  quickPickIndex = 0,
  findFiles = async () => [],
}) {
  const calls = { reads: [], directories: [], searches: [], picks: [], writes: [] };
  const workspaceUri = new MemoryUri(document.uri.scheme, "/project", document.uri.authority, document.uri.query);
  const workspaceFolder = { name: "project", index: 0, uri: workspaceUri };
  const configuration = {
    get(key, fallback) {
      if (key === "defaultBibName") {
        return explicitBibName ?? fallback;
      }
      return fallback;
    },
    inspect(key) {
      if (key !== "defaultBibName") {
        return undefined;
      }
      return explicitBibName === undefined
        ? { key: "zotero-cite.defaultBibName", defaultValue: "ref.bib" }
        : { key: "zotero-cite.defaultBibName", defaultValue: "ref.bib", workspaceValue: explicitBibName };
    },
  };

  return {
    calls,
    Uri: MemoryUri,
    RelativePattern,
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    env: { language: "en" },
    workspace: {
      textDocuments: [document],
      fs: {
        async readFile(uri) {
          calls.reads.push(uri.toString());
          const value = files.get(uri.toString());
          if (value === undefined) {
            const error = new Error("not found");
            error.code = "FileNotFound";
            throw error;
          }
          return Buffer.from(value);
        },
        async readDirectory(uri) {
          calls.directories.push(uri.toString());
          const entries = directories.get(uri.toString());
          if (!entries) {
            const error = new Error("not found");
            error.code = "FileNotFound";
            throw error;
          }
          return entries;
        },
        async writeFile(uri) {
          calls.writes.push(uri.toString());
          throw new Error("Resolution must never write");
        },
      },
      getConfiguration: () => configuration,
      getWorkspaceFolder(uri) {
        const relative = path.posix.relative(workspaceUri.path, uri.path);
        return uri.scheme !== workspaceUri.scheme || uri.authority !== workspaceUri.authority ||
          uri.query !== workspaceUri.query || relative.startsWith("..") ? undefined : workspaceFolder;
      },
      findFiles: (...args) => {
        calls.searches.push(args);
        return findFiles(...args);
      },
      asRelativePath: (uri) => path.posix.relative(workspaceUri.path, uri.path),
    },
    window: {
      showQuickPick: async (items) => {
        calls.picks.push(items);
        return items[quickPickIndex];
      },
    },
  };
}

async function withinDeadline(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Bibliography resolution stalled")), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function unavailableFileSearch() {
  return new Promise(() => {
    // VS Code waits for a search provider that is never registered.
  });
}

function loadResolver(vscode) {
  const modules = [
    "../../out/bibliographyResolver",
    "../../out/bibPath",
    "../../out/config",
    "../../out/i18n",
  ];
  modules.forEach((request) => {
    delete require.cache[require.resolve(request)];
  });

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "vscode") {
      return vscode;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require("../../out/bibliographyResolver");
  } finally {
    Module._load = originalLoad;
  }
}

suite("bibliography path resolution", () => {
  test("gives an explicit manual setting priority over LaTeX discovery", async () => {
    const uri = new MemoryUri("overleaf-workshop", "/project/main.tex", "example.test", "project=123");
    const document = createDocument(uri, "\\documentclass{article}\\bibliography{automatic}");
    const vscode = createMemoryVscode({ document, explicitBibName: "manual.bib" });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);

    const resolved = await resolveDocumentBibliographyPath(document, { promptOnMultiple: true });
    assert.strictEqual(resolved.toString(), "overleaf-workshop://example.test/project/manual.bib?project=123");
  });

  test("preserves a virtual URI while following a TeX root directive", async () => {
    const childUri = new MemoryUri(
      "overleaf-workshop",
      "/project/chapters/chapter.tex",
      "example.test",
      "user=7&project=123"
    );
    const rootUri = new MemoryUri(
      "overleaf-workshop",
      "/project/main.tex",
      "example.test",
      "user=7&project=123"
    );
    const document = createDocument(childUri, "% !TeX root = ../main.tex\n\\section{Chapter}");
    const files = new Map([
      [
        rootUri.toString(),
        "\\documentclass{article}\n\\input{chapters/chapter}\n\\addbibresource{refs/library.bib}",
      ],
    ]);
    const vscode = createMemoryVscode({ document, files });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);

    const resolved = await resolveDocumentBibliographyPath(document, { promptOnMultiple: true });
    assert.strictEqual(
      resolved.toString(),
      "overleaf-workshop://example.test/project/refs/library.bib?user=7&project=123"
    );
  });

  test("prompts for multiple declared bibliographies and never silently picks one", async () => {
    const uri = new MemoryUri("file", "/project/main.tex");
    const document = createDocument(uri, "\\documentclass{article}\n\\bibliography{one,two}");
    const vscode = createMemoryVscode({ document, quickPickIndex: 1 });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);

    const unresolved = await resolveDocumentBibliographyPath(document);
    assert.strictEqual(unresolved, undefined);

    const selected = await resolveDocumentBibliographyPath(document, { promptOnMultiple: true });
    assert.strictEqual(selected.toString(), "file:///project/two.bib");

    const cached = await resolveDocumentBibliographyPath(document);
    assert.strictEqual(cached.toString(), "file:///project/two.bib");
  });

  test("does not follow a TeX root directive outside the current workspace", async () => {
    const uri = new MemoryUri("file", "/project/chapter.tex");
    const document = createDocument(
      uri,
      "% !TeX root = ../outside.tex\n\\bibliography{inside}"
    );
    const outsideUri = new MemoryUri("file", "/outside.tex");
    const files = new Map([
      [outsideUri.toString(), "\\documentclass{article}\n\\bibliography{outside}"],
    ]);
    const vscode = createMemoryVscode({ document, files });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);

    const resolved = await resolveDocumentBibliographyPath(document, { promptOnMultiple: true });
    assert.strictEqual(resolved.toString(), "file:///project/inside.bib");
  });

  test("uses the active bibliography file directly", async () => {
    const uri = new MemoryUri("file", "/project/current.bib");
    const document = createDocument(uri, "@article{Key}", "bibtex");
    const vscode = createMemoryVscode({ document, explicitBibName: "manual.bib" });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);

    const resolved = await resolveDocumentBibliographyPath(document, { promptOnMultiple: true });
    assert.strictEqual(resolved.toString(), uri.toString());
  });

  test("treats an explicitly empty setting as automatic mode with a safe fallback", async () => {
    const uri = new MemoryUri("file", "/project/main.tex");
    const document = createDocument(uri, "\\documentclass{article}");
    const vscode = createMemoryVscode({ document, explicitBibName: "" });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);

    const resolved = await resolveDocumentBibliographyPath(document, { promptOnMultiple: true });
    assert.strictEqual(resolved.toString(), "file:///project/ref.bib");
  });

  test("finds the only existing bibliography in a virtual workspace when declarations are absent", async () => {
    const uri = new MemoryUri(
      "overleaf-workshop",
      "/project/main.tex",
      "example.test",
      "user=7&project=123"
    );
    const document = createDocument(uri, "\\documentclass{article}");
    const workspaceUri = new MemoryUri(
      "overleaf-workshop",
      "/project",
      "example.test",
      "user=7&project=123"
    );
    const directories = new Map([
      [workspaceUri.toString(), [["refs.bib", 1], ["sections", 2]]],
      [
        new MemoryUri(
          "overleaf-workshop",
          "/project/sections",
          "example.test",
          "user=7&project=123"
        ).toString(),
        [["part.tex", 1]],
      ],
    ]);
    const vscode = createMemoryVscode({ document, directories, explicitBibName: "" });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);

    const resolved = await resolveDocumentBibliographyPath(document, { promptOnMultiple: true });
    assert.strictEqual(
      resolved.toString(),
      "overleaf-workshop://example.test/project/refs.bib?user=7&project=123"
    );
  });

  test("ignores a malformed automatic candidate when a valid bibliography is also declared", async () => {
    const uri = new MemoryUri(
      "overleaf-workshop",
      "/project/main.tex",
      "example.test",
      "user=7&project=123"
    );
    const document = createDocument(
      uri,
      "\\documentclass{article}\n\\addbibresource{notes.txt}\n\\bibliography{refs}"
    );
    const vscode = createMemoryVscode({ document, explicitBibName: "" });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);

    const resolved = await resolveDocumentBibliographyPath(document, { promptOnMultiple: true });
    assert.strictEqual(
      resolved.toString(),
      "overleaf-workshop://example.test/project/refs.bib?user=7&project=123"
    );
  });
});

suite("bibliography discovery without a file search provider", () => {
  for (const scheme of ["overleaf-workshop", "memory-project"]) {
    test(`resolves a ${scheme} chapter while findFiles would never settle`, async () => {
      const root = new MemoryUri(scheme, "/project", "example.test", "user=7&project=123");
      const child = MemoryUri.joinPath(root, "chapters", "Physics.tex");
      const main = MemoryUri.joinPath(root, "main.tex");
      const document = createDocument(child, "\\section{Physics}");
      const files = new Map([
        [main.toString(), "\\documentclass{article}\n\\input{chapters/Physics}\n\\bibliography{reference}"],
        [MemoryUri.joinPath(root, "unrelated.tex").toString(),
          "\\documentclass{article}\n\\bibliography{unrelated}"],
      ]);
      const directories = new Map([
        [root.toString(), [["chapters", 2], ["main.tex", 1], ["unrelated.tex", 1]]],
        [MemoryUri.joinPath(root, "chapters").toString(), [["Physics.tex", 1]]],
      ]);
      const vscode = createMemoryVscode({
        document, files, directories, findFiles: unavailableFileSearch,
      });
      const { resolveDocumentBibliographyPath } = loadResolver(vscode);
      const resolved = await withinDeadline(resolveDocumentBibliographyPath(document, { promptOnMultiple: true }));
      assert.strictEqual(resolved.toString(), MemoryUri.joinPath(root, "reference.bib").toString());
      assert.strictEqual(vscode.calls.searches.length, 0);
      assert.deepStrictEqual(vscode.calls.directories, [root.toString(), MemoryUri.joinPath(root, "chapters").toString()]);
      assert.deepStrictEqual(vscode.calls.writes, []);
    });
  }

  test("retains native file search for local chapters and follows nested includes", async () => {
    const document = createDocument(MemoryUri.file("/project/chapters/Physics.tex"), "\\section{Physics}");
    const main = MemoryUri.file("/project/main.tex");
    const files = new Map([
      [main.toString(), "\\documentclass{article}\n\\input{chapters/index}\n\\bibliography{reference}"],
      ["file:///project/chapters/index.tex", "\\input{Physics}"],
    ]);
    const vscode = createMemoryVscode({ document, files, findFiles: async () => [main] });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);
    const resolved = await resolveDocumentBibliographyPath(document);
    assert.strictEqual(resolved.toString(), "file:///project/reference.bib");
    assert.strictEqual(vscode.calls.searches.length, 1);
    const [pattern, exclude, maxFiles] = vscode.calls.searches[0];
    assert.strictEqual(pattern.pattern, "**/*.{tex,ltx,ctx}");
    assert.strictEqual(exclude, "**/{.git,node_modules}/**");
    assert.strictEqual(maxFiles, 200);
    assert.deepStrictEqual(vscode.calls.directories, []);
    assert.deepStrictEqual(vscode.calls.writes, []);
  });

  for (const content of [
    "\\documentclass{article}\n\\bibliography{reference}",
    "% !TeX root = main.tex\n\\section{Physics}",
  ]) {
    test(`bypasses discovery for a local ${content.startsWith("%") ? "root directive" : "main file"}`, async () => {
      const document = createDocument(MemoryUri.file("/project/Physics.tex"), content);
      const files = new Map([["file:///project/main.tex", "\\documentclass{article}\n\\bibliography{reference}"]]);
      const vscode = createMemoryVscode({ document, files, findFiles: unavailableFileSearch });
      const { resolveDocumentBibliographyPath } = loadResolver(vscode);
      assert.strictEqual((await withinDeadline(resolveDocumentBibliographyPath(document))).toString(),
        "file:///project/reference.bib");
      assert.deepStrictEqual(vscode.calls.searches, []);
      assert.deepStrictEqual(vscode.calls.directories, []);
    });
  }

  test("keeps explicit configuration ahead of virtual chapter discovery", async () => {
    const uri = new MemoryUri("memory-project", "/project/chapters/Physics.tex", "host", "project=1");
    const document = createDocument(uri, "\\section{Physics}");
    const vscode = createMemoryVscode({ document, explicitBibName: "../manual.bib", findFiles: unavailableFileSearch });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);
    assert.strictEqual((await withinDeadline(resolveDocumentBibliographyPath(document))).toString(),
      "memory-project://host/project/manual.bib?project=1");
    assert.deepStrictEqual(vscode.calls.reads, []);
    assert.deepStrictEqual(vscode.calls.directories, []);
    assert.deepStrictEqual(vscode.calls.searches, []);
  });

  for (const quickPickIndex of [1, -1]) {
    test(`handles multiple virtual roots with ${quickPickIndex === -1 ? "cancellation" : "selection"}`, async () => {
      const root = new MemoryUri("memory-project", "/project", "host", "project=1");
      const document = createDocument(MemoryUri.joinPath(root, "Physics.tex"), "\\section{Physics}");
      const files = new Map(["one", "two"].map(name => [MemoryUri.joinPath(root, `${name}.tex`).toString(),
        `\\documentclass{article}\n\\input{Physics}\n\\bibliography{${name}}`]));
      const directories = new Map([[root.toString(), [["two.tex", 1], ["one.tex", 1], ["Physics.tex", 1]]]]);
      const vscode = createMemoryVscode({ document, files, directories, quickPickIndex });
      const { resolveDocumentBibliographyPath } = loadResolver(vscode);
      const resolved = await resolveDocumentBibliographyPath(document, { promptOnMultiple: true });
      assert.strictEqual(resolved?.toString(), quickPickIndex === -1 ? undefined : MemoryUri.joinPath(root, "two.bib").toString());
      assert.deepStrictEqual(vscode.calls.picks[0].map(item => item.uri.toString()),
        ["one", "two"].map(name => MemoryUri.joinPath(root, `${name}.bib`).toString()));
      const cached = await resolveDocumentBibliographyPath(document);
      assert.strictEqual(cached?.toString(), resolved?.toString());
      assert.deepStrictEqual(vscode.calls.writes, []);
    });
  }

  test("excludes generated directories, symlinks and non-child entries from both scans", async () => {
    const root = new MemoryUri("memory-project", "/project", "host", "project=1");
    const document = createDocument(MemoryUri.joinPath(root, "Physics.tex"), "\\section{Physics}");
    const directories = new Map([[root.toString(), [
      [".git", 2], ["node_modules", 2], [".output", 2], ["linked-directory", 66],
      ["linked.tex", 65], ["linked.bib", 65], ["../other", 2], ["..", 2],
      ["../outside.tex", 1], ["../outside.bib", 1], ["bad\\path", 2], ["refs.bib", 1], ["unreadable", 2],
    ]]]);
    const vscode = createMemoryVscode({ document, directories });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);
    assert.strictEqual((await resolveDocumentBibliographyPath(document)).toString(), MemoryUri.joinPath(root, "refs.bib").toString());
    assert.deepStrictEqual(vscode.calls.reads, []);
    assert.deepStrictEqual(vscode.calls.directories,
      [root.toString(), MemoryUri.joinPath(root, "unreadable").toString(), root.toString(), MemoryUri.joinPath(root, "unreadable").toString()]);
    assert.deepStrictEqual(vscode.calls.writes, []);
  });

  test("does not read includes or search candidates outside the project identity", async () => {
    const document = createDocument(MemoryUri.file("/project/Physics.tex"), "\\section{Physics}");
    const main = MemoryUri.file("/project/main.tex");
    const wrongCandidates = [MemoryUri.file("/other/main.tex"), main.with({ query: "project=other" }),
      main.with({ authority: "other" }), main.with({ scheme: "other" })];
    const files = new Map([[main.toString(),
      "\\documentclass{article}\n\\input{../outside}\n\\input{Physics}\n\\bibliography{reference}"]]);
    const vscode = createMemoryVscode({ document, files, findFiles: async () => [...wrongCandidates, main] });
    const { resolveDocumentBibliographyPath } = loadResolver(vscode);
    assert.strictEqual((await resolveDocumentBibliographyPath(document)).toString(), "file:///project/reference.bib");
    assert.ok(vscode.calls.reads.every(uri => uri === main.toString()));
    assert.deepStrictEqual(vscode.calls.writes, []);
  });

  test("does not scan another virtual project if folder lookup ignores query identity", async () => {
    const uri = new MemoryUri("memory-project", "/project/Physics.tex", "host", "project=1");
    const document = createDocument(uri, "\\section{Physics}");
    const vscode = createMemoryVscode({ document });
    vscode.workspace.getWorkspaceFolder = () => ({ uri: new MemoryUri("memory-project", "/project", "host", "project=2") });
    const { detectLatexBibliographyPaths } = loadResolver(vscode);
    assert.deepStrictEqual(await detectLatexBibliographyPaths(document), []);
    assert.deepStrictEqual(vscode.calls.reads, []);
    assert.deepStrictEqual(vscode.calls.directories, []);
    assert.deepStrictEqual(vscode.calls.searches, []);
  });

  test("bounds directory traversal even when there are no matching files", async () => {
    const root = new MemoryUri("memory-project", "/project");
    const document = createDocument(MemoryUri.joinPath(root, "Physics.tex"), "\\section{Physics}");
    const entries = Array.from({ length: 220 }, (_, i) => [`dir${String(i).padStart(3, "0")}`, 2]);
    const directories = new Map([[root.toString(), entries]]);
    for (const [name] of entries) {
      directories.set(MemoryUri.joinPath(root, name).toString(), []);
    }
    const vscode = createMemoryVscode({ document, directories });
    const { detectLatexBibliographyPaths } = loadResolver(vscode);
    assert.deepStrictEqual(await withinDeadline(detectLatexBibliographyPaths(document)), []);
    assert.strictEqual(vscode.calls.directories.length, 200);
    assert.strictEqual(vscode.calls.directories[vscode.calls.directories.length - 1], MemoryUri.joinPath(root, "dir198").toString());
  });

  test("bounds TeX candidate reads", async () => {
    const root = new MemoryUri("memory-project", "/project");
    const document = createDocument(MemoryUri.joinPath(root, "Physics.tex"), "\\section{Physics}");
    const entries = Array.from({ length: 220 }, (_, i) => [`file${String(i).padStart(3, "0")}.tex`, 1]);
    const files = new Map(entries.map(([name]) => [MemoryUri.joinPath(root, name).toString(), "\\section{Other}"]));
    const vscode = createMemoryVscode({ document, files, directories: new Map([[root.toString(), entries]]) });
    const { detectLatexBibliographyPaths } = loadResolver(vscode);
    assert.deepStrictEqual(await withinDeadline(detectLatexBibliographyPaths(document)), []);
    assert.strictEqual(vscode.calls.reads.length, 200);
  });
});
