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
}) {
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
    Uri: MemoryUri,
    RelativePattern,
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    env: { language: "en" },
    workspace: {
      textDocuments: [document],
      fs: {
        async readFile(uri) {
          const value = files.get(uri.toString());
          if (value === undefined) {
            const error = new Error("not found");
            error.code = "FileNotFound";
            throw error;
          }
          return Buffer.from(value);
        },
        async readDirectory(uri) {
          const entries = directories.get(uri.toString());
          if (!entries) {
            const error = new Error("not found");
            error.code = "FileNotFound";
            throw error;
          }
          return entries;
        },
      },
      getConfiguration: () => configuration,
      getWorkspaceFolder(uri) {
        const relative = path.posix.relative(workspaceUri.path, uri.path);
        return relative.startsWith("..") ? undefined : workspaceFolder;
      },
      findFiles: async () => [],
      asRelativePath: (uri) => path.posix.relative(workspaceUri.path, uri.path),
    },
    window: {
      showQuickPick: async (items) => items[quickPickIndex],
    },
  };
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
