import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import {
  repoRoot,
  activeFiles,
  blobSha,
  loadHashes,
  saveHashes,
} from "../src/git/blobsha.js";

describe("blobsha utilities", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "blobsha-test-"));
    // Initialize a real git repo for tests that need it
    execSync("git init", { cwd: tempDir });
    execSync("git config user.email test@test.com", { cwd: tempDir });
    execSync("git config user.name Test", { cwd: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("repoRoot", () => {
    it("should return the repo root when inside a git repo", () => {
      const subdir = path.join(tempDir, "a", "b");
      fs.mkdirSync(subdir, { recursive: true });
      const root = execSync("git rev-parse --show-toplevel", {
        cwd: subdir,
        encoding: "utf-8",
      }).trim();
      expect(root).toBe(
        execSync("git rev-parse --show-toplevel", {
          cwd: tempDir,
          encoding: "utf-8",
        }).trim()
      );
    });
  });

  describe("activeFiles", () => {
    it("should return tracked files matching include patterns", async () => {
      fs.writeFileSync(path.join(tempDir, "app.ts"), "const x = 1;");
      fs.writeFileSync(path.join(tempDir, "app.js"), "var x = 1;");
      fs.writeFileSync(path.join(tempDir, "readme.md"), "# Hello");
      execSync("git add -A && git commit -m init", { cwd: tempDir });

      const files = await activeFiles(tempDir, ["**/*.{ts,js}"]);
      expect(files).toContain("app.ts");
      expect(files).toContain("app.js");
      expect(files).not.toContain("readme.md");
    });

    it("should return empty array when no files match", async () => {
      fs.writeFileSync(path.join(tempDir, "readme.md"), "# Hello");
      execSync("git add -A && git commit -m init", { cwd: tempDir });

      const files = await activeFiles(tempDir, ["**/*.py"]);
      expect(files).toEqual([]);
    });

    it("should handle single extension patterns", async () => {
      fs.writeFileSync(path.join(tempDir, "main.py"), "print('hi')");
      fs.writeFileSync(path.join(tempDir, "app.ts"), "const x = 1;");
      execSync("git add -A && git commit -m init", { cwd: tempDir });

      const files = await activeFiles(tempDir, ["**/*.py"]);
      expect(files).toContain("main.py");
      expect(files).not.toContain("app.ts");
    });

    it("should handle nested files", async () => {
      const subdir = path.join(tempDir, "src", "utils");
      fs.mkdirSync(subdir, { recursive: true });
      fs.writeFileSync(path.join(subdir, "helper.ts"), "export {}");
      execSync("git add -A && git commit -m init", { cwd: tempDir });

      const files = await activeFiles(tempDir, ["**/*.ts"]);
      expect(files).toContain("src/utils/helper.ts");
    });
  });

  describe("blobSha", () => {
    it("should return consistent SHA for same content", () => {
      fs.writeFileSync(path.join(tempDir, "test.txt"), "hello world");
      const sha1 = blobSha("test.txt", tempDir);
      const sha2 = blobSha("test.txt", tempDir);
      expect(sha1).toBe(sha2);
      expect(sha1).toMatch(/^[a-f0-9]{40}$/);
    });

    it("should return different SHA for different content", () => {
      fs.writeFileSync(path.join(tempDir, "a.txt"), "hello");
      fs.writeFileSync(path.join(tempDir, "b.txt"), "world");
      const sha1 = blobSha("a.txt", tempDir);
      const sha2 = blobSha("b.txt", tempDir);
      expect(sha1).not.toBe(sha2);
    });
  });

  describe("loadHashes / saveHashes", () => {
    it("should return empty object when no hashes file exists", () => {
      expect(loadHashes(tempDir)).toEqual({});
    });

    it("should round-trip hashes correctly", () => {
      const hashes = { "src/app.ts": "abc123", "src/lib.ts": "def456" };
      saveHashes(tempDir, hashes);
      expect(loadHashes(tempDir)).toEqual(hashes);
    });

    it("should create directories if they do not exist", () => {
      const hashDir = path.join(tempDir, ".opencode", "index");
      expect(fs.existsSync(hashDir)).toBe(false);
      saveHashes(tempDir, { "file.ts": "abc" });
      expect(fs.existsSync(hashDir)).toBe(true);
    });

    it("should overwrite previous hashes", () => {
      saveHashes(tempDir, { "a.ts": "111" });
      saveHashes(tempDir, { "b.ts": "222" });
      const result = loadHashes(tempDir);
      expect(result).toEqual({ "b.ts": "222" });
      expect(result).not.toHaveProperty("a.ts");
    });

    it("should handle corrupted hashes file gracefully", () => {
      const hashDir = path.join(tempDir, ".opencode", "index");
      fs.mkdirSync(hashDir, { recursive: true });
      fs.writeFileSync(path.join(hashDir, "file-hashes.json"), "not json{{{");
      expect(loadHashes(tempDir)).toEqual({});
    });
  });
});
