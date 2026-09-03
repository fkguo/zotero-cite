const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const context = await esbuild.context({
    entryPoints: {
      extension: "src/extension.ts",
      bibtexWorker: "src/bibtexWorker.ts",
    },
    bundle: true,
    entryNames: "[name]",
    external: ["vscode"],
    format: "cjs",
    logLevel: "warning",
    minify: production,
    outdir: "dist",
    platform: "node",
    sourcemap: production ? false : true,
    sourcesContent: false,
    target: "node14",
  });

  if (watch) {
    await context.watch();
    return;
  }

  await context.rebuild();
  await context.dispose();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
