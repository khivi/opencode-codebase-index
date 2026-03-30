#!/usr/bin/env node
import { execFileSync } from "child_process";
import { repoRoot } from "./git/blobsha.js";
import { parseConfig } from "./config/schema.js";
import { createIndexer } from "./indexer/index.js";
import { runInstall } from "./commands/hooks-install.js";
import { loadPluginConfig } from "./commands/config-loader.js";

function usage(): void {
  console.log(`Usage: codebase-index <command>

Commands:
  init                   Build initial index and install git hooks
  index --diff <o> <n>   Index files changed between two refs (used by hooks)

  --help                 Show this help`);
}

function progressCallback(progress: { phase: string; chunksProcessed: number; totalChunks: number }): void {
  if (progress.phase === "embedding" && progress.totalChunks > 0) {
    process.stdout.write(
      `\rEmbedding: ${progress.chunksProcessed}/${progress.totalChunks} chunks`
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    usage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "init": {
      const root = repoRoot();
      const rawConfig = loadPluginConfig(root);
      const config = parseConfig(rawConfig);
      const indexer = createIndexer(root, config);
      await indexer.initialize();

      // Full index
      console.log("Indexing codebase...");
      const stats = await indexer.index(progressCallback);

      if (stats.indexedChunks > 0) {
        process.stdout.write("\n");
      }

      console.log(
        `Done. ${stats.totalFiles} files, ${stats.indexedChunks} chunks embedded, ` +
        `${stats.existingChunks} cached, ${stats.removedChunks} removed. ` +
        `${(stats.durationMs / 1000).toFixed(1)}s`
      );

      // Install hooks
      console.log("\nInstalling git hooks...");
      runInstall(true);
      break;
    }

    case "index": {
      const diffIdx = args.indexOf("--diff");
      if (diffIdx === -1) {
        console.error("Error: index requires --diff <old> <new> (use 'init' for full index)");
        process.exit(1);
      }

      const oldRef = args[diffIdx + 1];
      const newRef = args[diffIdx + 2];
      if (!oldRef || !newRef) {
        console.error("Error: --diff requires two refs (e.g. --diff HEAD~1 HEAD)");
        process.exit(1);
      }

      const root = repoRoot();
      const changedFiles = execFileSync(
        "git", ["diff", "--name-only", oldRef, newRef],
        { cwd: root, encoding: "utf-8" }
      ).trim().split("\n").filter(Boolean);

      if (changedFiles.length === 0) {
        break;
      }

      const rawConfig = loadPluginConfig(root);
      const config = parseConfig(rawConfig);
      const indexer = createIndexer(root, config);
      await indexer.initialize();

      const stats = await indexer.index(progressCallback, changedFiles);

      if (stats.indexedChunks > 0 || stats.removedChunks > 0) {
        process.stdout.write("\n");
      }

      console.log(
        `${changedFiles.length} changed, ${stats.indexedChunks} embedded, ` +
        `${stats.removedChunks} removed. ${(stats.durationMs / 1000).toFixed(1)}s`
      );
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal: ${message}`);
  process.exit(1);
});
