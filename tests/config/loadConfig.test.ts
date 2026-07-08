import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getConfigPath, loadConfig } from "@node/config/loadConfig";

describe("loadConfig()", () => {
  it("creates and loads default config when no project config exists", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "czaza-config-"));

    const config = await loadConfig(projectRoot);
    const rawConfig = await readFile(getConfigPath(projectRoot), "utf-8");
    const savedConfig = JSON.parse(rawConfig);

    expect(config.language).toBe("en");
    expect(config.outDir).toBe(".czaza");
    expect(config.scan.maxDepth).toBe(8);
    expect(config.scan.rules.ignore).not.toContain(".czaza/");
    expect(config.scan.rules.ignore).not.toContain("node_modules/");
    expect(config.scan.rules.collapseOnly).toContain("node_modules/");
    expect(savedConfig.scan.rules.collapseOnly).toContain("dist/");
  });

  it("merges project config over defaults", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "czaza-config-"));
    const configPath = getConfigPath(projectRoot);

    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify(
        {
          language: "en",
          scan: {
            maxDepth: 3,
            rules: {
              ignore: ["**/.custom-cache/**"],
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const config = await loadConfig(projectRoot);

    expect(config.language).toBe("en");
    expect(config.outDir).toBe(".czaza");
    expect(config.scan.maxDepth).toBe(3);
    expect(config.scan.maxEntries).toBe(5000);
    expect(config.scan.rules.ignore).toEqual(["**/.custom-cache/**"]);
    expect(config.scan.rules.collapseOnly).toContain("dist/");
  });
});
