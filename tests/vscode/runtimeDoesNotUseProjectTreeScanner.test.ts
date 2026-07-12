/**
 * Guards the VS Code extension runtime against accidentally reconnecting the
 * custom Project Tree scanner.
 *
 * The scanner implementation and tests are intentionally kept for future
 * project-level features, but extension activation and the Description webview
 * must rely on VS Code Explorer/active editor URIs instead of scanning the
 * workspace tree.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

describe("VS Code runtime Project Tree scanner isolation", () => {
  it("does not connect scanner code from extension activation", async () => {
    const source = await readProjectFile("vscode/extension.ts");

    expect(source).not.toContain("scanProjectTree");
    expect(source).not.toContain("loadProjectTreeState");
    expect(source).not.toContain("projectTreeCache");
  });

  it("does not generate scanner config from explanation commands", async () => {
    const source = await readProjectFile("vscode/explanations/registerExplanationCommands.ts");

    expect(source).not.toContain("loadConfig");
    expect(source).not.toContain("DEFAULT_SCAN_RULES");
    expect(source).not.toContain("collapseOnly");
    expect(source).not.toContain("maxDepth");
    expect(source).not.toContain("maxEntries");
  });

  it("does not load project tree cache when opening the Description webview", async () => {
    const source = await readProjectFile("vscode/webview/CzazaViewProvider.ts");

    expect(source).not.toContain("scanProjectTree");
    expect(source).not.toContain("loadProjectTreeState");
    expect(source).not.toContain("ProjectTreeUnit");
    expect(source).not.toContain("refreshProjectTreeIndex");
  });

  it("keeps the webview free of custom project tree UI hooks", async () => {
    const files = await Promise.all([
      readProjectFile("vscode/webview/descriptionView.html"),
      readProjectFile("vscode/webview/descriptionView.js"),
      readProjectFile("vscode/webview/descriptionView.css"),
    ]);
    const webviewSource = files.join("\n");

    expect(webviewSource).not.toContain("projectTree");
    expect(webviewSource).not.toContain("project-tree");
    expect(webviewSource).not.toContain("Project Tree");
  });
});
