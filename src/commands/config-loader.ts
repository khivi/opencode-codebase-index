import { existsSync, readFileSync } from "fs";
import * as path from "path";
import * as os from "os";

function loadJsonFile(filePath: string): unknown {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    }
  } catch { /* ignore */ }
  return null;
}

export function loadPluginConfig(projectRoot: string): unknown {
  const projectConfig = loadJsonFile(path.join(projectRoot, ".opencode", "codebase-index.json"));
  if (projectConfig) return projectConfig;

  const globalConfig = loadJsonFile(path.join(os.homedir(), ".config", "opencode", "codebase-index.json"));
  if (globalConfig) return globalConfig;

  return {};
}
