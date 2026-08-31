const assert = require("assert");

const { getMissingCiteKeys, uniqueCiteKeys } = require("../../out/citeKeys");

suite("cite key deduplication", () => {
  test("deduplicates keys while preserving selection order", () => {
    assert.deepStrictEqual(uniqueCiteKeys(["A", "A", " B ", "", "B", "C"]), ["A", "B", "C"]);
  });

  test("returns each missing key exactly once", () => {
    assert.deepStrictEqual(getMissingCiteKeys(["A"], ["A", "B", "B", "C"]), ["B", "C"]);
  });
});
