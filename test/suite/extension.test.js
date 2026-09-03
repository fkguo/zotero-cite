const assert = require("assert");

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require("vscode");

suite("Extension Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("activates the bundled extension entry point", async () => {
		const extension = vscode.extensions.getExtension("xing.zotero-cite");
		assert.ok(extension, "Zotero Cite extension was not discovered");
		await extension.activate();
		assert.strictEqual(extension.isActive, true);
	});
});
