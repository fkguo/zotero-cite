const assert = require("assert");

const {
  containsLatexDocumentClass,
  extractLatexBibliographyReferences,
  extractLatexIncludes,
  extractLatexRootDirective,
  stripLatexComments,
} = require("../../out/latexBibliography");

suite("LaTeX bibliography discovery", () => {
  test("extracts BibTeX and biblatex resources while ignoring comments", () => {
    const source = String.raw`
      \documentclass{article}
      % \bibliography{ignored}
      \bibliography{refs, library/more.bib}
      \addbibresource[location=local]{bib/main.bib}
      \addglobalbib{global}
      Escaped percent \% remains text.
    `;

    assert.deepStrictEqual(extractLatexBibliographyReferences(source), [
      { command: "biblatex", path: "bib/main.bib" },
      { command: "biblatex", path: "global.bib" },
      { command: "bibliography", path: "refs.bib" },
      { command: "bibliography", path: "library/more.bib" },
    ]);
    assert.strictEqual(containsLatexDocumentClass(source), true);
  });

  test("finds root directives and recursively relevant include commands", () => {
    const source = String.raw`
      % !TeX root = ../main
      \input{sections/introduction}
      \include{appendix.tex}
      \subfile[../main.tex]{chapter/body}
      % \input{ignored}
    `;

    assert.strictEqual(extractLatexRootDirective(source), "../main.tex");
    assert.deepStrictEqual(extractLatexIncludes(source), [
      "sections/introduction.tex",
      "appendix.tex",
      "chapter/body.tex",
    ]);
  });

  test("does not treat escaped percent signs as comments or expand macro paths", () => {
    const source = String.raw`
      Text \% \addbibresource{real.bib}
      \addbibresource{\jobname.bib}
      \bibliography{valid, \generated}
    `;

    assert.match(stripLatexComments(source), /real\.bib/);
    assert.deepStrictEqual(extractLatexBibliographyReferences(source), [
      { command: "biblatex", path: "real.bib" },
      { command: "bibliography", path: "valid.bib" },
    ]);
  });
});
