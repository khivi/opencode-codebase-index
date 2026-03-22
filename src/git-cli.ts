#!/usr/bin/env node
import { repoRoot } from "./git/blobsha.js";
import { parseConfig } from "./config/schema.js";
import { Indexer } from "./indexer/index.js";
import { runInstall } from "./commands/install.js";
import { runIncremental } from "./commands/incremental.js";
import { runQuery } from "./commands/query.js";
import { loadPluginConfig } from "./commands/config-loader.js";

function usage(): void {
  console.log(`Usage: codebase-index <command> [options]

Commands:
  install                Install git hooks for automatic incremental indexing
  index                  Full reindex of the codebase
  incremental            Incremental index update (only changed files)
  query <text>           Query the index (scoped to current worktree)
  status                 Show index status

Options:
  query --limit N        Max results (default: 10)
  --help                 Show this help`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    usage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "install":
      runInstall();
      break;

    case "index": {
      const root = repoRoot();
      const rawConfig = loadPluginConfig(root);
      const config = parseConfig(rawConfig);
      const indexer = new Indexer(root, config);
      await indexer.initialize();

      console.log("Indexing codebase...");
      const stats = await indexer.index((progress) => {
        if (progress.phase === "embedding" && progress.totalChunks > 0) {
          process.stdout.write(
            `\rEmbedding: ${progress.chunksProcessed}/${progress.totalChunks} chunks`
          );
        }
      });

      if (stats.indexedChunks > 0) {
        process.stdout.write("\n");
      }

      console.log(
        `Done. ${stats.totalFiles} files, ${stats.indexedChunks} chunks embedded, ` +
        `${stats.existingChunks} cached, ${stats.removedChunks} removed. ` +
        `${(stats.durationMs / 1000).toFixed(1)}s`
      );
      break;
    }

    case "incremental":
      await runIncremental();
      break;

    case "query": {
      const queryParts: string[] = [];
      let limit = 10;

      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--limit" && args[i + 1]) {
          limit = parseInt(args[++i], 10);
          if (isNaN(limit) || limit < 1) limit = 10;
        } else {
          queryParts.push(args[i]);
        }
      }

      const queryText = queryParts.join(" ");
      if (!queryText) {
        console.error("Error: query text is required");
        process.exit(1);
      }

      await runQuery(queryText, limit);
      break;
    }

    case "status": {
      const root = repoRoot();
      const rawConfig = loadPluginConfig(root);
      const config = parseConfig(rawConfig);
      const indexer = new Indexer(root, config);
      await indexer.initialize();
      const status = await indexer.getStatus();

      console.log(`Indexed: ${status.indexed}`);
      console.log(`Chunks:  ${status.vectorCount.toLocaleString()}`);
      console.log(`Provider: ${status.provider}`);
      console.log(`Model:   ${status.model}`);
      console.log(`Path:    ${status.indexPath}`);
      if (status.currentBranch !== "default") {
        console.log(`Branch:  ${status.currentBranch}`);
        console.log(`Base:    ${status.baseBranch}`);
      }
      if (status.compatibility && !status.compatibility.compatible) {
        console.log(`\nWARNING: ${status.compatibility.reason}`);
      }
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
