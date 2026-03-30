import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

// Mock repoRoot to point to our temp git repo
vi.mock("../src/git/blobsha.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/git/blobsha.js")>();
  return {
    ...actual,
    repoRoot: () => {
      // Will be overridden per test via mockReturnValue
      return (globalThis as Record<string, string>).__testRepoRoot ?? "/tmp";
    },
  };
});

import { runInstall } from "../src/commands/hooks-install.js";

describe("install command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "install-test-"));
    execSync("git init", { cwd: tempDir });
    execSync("git config user.email test@test.com", { cwd: tempDir });
    execSync("git config user.name Test", { cwd: tempDir });
    (globalThis as Record<string, string>).__testRepoRoot = tempDir;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete (globalThis as Record<string, string>).__testRepoRoot;
  });

  it("should create post-commit hook", () => {
    runInstall();
    const hookPath = path.join(tempDir, ".git", "hooks", "post-commit");
    expect(fs.existsSync(hookPath)).toBe(true);
    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).toContain("codebase-index");
    expect(content).toContain("#!/bin/sh");
  });

  it("should create post-checkout hook with branch switch guard", () => {
    runInstall();
    const hookPath = path.join(tempDir, ".git", "hooks", "post-checkout");
    expect(fs.existsSync(hookPath)).toBe(true);
    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).toContain('[ "$3" = "1" ] || exit 0');
    expect(content).toContain("codebase-index");
  });

  it("should create post-merge and post-rewrite hooks with ORIG_HEAD diff", () => {
    runInstall();
    const hooksDir = path.join(tempDir, ".git", "hooks");

    for (const hook of ["post-merge", "post-rewrite"]) {
      const hookPath = path.join(hooksDir, hook);
      expect(fs.existsSync(hookPath)).toBe(true);
      const content = fs.readFileSync(hookPath, "utf-8");
      expect(content).toContain("codebase-index");
      expect(content).toContain("ORIG_HEAD");
    }
  });

  it("should make hooks executable", () => {
    runInstall();
    const hookPath = path.join(tempDir, ".git", "hooks", "post-commit");
    const stat = fs.statSync(hookPath);
    // Check owner execute bit
    expect(stat.mode & 0o100).toBeTruthy();
  });

  it("should be idempotent - running twice does not fail", () => {
    runInstall();
    // Should not throw
    expect(() => runInstall()).not.toThrow();
  });

  it("should skip post-commit if it already contains codebase-index", () => {
    const consoleSpy = vi.spyOn(console, "log");
    runInstall();
    consoleSpy.mockClear();
    runInstall();

    const messages = consoleSpy.mock.calls.flat().join("\n");
    expect(messages).toContain("already installed");
    consoleSpy.mockRestore();
  });

  it("should skip post-commit if it exists with different content", () => {
    const hookPath = path.join(tempDir, ".git", "hooks", "post-commit");
    fs.writeFileSync(hookPath, "#!/bin/sh\necho custom hook\n", {
      mode: 0o755,
    });

    const consoleSpy = vi.spyOn(console, "log");
    runInstall();

    const messages = consoleSpy.mock.calls.flat().join("\n");
    expect(messages).toContain("exists with different content");
    // Should not overwrite
    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).toContain("custom hook");
    consoleSpy.mockRestore();
  });
});
