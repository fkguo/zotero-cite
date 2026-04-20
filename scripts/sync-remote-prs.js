#!/usr/bin/env node
"use strict";

const cp = require("child_process");

function printUsage() {
  const lines = [
    "Auto-merge remote pull request refs into the current branch.",
    "",
    "Usage:",
    "  node scripts/sync-remote-prs.js [options]",
    "",
    "Options:",
    "  --remote <name>       Remote name (default: origin)",
    "  --refspec <spec>      Refspec used by git fetch",
    "                        (default: +refs/pull/*/head:refs/remotes/<remote>/pr/*)",
    "  --prefix <prefix>     Prefix used to scan fetched refs",
    "                        (default: refs/remotes/<remote>/pr/)",
    "  --limit <n>           Merge at most n PR refs",
    "  --dry-run             Show planned merges only",
    "  --keep-going          Continue after a failed merge",
    "  --include-merged      Do not skip refs already in HEAD",
    "  --allow-dirty         Allow running with uncommitted changes",
    "  -h, --help            Show this help",
    "",
    "Examples:",
    "  npm run sync:prs:dry",
    "  npm run sync:prs",
    "  npm run sync:prs -- --remote upstream --limit 5",
  ];

  console.log(lines.join("\n"));
}

function parseArgs(argv) {
  const options = {
    remote: "origin",
    refspec: "",
    prefix: "",
    limit: 0,
    dryRun: false,
    keepGoing: false,
    includeMerged: false,
    allowDirty: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--remote") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("Missing value for --remote");
      }
      options.remote = argv[i];
    } else if (arg === "--refspec") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("Missing value for --refspec");
      }
      options.refspec = argv[i];
    } else if (arg === "--prefix") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("Missing value for --prefix");
      }
      options.prefix = argv[i];
    } else if (arg === "--limit") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("Missing value for --limit");
      }
      const limit = Number(argv[i]);
      if (!Number.isInteger(limit) || limit < 0) {
        throw new Error("--limit must be a non-negative integer");
      }
      options.limit = limit;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--keep-going") {
      options.keepGoing = true;
    } else if (arg === "--include-merged") {
      options.includeMerged = true;
    } else if (arg === "--allow-dirty") {
      options.allowDirty = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error("Unknown argument: " + arg);
    }
  }

  if (!options.refspec) {
    options.refspec = "+refs/pull/*/head:refs/remotes/" + options.remote + "/pr/*";
  }
  if (!options.prefix) {
    options.prefix = "refs/remotes/" + options.remote + "/pr/";
  }

  return options;
}

function runGit(args, inheritOutput) {
  const result = cp.spawnSync("git", args, {
    encoding: "utf8",
    stdio: inheritOutput ? "inherit" : ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error("Failed to run git " + args.join(" ") + ": " + result.error.message);
  }

  return result;
}

function runGitOrThrow(args, errorMessage) {
  const result = runGit(args, false);
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    throw new Error(errorMessage + (stderr ? "\n" + stderr : ""));
  }
  return (result.stdout || "").trim();
}

function runGitInheritOrThrow(args, errorMessage) {
  const result = runGit(args, true);
  if (result.status !== 0) {
    throw new Error(errorMessage + "\nCommand: git " + args.join(" "));
  }
}

function isAncestor(refName) {
  const result = runGit(["merge-base", "--is-ancestor", refName, "HEAD"], false);
  if (result.status === 0) {
    return true;
  }
  if (result.status === 1) {
    return false;
  }

  const stderr = (result.stderr || "").trim();
  throw new Error("Failed to check merge ancestry for " + refName + (stderr ? "\n" + stderr : ""));
}

function extractPrId(refName) {
  const match = /\/(\d+)$/.exec(refName);
  if (!match) {
    return Number.NaN;
  }
  return Number(match[1]);
}

function formatPrLabel(refName) {
  const prId = extractPrId(refName);
  if (Number.isNaN(prId)) {
    return refName;
  }
  return "#" + prId;
}

function ensureCleanWorkingTree(options) {
  if (options.allowDirty) {
    return;
  }
  const status = runGitOrThrow(["status", "--porcelain"], "Failed to inspect working tree state.");
  if (status) {
    throw new Error(
      "Working tree is not clean. Commit or stash changes first, or pass --allow-dirty."
    );
  }
}

function getPrRefs(prefix) {
  const output = runGitOrThrow(
    ["for-each-ref", "--format=%(refname)", prefix + "*"],
    "Failed to list fetched PR refs."
  );
  if (!output) {
    return [];
  }
  return output.split(/\r?\n/).filter(function (line) {
    return Boolean(line);
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  runGitOrThrow(["rev-parse", "--is-inside-work-tree"], "This folder is not a git repository.");
  const currentBranch = runGitOrThrow(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    "Failed to detect the current branch."
  );

  ensureCleanWorkingTree(options);

  console.log("Current branch: " + currentBranch);
  console.log("Fetching PR refs from remote: " + options.remote);

  runGitInheritOrThrow(
    ["fetch", "--prune", options.remote, options.refspec],
    "Failed to fetch PR refs. Confirm the remote supports refs/pull/*/head or pass a custom --refspec."
  );

  let refs = getPrRefs(options.prefix);
  if (refs.length === 0) {
    console.log("No PR refs found under prefix: " + options.prefix);
    return;
  }

  refs.sort(function (a, b) {
    const aId = extractPrId(a);
    const bId = extractPrId(b);
    if (!Number.isNaN(aId) && !Number.isNaN(bId) && aId !== bId) {
      return aId - bId;
    }
    return a.localeCompare(b);
  });

  if (options.limit > 0) {
    refs = refs.slice(0, options.limit);
  }

  const mergeQueue = [];
  const skipped = [];

  refs.forEach(function (refName) {
    if (!options.includeMerged && isAncestor(refName)) {
      skipped.push(refName);
      return;
    }
    mergeQueue.push(refName);
  });

  if (mergeQueue.length === 0) {
    console.log("No new PR refs to merge.");
    if (skipped.length > 0) {
      console.log("Skipped already merged refs: " + skipped.length);
    }
    return;
  }

  console.log("Planned merges: " + mergeQueue.length);
  mergeQueue.forEach(function (refName) {
    console.log("  - " + formatPrLabel(refName) + "  " + refName);
  });

  if (options.dryRun) {
    console.log("Dry run enabled, nothing was merged.");
    return;
  }

  let mergedCount = 0;
  const failed = [];

  for (let i = 0; i < mergeQueue.length; i += 1) {
    const refName = mergeQueue[i];
    console.log("[" + (i + 1) + "/" + mergeQueue.length + "] Merging " + formatPrLabel(refName));

    const mergeResult = runGit(["merge", "--no-ff", "--no-edit", refName], true);
    if (mergeResult.status === 0) {
      mergedCount += 1;
      continue;
    }

    failed.push(refName);
    console.error("Merge failed for " + refName + ". Attempting merge abort.");

    const abortResult = runGit(["merge", "--abort"], false);
    if (abortResult.status === 0) {
      console.error("Merge aborted to keep the working tree clean.");
    }

    if (!options.keepGoing) {
      break;
    }
  }

  console.log(
    "Done. merged=" +
      mergedCount +
      ", skipped=" +
      skipped.length +
      ", failed=" +
      failed.length
  );

  if (failed.length > 0) {
    console.error("Failed refs:");
    failed.forEach(function (refName) {
      console.error("  - " + formatPrLabel(refName) + "  " + refName);
    });
    process.exitCode = 1;
  }
}

try {
  main();
} catch (err) {
  console.error("ERROR: " + err.message);
  process.exit(1);
}
