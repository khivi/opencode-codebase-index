import { repoRoot, activeFiles, blobSha, loadHashes, saveHashes } from "../git/blobsha.js";
import { Indexer } from "../indexer/index.js";
import { parseConfig } from "../config/schema.js";
import { loadPluginConfig } from "./config-loader.js";

export async function runIncremental(): Promise<void> {
  const root = repoRoot();
  const rawConfig = loadPluginConfig(root);
  const config = parseConfig(rawConfig);
  const files = activeFiles(root, config.include);
  const stored = loadHashes(root);
  const current: Record<string, string> = {};
  const changed: string[] = [];

  for (const file of files) {
    const sha = blobSha(file, root);
    current[file] = sha;
    if (stored[file] !== sha) {
      changed.push(file);
    }
  }

  // Find deleted files (in stored but not in active)
  const activeSet = new Set(files);
  const deleted = Object.keys(stored).filter((f) => !activeSet.has(f));

  if (changed.length === 0 && deleted.length === 0) {
    console.log(`${files.length} files checked, 0 reindexed, 0 deleted`);
    return;
  }

  // Initialize indexer and run full index (it handles incremental via file-hash cache internally)
  const indexer = new Indexer(root, config);
  await indexer.initialize();

  const stats = await indexer.index((progress) => {
    if (progress.phase === "embedding" && progress.totalChunks > 0) {
      process.stdout.write(
        `\rEmbedding: ${progress.chunksProcessed}/${progress.totalChunks} chunks`
      );
    }
  });

  if (stats.indexedChunks > 0 || stats.removedChunks > 0) {
    process.stdout.write("\n");
  }

  // Update blob SHA hashes
  // Remove deleted files from current
  for (const d of deleted) {
    delete current[d];
  }
  saveHashes(root, current);

  console.log(
    `${files.length} files checked, ${changed.length} reindexed, ${deleted.length} deleted`
  );
}
