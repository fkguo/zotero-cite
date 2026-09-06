// Run in an isolated extension host with only a FileSystemProvider and mock CAYW.
// No Zotero instance, real manuscript, or installed extension is used.
const assert = require("assert");
const http = require("http");
const path = require("path");

async function withDeadline(promise, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 8000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

exports.run = async () => {
  const vscode = require("vscode");
  const root = vscode.workspace.workspaceFolders[0].uri;
  assert.strictEqual(root.scheme, "overleaf-workshop");
  assert.strictEqual(root.query, "user=fixture&project=fixture");
  let writes = 0;
  const requests = [];
  const reads = [];
  const directories = [];
  const files = new Map([
    ["/citation-test/main.tex", "\\documentclass{article}\n\\input{Physics}\n\\bibliography{reference}\n"],
    ["/citation-test/Physics.tex", "\\section{Test}\nNo real manuscript content.\n"],
    ["/citation-test/reference.bib", "@article{Example, title={Example}}\n"],
  ]);
  const initialFiles = [...files];
  const event = new vscode.EventEmitter();
  const checkIdentity = uri => {
    assert.strictEqual(uri.scheme, root.scheme);
    assert.strictEqual(uri.authority, root.authority);
    assert.strictEqual(uri.query, root.query);
  };
  const failWrite = () => {
    writes++;
    throw vscode.FileSystemError.NoPermissions("Test fixture is read-only");
  };
  const provider = vscode.workspace.registerFileSystemProvider(root.scheme, {
    onDidChangeFile: event.event,
    watch: () => new vscode.Disposable(() => {
      // The immutable fixture has no watchers to dispose.
    }),
    stat: uri => {
      if (uri.path === root.path) {
        return { type: vscode.FileType.Directory, ctime: 1, mtime: 1, size: 0 };
      }
      const text = files.get(uri.path);
      if (text === undefined) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      return { type: vscode.FileType.File, ctime: 1, mtime: 1, size: Buffer.byteLength(text) };
    },
    readDirectory: uri => {
      directories.push(uri.toString());
      checkIdentity(uri);
      if (uri.path !== root.path) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      return [...files.keys()].map(name => [path.posix.basename(name), vscode.FileType.File]);
    },
    readFile: uri => {
      reads.push(uri.toString());
      checkIdentity(uri);
      const text = files.get(uri.path);
      if (text === undefined) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      return Buffer.from(text);
    },
    writeFile: failWrite,
    createDirectory: failWrite,
    rename: failWrite,
    delete: failWrite,
  }, { isCaseSensitive: true });
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    console.log("FIXTURE_CAYW_REQUEST", req.url);
    // An empty selection exercises cancellation before any insertion or write.
    res.end(req.url.includes("probe=") ? "ready" : "");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await vscode.workspace.getConfiguration("zotero-cite").update("caywUrl",
      `http://127.0.0.1:${server.address().port}/better-bibtex/cayw`, vscode.ConfigurationTarget.Global);
    const extension = vscode.extensions.getExtension("xing.zotero-cite");
    assert.ok(extension);
    assert.strictEqual(path.resolve(extension.extensionPath), path.resolve(process.env.ZOTERO_CITE_TEST_EXTENSION_PATH));
    await extension.activate();
    console.log("TEST_EXTENSION", extension.extensionPath, extension.packageJSON.version);

    for (const name of ["main.tex", "Physics.tex"]) {
      const uri = vscode.Uri.joinPath(root, name);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      const before = requests.length;
      await withDeadline(vscode.commands.executeCommand("zotero-cite.citeBibliography"), `${name} command stalled`);
      assert.deepStrictEqual(requests.slice(before), [
        "/better-bibtex/cayw?probe=1",
        "/better-bibtex/cayw?format=pandoc&brackets=1&minimize=",
      ]);
      assert.strictEqual(document.getText(), files.get(uri.path));
      assert.strictEqual(document.isDirty, false);
      assert.strictEqual(writes, 0);
      console.log("DOCUMENT_REACHED_MOCK_PICKER", JSON.stringify({ uri: uri.toString(), requests: requests.length, writes }));
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    }

    // Check the exact resolved target with the compiled resolver in this host.
    // The command checks above run the actual bundled extension entry point.
    const { resolveDocumentBibliographyPath } = require(path.join(__dirname, "../out/bibliographyResolver"));
    const child = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, "Physics.tex"));
    const resolved = await withDeadline(resolveDocumentBibliographyPath(child), "Chapter resolution stalled");
    assert.strictEqual(resolved.toString(), vscode.Uri.joinPath(root, "reference.bib").toString());
    assert.ok(directories.includes(root.toString()));
    assert.ok(reads.includes(vscode.Uri.joinPath(root, "main.tex").toString()));
    assert.deepStrictEqual([...files], initialFiles);
    assert.strictEqual(writes, 0);
    console.log("VIRTUAL_WORKSPACE_PASS", JSON.stringify({ bibliography: resolved.toString(), requests, writes, reads, directories }));
  } finally {
    await new Promise(resolve => server.close(resolve));
    provider.dispose();
    event.dispose();
  }
};

if (require.main === module) {
  const fs = require("fs");
  const os = require("os");
  const { runTests } = require("@vscode/test-electron");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "zotero-virtual-regression-"));
  const workspace = path.join(profile, "fixture.code-workspace");
  fs.writeFileSync(workspace, JSON.stringify({
    folders: [{ uri: "overleaf-workshop://example.test/citation-test?user=fixture&project=fixture" }],
    settings: {
      "security.workspace.trust.enabled": false,
      "zotero-cite.defaultBibName": "",
      "workbench.startupEditor": "none",
    },
  }, null, 2));
  const extensionDevelopmentPath = process.env.ZOTERO_CITE_TEST_EXTENSION_PATH || path.resolve(__dirname, "..");
  console.log("ISOLATED_PROFILE", profile);
  runTests({
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
    extensionDevelopmentPath,
    extensionTestsPath: __filename,
    extensionTestsEnv: { ZOTERO_CITE_TEST_EXTENSION_PATH: extensionDevelopmentPath },
    launchArgs: [workspace, "--user-data-dir", path.join(profile, "user"),
      "--extensions-dir", path.join(profile, "extensions"), "--disable-extensions",
      "--skip-welcome", "--skip-release-notes", "--disable-updates", "--disable-workspace-trust"],
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
