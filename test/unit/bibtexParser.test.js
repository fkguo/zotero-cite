const assert = require("assert");

const { parseBibtex } = require("../../out/bibtexParser");

suite("safe BibTeX parser", () => {
  test("parses valid entries", async () => {
    const entries = await parseBibtex("@article{Key2024, title={A title}}", 1000);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].citationKey, "Key2024");
  });

  test("terminates a parser worker that hangs on malformed input", async function () {
    this.timeout(2000);
    await assert.rejects(
      parseBibtex("@article{x,title={a}, %comment without newline", 150),
      /timed out/
    );
  });
});
