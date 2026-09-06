const assert = require("assert");
const vscode = require("vscode");
const { insertCiteKeys } = require("../../out/editor");

suite("LaTeX citation edits in VS Code", () => {
  test("merges after the closing brace, preserves the cursor, and undoes in one step", async () => {
    const original = String.raw`Text \cite{Old}, suffix`;
    const document = await vscode.workspace.openTextDocument({ language: "latex", content: original });
    const editor = await vscode.window.showTextDocument(document);
    const cursor = document.positionAt(original.indexOf("}") + 1);
    editor.selection = new vscode.Selection(cursor, cursor);
    try {
      assert.strictEqual(editor.document.languageId, "latex", "test document must be in LaTeX mode");
      assert.strictEqual(editor.document, document, "edits must target the opened document");
      await insertCiteKeys(["Old", "New", "New"], editor);
      const expected = String.raw`Text \cite{Old, New}, suffix`;
      assert.strictEqual(document.getText(), expected);
      assert.strictEqual(document.offsetAt(editor.selection.active), expected.indexOf("}") + 1);
      await vscode.commands.executeCommand("undo");
      assert.strictEqual(document.getText(), original);
    } finally {
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    }
  });
});
