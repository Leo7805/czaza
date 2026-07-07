import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { defaultConfig } from "./defaultConfig";
import type { CZazaConfig } from "@shared/types/config";

const CONFIG_FILE_NAME = "czaza.config.json";

/**
 * Loads CZaza config from the current working directory.
 */
export async function loadConfig(projectRoot: string): Promise<CZazaConfig> {
  const configPath = path.resolve(projectRoot, CONFIG_FILE_NAME);

  if (!existsSync(configPath)) {
    return defaultConfig;
  }

  const raw = await readFile(configPath, "utf-8");
  const userConfig = JSON.parse(raw) as Partial<CZazaConfig>;

  return {
    ...defaultConfig,
    ...userConfig,
  };
}
