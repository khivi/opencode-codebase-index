#!/usr/bin/env node
import { execFileSync, execSync, spawn } from "child_process";
import { repoRoot } from "./git/blobsha.js";
import { parseConfig } from "./config/schema.js";
import { createIndexer } from "./indexer/index.js";
import { runInstall } from "./commands/hooks-install.js";
import { loadPluginConfig } from "./commands/config-loader.js";
import { getMainRepoRoot } from "./utils/files.js";

function usage(): void {
  console.log(`Usage: codebase-index <command> [options]

Commands:
  install [--force]        Install git hooks (--force overwrites existing)
  index [--force]          Index the codebase (--force rebuilds from scratch)
  serve [--restart]        Start MCP server (--restart kills existing first)
  status                   Show index status

Internal (used by hooks):
  index --diff <old> <new> Index only changed files between two refs

All commands except 'index --diff' must be run from the main repo, not a worktree.`);
}

function progressCallback(progress: { phase: string; chunksProcessed: number; totalChunks: number }): void {
  if (progress.phase === "embedding" && progress.totalChunks > 0) {
    process.stdout.write(
      `\rEmbedding: ${progress.chunksProcessed}/${progress.totalChunks} chunks`
    );
  }
}

function ensureMainRepo(root: string): string {
  const mainRoot = getMainRepoRoot(root) ?? root;
  if (root !== mainRoot) {
    console.error(`Error: Run this command from the main repo, not a worktree.`);
    console.error(`  Main repo: ${mainRoot}`);
    console.error(`  Worktree:  ${root}`);
    process.exit(1);
  }
  return root;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    usage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "install": {
      const root = repoRoot();
      ensureMainRepo(root);
      runInstall(args.includes("--force"));
      break;
    }

    case "index": {
      const diffIdx = args.indexOf("--diff");

      if (diffIdx !== -1) {
        // Hook entrypoint: index only changed files (runs from any worktree)
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
      } else {
        // Full index from main repo
        const root = repoRoot();
        ensureMainRepo(root);

        const rawConfig = loadPluginConfig(root);
        const config = parseConfig(rawConfig);
        const indexer = createIndexer(root, config);
        await indexer.initialize();

        if (args.includes("--force")) {
          await indexer.clearIndex();
        }

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

        // Prune branches that no longer exist in git
        const pruned = await indexer.pruneBranches();
        if (pruned.length > 0) {
          console.log(`Pruned ${pruned.length} stale branches: ${pruned.join(", ")}`);
        }
      }
      break;
    }

    case "serve": {
      const root = repoRoot();
      ensureMainRepo(root);

      if (args.includes("--restart")) {
        // Kill existing MCP server processes for this project
        try {
          const pids = execSync(
            `pgrep -f "opencode-codebase-index-mcp.*--project.*${root}" 2>/dev/null || true`,
            { encoding: "utf-8" }
          ).trim();
          if (pids) {
            for (const pid of pids.split("\n").filter(Boolean)) {
              try { process.kill(parseInt(pid)); } catch { /* already dead */ }
            }
            console.log("Stopped existing MCP server.");
          }
        } catch { /* no existing process */ }
      }

      // Start MCP server in background
      const child = spawn(
        "opencode-codebase-index-mcp",
        ["--project", root],
        { detached: true, stdio: "ignore" }
      );
      child.unref();

      console.log(`MCP server started (pid ${child.pid}) for ${root}`);
      break;
    }

    case "status": {
      const root = repoRoot();
      ensureMainRepo(root);

      const rawConfig = loadPluginConfig(root);
      const config = parseConfig(rawConfig);
      const indexer = createIndexer(root, config);
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
