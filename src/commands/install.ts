import { existsSync, writeFileSync, symlinkSync, lstatSync, chmodSync, readFileSync } from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { repoRoot } from "../git/blobsha.js";

const HOOK_BODY = `#!/bin/sh
REPO_ROOT=$(git rev-parse --show-toplevel) && node "$REPO_ROOT/node_modules/.bin/codebase-index" incremental &
`;

const POST_CHECKOUT_BODY = `#!/bin/sh
# Only run on branch switch (not file checkout)
[ "$3" = "1" ] || exit 0
REPO_ROOT=$(git rev-parse --show-toplevel) && node "$REPO_ROOT/node_modules/.bin/codebase-index" incremental &
`;

const SYMLINK_HOOKS = ["post-merge", "post-rewrite", "post-checkout"] as const;

export function runInstall(): void {
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

  // Write post-commit hook
  const postCommitPath = path.join(hooksDir, "post-commit");
  if (existsSync(postCommitPath)) {
    const existing = readFileSync(postCommitPath, "utf-8");
    if (existing.includes("codebase-index")) {
      console.log("post-commit: already installed, skipped");
    } else {
      console.log("post-commit: exists with different content, skipped");
    }
  } else {
    writeFileSync(postCommitPath, HOOK_BODY, { mode: 0o755 });
    console.log("post-commit: written");
  }
  chmodSync(postCommitPath, 0o755);

  // Create symlinks for post-merge and post-rewrite → post-commit
  // Handle post-checkout separately with branch switch guard
  for (const hook of SYMLINK_HOOKS) {
    const hookPath = path.join(hooksDir, hook);

    if (hook === "post-checkout") {
      if (existsSync(hookPath)) {
        const existing = readFileSync(hookPath, "utf-8");
        if (existing.includes("codebase-index")) {
          console.log(`${hook}: already installed, skipped`);
        } else {
          console.log(`${hook}: exists with different content, skipped`);
        }
      } else {
        writeFileSync(hookPath, POST_CHECKOUT_BODY, { mode: 0o755 });
        console.log(`${hook}: written (with branch switch guard)`);
      }
      chmodSync(hookPath, 0o755);
      continue;
    }

    if (existsSync(hookPath) || lstatExists(hookPath)) {
      console.log(`${hook}: already exists, skipped`);
    } else {
      symlinkSync("post-commit", hookPath);
      console.log(`${hook}: symlinked → post-commit`);
    }
    if (existsSync(hookPath)) {
      chmodSync(hookPath, 0o755);
    }
  }

  console.log("\nGit hooks installed successfully.");
}

function lstatExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}
