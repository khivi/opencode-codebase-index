import { execSync } from "child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import * as path from "path";

const EXTENSIONS = [".py", ".ts", ".js", ".go", ".rs", ".java", ".cs", ".rb"];

export function repoRoot(): string {
  return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
}

export function activeFiles(root: string): string[] {
  const output = execSync("git ls-files", { cwd: root, encoding: "utf-8" });
  return output
    .split("\n")
    .filter((f) => f.length > 0 && EXTENSIONS.includes(path.extname(f)));
}

export function blobSha(filepath: string, root: string): string {
  return execSync(`git hash-object ${JSON.stringify(filepath)}`, {
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
