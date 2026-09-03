const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");

suite("production bundle inputs", () => {
  test("builds the extension and standalone BibTeX worker", () => {
    assert.strictEqual(fs.existsSync(path.resolve(__dirname, "../../dist/extension.js")), true);
    assert.strictEqual(fs.existsSync(path.resolve(__dirname, "../../dist/bibtexWorker.js")), true);
  });

  test("parses BibTeX in the bundled worker", async function () {
    this.timeout(3000);
    const workerPath = path.resolve(__dirname, "../../dist/bibtexWorker.js");
    const message = await new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: { content: "@article{Bundled2026, title={Worker bundle}}" },
      });
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`Bundled worker exited with code ${code}.`));
        }
      });
    });

    assert.strictEqual(message.ok, true);
    assert.strictEqual(message.entries[0].citationKey, "Bundled2026");
  });
});
