const assert = require("assert");
const Module = require("module");

function loadEditor(command = "cite") {
  const moduleIds = ["editor", "config", "i18n"].map((name) => require.resolve(`../../out/${name}`));
  const cachedModules = moduleIds.map((id) => require.cache[id]);
  moduleIds.forEach((id) => { delete require.cache[id]; });
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "vscode") {
      return {
        env: { language: "en" },
        workspace: {
          getConfiguration: () => ({
            get: (key, fallback) => key === "latexCitationCommand" ? command : fallback,
          }),
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require("../../out/editor");
  } finally {
    Module._load = originalLoad;
    moduleIds.forEach((id, index) => {
      delete require.cache[id];
      if (cachedModules[index]) {
        require.cache[id] = cachedModules[index];
      }
    });
  }
}

function createEditor(markedText, languageId = "latex", isEmpty = true) {
  const cursor = markedText.indexOf("|");
  assert.notStrictEqual(cursor, -1, "test input requires a cursor marker");
  let text = markedText.replace("|", "");
  let editCount = 0;
  return {
    document: {
      languageId,
      uri: { path: languageId === "latex" ? "/main.tex" : "/main.md" },
      getText: () => text,
      offsetAt: (position) => position.offset,
      positionAt: (offset) => ({ offset }),
    },
    selection: { isEmpty, active: { offset: cursor } },
    edit: async (callback) => {
      editCount += 1;
      callback({ insert: (position, value) => {
        text = text.slice(0, position.offset) + value + text.slice(position.offset);
      } });
      return true;
    },
    getEditCount: () => editCount,
  };
}

suite("citation insertion", () => {
  test("merges immediately after a LaTeX citation and preserves following text", async () => {
    const editor = createEditor(String.raw`Text \cite{Old}|, more text.`);
    await loadEditor().insertCiteKeys(["New", "Other"], editor);
    assert.strictEqual(editor.document.getText(), String.raw`Text \cite{Old, New, Other}, more text.`);
  });

  test("appends only new keys while preserving existing formatting", async () => {
    const editor = createEditor(String.raw`\cite{Old,Existing}|`);
    await loadEditor().insertCiteKeys(["Old", "New", "New", "Existing"], editor);
    assert.strictEqual(editor.document.getText(), String.raw`\cite{Old,Existing, New}`);
    assert.strictEqual(editor.getEditCount(), 1);
  });

  test("does not edit when every selected key is already in the citation", async () => {
    const editor = createEditor(String.raw`\cite{Old}|`);
    await loadEditor().insertCiteKeys(["Old", "Old"], editor);
    assert.strictEqual(editor.document.getText(), String.raw`\cite{Old}`);
    assert.strictEqual(editor.getEditCount(), 0);
  });

  test("prefers the left citation at a shared boundary", async () => {
    const editor = createEditor(String.raw`\cite{Left}|\cite{Right}`);
    await loadEditor().insertCiteKeys(["New"], editor);
    assert.strictEqual(editor.document.getText(), String.raw`\cite{Left, New}\cite{Right}`);
  });

  test("retains insertion inside a citation", async () => {
    const editor = createEditor(String.raw`\cite{Ol|d}`);
    await loadEditor().insertCiteKeys(["New"], editor);
    assert.strictEqual(editor.document.getText(), String.raw`\cite{Old, New}`);
  });

  test("preserves configured commands, stars, and optional arguments", async () => {
    for (const command of ["citep", "citet", "parencite", "autocite"]) {
      const citation = `\\${command}*[see][p. 3]{Old}`;
      const editor = createEditor(citation + "|");
      await loadEditor(command).insertCiteKeys(["New"], editor);
      assert.strictEqual(editor.document.getText(), citation.replace("{Old}", "{Old, New}"));
    }
  });

  test("recognizes a plain cite even when new citations use a custom command", async () => {
    const editor = createEditor(String.raw`\cite{Old}|`);
    await loadEditor("citep").insertCiteKeys(["New"], editor);
    assert.strictEqual(editor.document.getText(), String.raw`\cite{Old, New}`);
  });

  test("fills an empty citation without a leading comma", async () => {
    const editor = createEditor(String.raw`\cite{}|`);
    await loadEditor().insertCiteKeys(["New"], editor);
    assert.strictEqual(editor.document.getText(), String.raw`\cite{New}`);
  });

  test("preserves keys outside the extraction pattern and an existing trailing comma", async () => {
    const editor = createEditor(String.raw`\cite{Old!, }|`);
    await loadEditor().insertCiteKeys(["Old!", "New"], editor);
    assert.strictEqual(editor.document.getText(), String.raw`\cite{Old!, New}`);
  });

  test("does not merge across whitespace, a line break, or punctuation", async () => {
    for (const separator of [" ", "\n", ",", "."]) {
      const prefix = String.raw`\cite{Old}` + separator;
      const editor = createEditor(prefix + "|");
      await loadEditor().insertCiteKeys(["New"], editor);
      assert.strictEqual(editor.document.getText(), prefix + String.raw`\cite{New}`);
    }
  });

  test("does not merge when text is selected", async () => {
    const editor = createEditor(String.raw`\cite{Old}|`, "latex", false);
    await loadEditor().insertCiteKeys(["New"], editor);
    assert.strictEqual(editor.document.getText(), String.raw`\cite{Old}\cite{New}`);
  });

  test("keeps Markdown boundary behavior unchanged", async () => {
    const editor = createEditor("[@Old]|", "markdown");
    await loadEditor().insertCiteKeys(["New"], editor);
    assert.strictEqual(editor.document.getText(), "[@Old][@New]");
  });
});
