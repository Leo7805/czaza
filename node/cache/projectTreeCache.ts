import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadConfig } from "@node/config/loadConfig";
import { scanProjectTree } from "@node/scan/scanProjectTree";
import {
  getProjectScanSignature,
  type ProjectScanSignature,
} from "@node/scan/getProjectScanSignature";
import type { ProjectTreeUnit } from "@shared/types/projectTreeUnit";

const CACHE_DIR_NAME = ".czaza";
const CACHE_FILE_NAME = "project-tree-cache.json";

export type ProjectTreeCache = {
  version: 1;
  scannedAt: string;
  root: string;
  signature: ProjectScanSignature;
  tree: ProjectTreeUnit;
};

export type ProjectTreeState = {
  tree: ProjectTreeUnit;
  signature: ProjectScanSignature;
  source: "cache" | "scan";
};

export async function loadProjectTreeState(root: string): Promise<ProjectTreeState> {
  const normalizedRoot = path.resolve(root);
  const config = await loadConfig(normalizedRoot);
  const scanOptions = {
    maxDepth: config.scan.maxDepth,
    maxEntries: config.scan.maxEntries,
    rules: config.scan.rules,
  };
  const signature = await getProjectScanSignature(normalizedRoot, scanOptions);
  const cache = await readProjectTreeCache(normalizedRoot);

  if (cache && cache.root === normalizeFsPath(normalizedRoot) && signaturesEqual(cache.signature, signature)) {
    return {
      tree: cache.tree,
      signature,
      source: "cache",
    };
  }

  const cachedDescriptions = cache ? collectDescriptionsByPath(cache.tree) : new Map<string, string>();
  const tree = await scanProjectTree(normalizedRoot, scanOptions);
  applyDescriptionsByPath(tree, cachedDescriptions);

  await saveProjectTreeState(normalizedRoot, {
    tree,
    signature,
    source: "scan",
  });

  return {
    tree,
    signature,
    source: "scan",
  };
}

export async function saveProjectTreeState(root: string, state: ProjectTreeState) {
  const normalizedRoot = path.resolve(root);
  const cachePath = getProjectTreeCachePath(normalizedRoot);
  await mkdir(path.dirname(cachePath), { recursive: true });

  const cache: ProjectTreeCache = {
    version: 1,
    scannedAt: new Date().toISOString(),
    root: normalizeFsPath(normalizedRoot),
    signature: state.signature,
    tree: state.tree,
  };

  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
}

async function readProjectTreeCache(root: string): Promise<ProjectTreeCache | null> {
  try {
    const raw = await readFile(getProjectTreeCachePath(root), "utf-8");
    const cache = JSON.parse(raw) as Partial<ProjectTreeCache>;

    if (
      cache.version !== 1 ||
      typeof cache.root !== "string" ||
      !cache.tree ||
      !cache.signature ||
      typeof cache.signature.hash !== "string" ||
      typeof cache.signature.entryCount !== "number"
    ) {
      return null;
    }

    return cache as ProjectTreeCache;
  } catch {
    return null;
  }
}

function collectDescriptionsByPath(root: ProjectTreeUnit): Map<string, string> {
  const descriptions = new Map<string, string>();

  function visit(unit: ProjectTreeUnit) {
    if (unit.description?.trim()) {
      descriptions.set(unit.path, unit.description);
    }

    for (const child of unit.children ?? []) {
      visit(child);
    }
  }

  visit(root);

  return descriptions;
}

function applyDescriptionsByPath(root: ProjectTreeUnit, descriptions: Map<string, string>) {
  function visit(unit: ProjectTreeUnit) {
    const description = descriptions.get(unit.path);

    if (description) {
      unit.description = description;
    }

    for (const child of unit.children ?? []) {
      visit(child);
    }
  }

  visit(root);
}

function signaturesEqual(a: ProjectScanSignature, b: ProjectScanSignature): boolean {
  return a.entryCount === b.entryCount && a.hash === b.hash;
}

function getProjectTreeCachePath(root: string): string {
  return path.join(root, CACHE_DIR_NAME, CACHE_FILE_NAME);
}

function normalizeFsPath(fsPath: string): string {
  return normalizePath(path.resolve(fsPath));
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
