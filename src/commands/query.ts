import { repoRoot, activeFiles } from "../git/blobsha.js";
import { Indexer } from "../indexer/index.js";
import { parseConfig } from "../config/schema.js";
import { loadPluginConfig } from "./config-loader.js";
import * as path from "path";

export async function runQuery(queryText: string, limit: number): Promise<void> {
  const root = repoRoot();
  const rawConfig = loadPluginConfig(root);
  const config = parseConfig(rawConfig);
  const indexer = new Indexer(root, config);
  await indexer.initialize();

  const results = await indexer.search(queryText, limit * 2);

  // Filter to only files in current worktree's activeFiles
  const active = new Set(activeFiles(root, config.include));

  const filtered = results.filter((r) => {
    const rel = path.relative(root, r.filePath);
    return active.has(rel);
  });

  const limited = filtered.slice(0, limit);

  if (limited.length === 0) {
    console.log("No results found.");
    return;
  }

  for (const r of limited) {
    const rel = path.relative(root, r.filePath);
    const name = r.name ?? "(anonymous)";
    console.log(`${rel}:${r.startLine}  ${name}  ${r.score.toFixed(3)}`);
  }
}
