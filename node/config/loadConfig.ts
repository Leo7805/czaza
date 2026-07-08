import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { defaultConfig } from "./defaultConfig";
import type { CZazaConfig } from "@shared/types/config";

const CONFIG_DIR_NAME = ".czaza";
const CONFIG_FILE_NAME = "config.json";

/**
 * Loads CZaza config from the project workspace.
 *
 * A default config is created on first load so users can edit the rules
 * without adding another config file to the project root.
 */
export async function loadConfig(projectRoot: string): Promise<CZazaConfig> {
  const configPath = getConfigPath(projectRoot);

  if (!existsSync(configPath)) {
    await writeDefaultConfig(configPath);
    return defaultConfig;
  }

  const raw = await readFile(configPath, "utf-8");
  const userConfig = JSON.parse(raw) as Partial<CZazaConfig>;

  return {
    ...defaultConfig,
    ...userConfig,
    scan: {
      ...defaultConfig.scan,
      ...userConfig.scan,
      rules: {
        ...defaultConfig.scan.rules,
        ...userConfig.scan?.rules,
      },
    },
  };
}

export function getConfigPath(projectRoot: string): string {
  return path.resolve(projectRoot, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

async function writeDefaultConfig(configPath: string) {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`, "utf-8");
}
