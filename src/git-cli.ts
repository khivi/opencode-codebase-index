#!/usr/bin/env node
import * as path from "path";
import { execFileSync } from "child_process";
import { repoRoot, activeFiles, blobSha, loadHashes, saveHashes } from "./git/blobsha.js";
import { parseConfig } from "./config/schema.js";
import { createIndexer } from "./indexer/index.js";
import { runInstall } from "./commands/install.js";
import { loadPluginConfig } from "./commands/config-loader.js";
import { getMainRepoRoot } from "./utils/files.js";

function usage(): void {
  console.log(`Usage: codebase-index <command> [options]

Commands:
  install [--force]      Install git hooks (--force overwrites existing hooks)
  index [options]        Index the codebase (incremental by default)
  status [--files]       Show index status (--files lists indexed files)

Index options:
  --force                Full reindex (ignore caches)
  --diff <old> <new>     Only index files changed between two refs (used by hooks)

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
    case "install":
      runInstall(args.includes("--force"));
      break;

    case "index": {
      const force = args.includes("--force");
      const diffIdx = args.indexOf("--diff");
      const root = repoRoot();
      const mainRoot = getMainRepoRoot(root) ?? root;
      const rawConfig = loadPluginConfig(root);
      const config = parseConfig(rawConfig);

      if (diffIdx !== -1) {
        // Fast path for hooks: only index files that changed between two refs
        const oldRef = args[diffIdx + 1];
        const newRef = args[diffIdx + 2];
        if (!oldRef || !newRef) {
          console.error("Error: --diff requires two refs (e.g. --diff HEAD~1 HEAD)");
          process.exit(1);
        }

        const changedFiles = execFileSync(
          "git", ["diff", "--name-only", oldRef, newRef],
          { cwd: root, encoding: "utf-8" }
        ).trim().split("\n").filter(Boolean);

        if (changedFiles.length === 0) {
          console.log("0 files changed");
          break;
        }

        const indexer = createIndexer(root, config);
        await indexer.initialize();

        const stats = await indexer.index(progressCallback, changedFiles);

        if (stats.indexedChunks > 0 || stats.removedChunks > 0) {
          process.stdout.write("\n");
        }

        console.log(
          `${changedFiles.length} changed, ${stats.indexedChunks} chunks embedded, ` +
          `${stats.removedChunks} removed. ${(stats.durationMs / 1000).toFixed(1)}s`
        );
      } else if (!force) {
        // Incremental: check blob SHAs and skip if nothing changed
        const files = await activeFiles(root, config.include);
        const stored = loadHashes(mainRoot);
        const current: Record<string, string> = {};
        const changed: string[] = [];

        for (const file of files) {
          const sha = blobSha(file, root);
          current[file] = sha;
          if (stored[file] !== sha) {
            changed.push(file);
          }
        }

        const activeSet = new Set(files);
        const deleted = Object.keys(stored).filter((f) => !activeSet.has(f));

        if (changed.length === 0 && deleted.length === 0) {
          console.log(`${files.length} files checked, 0 reindexed, 0 deleted`);
          break;
        }

        const indexer = createIndexer(root, config);
        await indexer.initialize();

        const stats = await indexer.index(progressCallback);

        if (stats.indexedChunks > 0 || stats.removedChunks > 0) {
          process.stdout.write("\n");
        }

        // Update blob SHA hashes
        for (const d of deleted) {
          delete current[d];
        }
        saveHashes(mainRoot, current);

        console.log(
          `${files.length} files checked, ${changed.length} reindexed, ${deleted.length} deleted`
        );
      } else {
        // Full reindex
        const indexer = createIndexer(root, config);
        await indexer.initialize();

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
      }
      break;
    }

    case "status": {
      const showFiles = args.includes("--files");
      const root = repoRoot();
      const mainRoot = getMainRepoRoot(root) ?? root;
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
      if (root !== mainRoot) {
        console.log(`Worktree: ${root}`);
        console.log(`Main:    ${mainRoot}`);
      }
      if (status.compatibility && !status.compatibility.compatible) {
        console.log(`\nWARNING: ${status.compatibility.reason}`);
      }

      if (showFiles) {
        const fileCounts = await indexer.getIndexedFiles();
        const isWorktree = root !== mainRoot;

        let fileFilter: Set<string> | null = null;
        if (isWorktree) {
          // In a worktree: only show files changed from base branch
          try {
            const baseBranch = status.baseBranch ?? "main";
            const changed = execFileSync(
              "git", ["diff", "--name-only", baseBranch + "...HEAD"],
              { cwd: root, encoding: "utf-8" }
            ).trim().split("\n").filter(Boolean);
            fileFilter = new Set(changed);
          } catch {
            // Fallback to all files if diff fails
            fileFilter = null;
          }
        }

        const sorted = [...fileCounts.entries()]
          .filter(([fp]) => {
            const rel = path.relative(mainRoot, fp);
            return fileFilter ? fileFilter.has(rel) : true;
          })
          .sort((a, b) => a[0].localeCompare(b[0]));

        const label = isWorktree
          ? `Files changed from ${status.baseBranch ?? "main"}`
          : "Indexed files";
        console.log(`\n${label} (${sorted.length}):`);
        for (const [filePath, chunks] of sorted) {
          const rel = path.relative(mainRoot, filePath);
          console.log(`  ${rel}  (${chunks} chunks)`);
        }
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
