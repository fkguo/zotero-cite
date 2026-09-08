import { parentPort, workerData } from "worker_threads";
import { indexBibtexForAppend } from "./bibtexAppend";

// The package does not publish TypeScript declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bibtexParse = require("@orcid/bibtex-parse-js") as {
  toJSON: (content: string) => unknown[];
};

type ParserWorkerData = {
  content: string;
  append?: boolean;
};

if (!parentPort) {
  throw new Error("BibTeX parser worker requires a parent port.");
}

try {
  const data = workerData as ParserWorkerData;
  const result = data.append
    ? indexBibtexForAppend(data.content)
    : { entries: bibtexParse.toJSON(data.content), syntaxWarnings: [] };
  parentPort.postMessage({ ok: true, ...result });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  });
}
