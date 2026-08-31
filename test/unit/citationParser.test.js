const assert = require("assert");

const {
  extractLatexCitationKeys,
  extractMarkdownCitationKeys,
  findMarkdownCitationSpans,
} = require("../../out/citationParser");

suite("citation parser", () => {
  test("extracts only keys from LaTeX citations with optional arguments", () => {
    const text = String.raw`Text \citep[see][p. 3]{Smith-2020:abc, Jones2021}.`;
    assert.deepStrictEqual(extractLatexCitationKeys(text, "citep"), [
      "Smith-2020:abc",
      "Jones2021",
    ]);
  });

  test("extracts Pandoc locator citations and footnotes but excludes crossrefs", () => {
    const text = "[see @Smith-2020, p. 3; @Jones2021] [^Doe2022] @fig:setup";
    assert.deepStrictEqual(extractMarkdownCitationKeys(text), [
      "Smith-2020",
      "Jones2021",
      "Doe2022",
    ]);
  });

  test("finds a Pandoc citation span containing a locator", () => {
    const text = "before [see @Smith-2020, p. 3] after";
    assert.deepStrictEqual(findMarkdownCitationSpans(text), [{ start: 7, end: 30 }]);
  });
});
