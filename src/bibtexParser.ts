import * as path from "path";
import { Worker } from "worker_threads";
import type { BibtexAppendIndex } from "./bibtexAppend";

// The package does not publish TypeScript declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bibtexParse = require("@orcid/bibtex-parse-js") as {
  toBibtex: (entries: unknown[], compact: boolean) => string;
};

export type ParsedBibEntry = {
  citationKey?: string;
  entryType?: string;
  entryTags?: Record<string, unknown>;
  [key: string]: unknown;
};

const DEFAULT_PARSE_TIMEOUT_MS = 5_000;
const MAX_BIBTEX_BYTES = 10 * 1024 * 1024;

type ParserWorkerMessage =
  | ({ ok: true } & BibtexAppendIndex)
  | { ok: false; message: string };

/** Parse untrusted BibTeX away from the VS Code extension host. */
export function parseBibtex(
  content: string,
  timeoutMs = DEFAULT_PARSE_TIMEOUT_MS
): Promise<ParsedBibEntry[]> {
  return runParserWorker(content, timeoutMs, false).then((result) => result.entries);
}

/** Index old entries for append-only operations, retaining malformed blocks verbatim. */
export function parseBibtexForAppend(
  content: string,
  timeoutMs = DEFAULT_PARSE_TIMEOUT_MS
): Promise<BibtexAppendIndex> {
  return runParserWorker(content, timeoutMs, true);
}

function runParserWorker(
  content: string,
  timeoutMs: number,
  append: boolean
): Promise<BibtexAppendIndex> {
  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength > MAX_BIBTEX_BYTES) {
    return Promise.reject(
      new Error(`BibTeX input is too large (${byteLength} bytes; limit is ${MAX_BIBTEX_BYTES}).`)
    );
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "bibtexWorker.js"), {
      workerData: {
        content,
        append,
      },
    });

    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      callback();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`BibTeX parsing timed out after ${timeoutMs} ms.`)));
    }, timeoutMs);

    worker.once("message", (message: ParserWorkerMessage) => {
      if (message.ok) {
        finish(() => resolve({ entries: message.entries, syntaxWarnings: message.syntaxWarnings }));
      } else {
        finish(() => reject(new Error(`Invalid BibTeX: ${message.message}`)));
      }
    });

    worker.once("error", (error) => {
      finish(() => reject(error));
    });

    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        finish(() => reject(new Error(`BibTeX parser worker exited with code ${code}.`)));
      }
    });
  });
}

export function serializeBibtex(entries: ParsedBibEntry[]): string {
  return bibtexParse.toBibtex(entries, false);
}
