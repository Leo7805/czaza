import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { scanProjectTree } from "@node/scan/scanProjectTree";
import { printProjectTreeDebug } from "@node/scan/scanProjectTreeDebug";
import type { ProjectTreeUnit } from "@shared/types/projectTreeUnit";

describe("scanProjectTree()", () => {
  const fixtureRoot = path.resolve(__dirname, "../fixtures/sample-project");

  let tree: ProjectTreeUnit;
  let src: ProjectTreeUnit | undefined;
  let nodeModules: ProjectTreeUnit | undefined;
  let assets: ProjectTreeUnit | undefined;
  let emptyDir: ProjectTreeUnit | undefined;

  beforeAll(async () => {
    tree = await scanProjectTree(fixtureRoot);

    src = tree.children?.find((unit) => unit.name === "src");
    nodeModules = tree.children?.find((unit) => unit.name === "node_modules");
    assets = tree.children?.find((unit) => unit.name === "assets");
    emptyDir = tree.children?.find((unit) => unit.name === "empty");
  });

  it("should scan the project tree", () => {
    printProjectTreeDebug(tree);

    expect(tree).toBeDefined();
    expect(tree.kind).toBe("directory");
    expect(tree.name).toBe("sample-project");
    expect(tree.children).toBeDefined();
    expect(tree.children!.length).toBeGreaterThan(0);
  });

  it("should hide ignored paths", () => {
    expect(JSON.stringify(tree)).not.toContain(".git");
  });

  it("should collapse dependency directories without children", () => {
    expect(nodeModules).toBeDefined();
    expect(nodeModules?.kind).toBe("directory");
    expect(nodeModules?.status).toBe("collapsed");
    expect("children" in nodeModules!).toBe(false);
  });

  it("should collapse configured asset directories without children", () => {
    expect(assets).toBeDefined();
    expect(assets?.kind).toBe("directory");
    expect(assets?.status).toBe("collapsed");
    expect("children" in assets!).toBe(false);
  });

  it("should include authored source files", () => {
    expect(src).toBeDefined();
    expect(src?.children?.some((child) => child.name === "App.tsx")).toBe(true);
    expect(src?.children?.some((child) => child.name === "main.tsx")).toBe(true);
  });

  it("does not add children to files", () => {
    const appFile = src?.children?.find((child) => child.name === "App.tsx");

    expect(appFile).toBeDefined();
    expect(appFile?.kind).toBe("file");
    expect("children" in appFile!).toBe(false);
  });

  it("keeps empty scanned directories with empty children", () => {
    expect(emptyDir).toBeDefined();
    expect(emptyDir?.kind).toBe("directory");
    expect(emptyDir?.status).toBe("normal");
    expect(emptyDir?.children).toEqual([]);
  });

  it("debug current project tree", async () => {
    const projectRoot = path.resolve(__dirname, "../..");
    const currentProjectTree = await scanProjectTree(projectRoot, {
      maxDepth: 5,
      maxEntries: 1000,
    });

    printProjectTreeDebug(currentProjectTree);

    expect(currentProjectTree.name).toBe("czaza");
  });
});
