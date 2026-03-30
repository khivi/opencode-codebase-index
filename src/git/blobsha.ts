import { execSync, execFileSync, spawn } from "child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import { createInterface } from "readline";
import { createIgnoreFilter } from "../utils/files.js";

// Extract file extensions from config include glob patterns.
function extractExtensions(includePatterns: string[]): Set<string> {
  const exts = new Set<string>();
  for (const pattern of includePatterns) {
    // Match **/*.{ts,tsx,js,jsx} style
    const braceMatch = pattern.match(/\*\.?\{([^}]+)\}/);
    if (braceMatch) {
      for (const ext of braceMatch[1].split(",")) {
        exts.add(`.${ext.trim()}`);
      }
      continue;
    }
    // Match **/*.py style
    const singleMatch = pattern.match(/\*\.(\w+)$/);
    if (singleMatch) {
      exts.add(`.${singleMatch[1]}`);
    }
  }
  return exts;
}

export function gitLines(args: string[], cwd: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const lines: string[] = [];
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => { if (line) lines.push(line); });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`git ${args[0]} failed (${code}): ${stderr.trim()}`));
      else resolve(lines);
    });
    child.on("error", reject);
  });
}

export function repoRoot(): string {
  return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
}

export async function activeFiles(root: string, includePatterns: string[]): Promise<string[]> {
  const lines = await gitLines(["ls-files"], root);
  const exts = extractExtensions(includePatterns);
  const ig = createIgnoreFilter(root);
  return lines.filter((f) => exts.has(path.extname(f)) && !ig.ignores(f) && existsSync(path.join(root, f)));
}

export function blobSha(filepath: string, root: string): string {
  return execFileSync("git", ["hash-object", filepath], {
    cwd: root,
    encoding: "utf-8",
  }).trim();
}

function hashesPath(root: string): string {
  return path.join(root, ".opencode", "index", "file-hashes.json");
}

export function loadHashes(root: string): Record<string, string> {
  const p = hashesPath(root);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveHashes(root: string, hashes: Record<string, string>): void {
  const p = hashesPath(root);
  const dir = path.dirname(p);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(p, JSON.stringify(hashes, null, 2));
}
