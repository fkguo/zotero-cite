const assert = require("assert");

const { parseBibtex, parseBibtexForAppend } = require("../../out/bibtexParser");

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

  test("indexes a delimited malformed entry without repairing its text", async () => {
    const raw = '@misc{Broken2026, title={Existing work}\nnote="in preparation"\nyear={2026}}';
    await assert.rejects(parseBibtex(raw), /Token mismatch/);
    const result = await parseBibtexForAppend(`% header\n${raw}\n@article{Good, title={Valid}}`);
    assert.deepStrictEqual(result.entries.map(entry => entry.citationKey), ["Broken2026", "Good"]);
    assert.strictEqual(result.entries[0].unparsedBibtex, raw);
    assert.strictEqual(result.syntaxWarnings[0].key, "Broken2026");
    assert.strictEqual(result.syntaxWarnings[0].line, 2);
  });

  test("does not mistake comments or value text for independent entries", async () => {
    const text = String.raw`% @article{Hidden, title={Not an entry}}
@misc{Broken, title={Existing} year={2026}}
@comment{Example @article{AlsoHidden, title={Not an entry}}}
@article{Visible, title={Text @article{Literal, title={Nested}} and 50%},
note="Escaped \"quote\" and {nested braces}"}`;
    const result = await parseBibtexForAppend(text);
    assert.deepStrictEqual(result.entries.filter(entry => entry.citationKey).map(entry => entry.citationKey), ["Broken", "Visible"]);
    assert.strictEqual(result.syntaxWarnings.length, 1);
    assert.match(result.entries[2].entryTags.note, /nested braces/);
  });

  test("refuses to resynchronize across uncertain entry boundaries", async function () {
    this.timeout(3000);
    for (const text of [
      '@article{Broken, title={Open}\n@article{Next, title={Nested}}',
      '@article{Broken, title="Open}\n@article{Next, title={Nested}}',
      '@article{Broken title={Missing header comma}}',
      '@article{Broken, title={Open}\n@article{Next, title={Nested}}\n}',
    ]) {
      await assert.rejects(parseBibtexForAppend(text), /entry boundary.*line 1/);
    }
  });

  test("keeps worker timeout protection in append mode", async function () {
    this.timeout(2000);
    await assert.rejects(parseBibtexForAppend("@article{x,title={a}, %no newline", 150), /timed out/);
  });
});
