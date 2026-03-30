import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Mock os.homedir before config-loader imports it, to prevent global config leaking
let mockHome = "/tmp";
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return { ...actual, homedir: () => mockHome };
});

import { loadPluginConfig } from "../src/commands/config-loader.js";

describe("config-loader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-loader-test-"));
    mockHome = tempDir;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return empty object when no config files exist", () => {
    expect(loadPluginConfig(tempDir)).toEqual({});
  });

  it("should load project-level config from .opencode/codebase-index.json", () => {
    const configDir = path.join(tempDir, ".opencode");
    fs.mkdirSync(configDir, { recursive: true });
    const config = { include: ["**/*.ts"], provider: "openai" };
    fs.writeFileSync(
      path.join(configDir, "codebase-index.json"),
      JSON.stringify(config)
    );

    expect(loadPluginConfig(tempDir)).toEqual(config);
  });

  it("should prefer project config over global config", () => {
    // Create project config
    const projectConfigDir = path.join(tempDir, ".opencode");
    fs.mkdirSync(projectConfigDir, { recursive: true });
    const projectConfig = { include: ["**/*.ts"] };
    fs.writeFileSync(
      path.join(projectConfigDir, "codebase-index.json"),
      JSON.stringify(projectConfig)
    );

    // Project config should be returned even if global exists
    expect(loadPluginConfig(tempDir)).toEqual(projectConfig);
  });

  it("should return empty object for invalid JSON in config", () => {
    const configDir = path.join(tempDir, ".opencode");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "codebase-index.json"),
      "not valid json"
    );

    expect(loadPluginConfig(tempDir)).toEqual({});
  });
});
