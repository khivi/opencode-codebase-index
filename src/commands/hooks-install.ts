import { existsSync, writeFileSync, chmodSync, readFileSync } from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { repoRoot } from "../git/blobsha.js";

const LOG = '"$REPO_ROOT/.opencode/index/hooks.log"';

const HOOKS: Record<string, string> = {
  "post-commit": `#!/bin/sh
REPO_ROOT=$(git rev-parse --show-toplevel) && node "$REPO_ROOT/node_modules/.bin/codebase-index" index --diff HEAD~1 HEAD >> ${LOG} 2>&1 &
`,
  "post-merge": `#!/bin/sh
REPO_ROOT=$(git rev-parse --show-toplevel) && node "$REPO_ROOT/node_modules/.bin/codebase-index" index --diff ORIG_HEAD HEAD >> ${LOG} 2>&1 &
`,
  "post-rewrite": `#!/bin/sh
REPO_ROOT=$(git rev-parse --show-toplevel) && node "$REPO_ROOT/node_modules/.bin/codebase-index" index --diff ORIG_HEAD HEAD >> ${LOG} 2>&1 &
`,
  "post-checkout": `#!/bin/sh
# Only run on branch switch (not file checkout)
[ "$3" = "1" ] || exit 0
REPO_ROOT=$(git rev-parse --show-toplevel) && node "$REPO_ROOT/node_modules/.bin/codebase-index" index --diff "$1" "$2" >> ${LOG} 2>&1 &
`,
};

export function runInstall(force = false): void {
  const root = repoRoot();
  // Use git-common-dir for worktree-aware hooks path
  const gitCommonDir = execSync("git rev-parse --git-common-dir", {
    cwd: root,
    encoding: "utf-8",
  }).trim();
  const resolvedGitDir = path.isAbsolute(gitCommonDir)
    ? gitCommonDir
    : path.resolve(root, gitCommonDir);
  const hooksDir = path.join(resolvedGitDir, "hooks");

  if (!existsSync(hooksDir)) {
    console.error(`Error: ${hooksDir} does not exist. Is this a git repo?`);
    process.exit(1);
  }

  for (const [hook, body] of Object.entries(HOOKS)) {
    const hookPath = path.join(hooksDir, hook);

    if (existsSync(hookPath) && !force) {
      const existing = readFileSync(hookPath, "utf-8");
      if (existing.includes("codebase-index")) {
        console.log(`${hook}: already installed, skipped`);
      } else {
        console.log(`${hook}: exists with different content, skipped`);
      }
    } else {
      writeFileSync(hookPath, body, { mode: 0o755 });
      console.log(`${hook}: ${force && existsSync(hookPath) ? "overwritten" : "written"}`);
    }
    chmodSync(hookPath, 0o755);
  }

  console.log("\nGit hooks installed successfully.");
}
