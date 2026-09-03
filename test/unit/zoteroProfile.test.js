const assert = require("assert");

suite("Zotero profile discovery", () => {
  test("extracts unique zotero-inspire read tokens from prefs.js", () => {
    const { extractZoteroInspireReadTokens } = require("../../out/zoteroProfile");
    const first = "A".repeat(43);
    const second = "b".repeat(42) + "_";
    const prefs = [
      `user_pref("extensions.zotero.inspiremeta.external_read_token", "${first}");`,
      `user_pref("extensions.zotero.inspiremeta.external_read_token", "too-short");`,
      `user_pref("extensions.zotero.inspiremeta.external_read_token", "${second}");`,
      `user_pref("extensions.zotero.inspiremeta.external_read_token", "${first}");`,
    ].join("\n");

    assert.deepStrictEqual(extractZoteroInspireReadTokens(prefs), [first, second]);
  });
});
