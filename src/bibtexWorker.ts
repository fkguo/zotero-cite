import { parentPort, workerData } from "worker_threads";

// The package does not publish TypeScript declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bibtexParse = require("@orcid/bibtex-parse-js") as {
  toJSON: (content: string) => unknown[];
};

type ParserWorkerData = {
  content: string;
};

if (!parentPort) {
  throw new Error("BibTeX parser worker requires a parent port.");
}

try {
  const entries = bibtexParse.toJSON((workerData as ParserWorkerData).content);
  parentPort.postMessage({ ok: true, entries });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  });
}
