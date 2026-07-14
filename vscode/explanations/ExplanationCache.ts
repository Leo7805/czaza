/**
 * Persists legacy explanation results between VS Code extension sessions.
 */

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as vscode from "vscode";
import type { CodeExplanation } from "@shared/types/codeExplanation";
import type { LineUnit } from "@shared/types/lineUnit";
import type { SemanticUnit } from "@shared/types/semanticUnit";
import { ExplanationStore, type FileExplanationState } from "./ExplanationStore";

const CACHE_DIR_NAME = ".czaza";
const CACHE_FILE_NAME = "explanations-cache.json";

type CachedFileExplanation = {
  fileStructure?: CodeExplanation;
  semanticUnits?: SemanticUnit[];
  lineUnits?: LineUnit[];
};

type ExplanationCacheFile = {
  version: 1;
  updatedAt: string;
  root: string;
  files: Record<string, CachedFileExplanation>;
};

/**
 * Loads and saves legacy explanation state from `.czaza/explanations-cache.json`.
 *
 * This cache is separate from the newer workspace note store. It exists to keep
 * the legacy explanation panel usable across VS Code reloads by serializing the
 * in-memory {@link ExplanationStore}.
 *
 * @example
 * const cache = new ExplanationCache();
 * await cache.loadForUri(document.uri, store);
 */
export class ExplanationCache {
  /**
   * Loads cached explanation state for one URI into an explanation store.
   *
   * Non-file resources and files outside a VS Code workspace are ignored.
   *
   * @param uri - VS Code resource URI to load.
   * @param store - In-memory explanation store that receives the cached state.
   *
   * @example
   * await cache.loadForUri(document.uri, store);
   */
  async loadForUri(uri: vscode.Uri, store: ExplanationStore): Promise<void> {
    const workspace = vscode.workspace.getWorkspaceFolder(uri);

    if (!workspace || uri.scheme !== "file") {
      return;
    }

    const cache = await readExplanationCache(workspace.uri.fsPath);
    const key = getRelativeKey(workspace.uri.fsPath, uri.fsPath);
    const cached = cache?.files[key];

    if (!cached) {
      return;
    }

    store.setState(uri, fromCachedFileExplanation(cached));
  }

  /**
   * Saves one URI's current explanation state from memory to disk.
   *
   * Non-file resources, files outside a VS Code workspace, and URIs without
   * in-memory state are ignored.
   *
   * @param uri - VS Code resource URI to save.
   * @param store - In-memory explanation store that provides the current state.
   *
   * @example
   * await cache.saveForUri(document.uri, store);
   */
  async saveForUri(uri: vscode.Uri, store: ExplanationStore): Promise<void> {
    const workspace = vscode.workspace.getWorkspaceFolder(uri);
    const state = store.get(uri);

    if (!workspace || uri.scheme !== "file" || !state) {
      return;
    }

    const root = workspace.uri.fsPath;
    const cache = (await readExplanationCache(root)) ?? createEmptyCache(root);
    const key = getRelativeKey(root, uri.fsPath);
    cache.files[key] = toCachedFileExplanation(state);
    cache.updatedAt = new Date().toISOString();
    await writeExplanationCache(root, cache);
  }
}

function fromCachedFileExplanation(cached: CachedFileExplanation): FileExplanationState {
  return {
    fileStructure: cached.fileStructure,
    semanticUnits: cached.semanticUnits ?? [],
    lineUnitsByLine: new Map((cached.lineUnits ?? []).map((lineUnit) => [lineUnit.lineNumber, lineUnit])),
  };
}

function toCachedFileExplanation(state: FileExplanationState): CachedFileExplanation {
  return {
    fileStructure: state.fileStructure,
    semanticUnits: state.semanticUnits,
    lineUnits: [...state.lineUnitsByLine.values()].sort((a, b) => a.lineNumber - b.lineNumber),
  };
}

async function readExplanationCache(root: string): Promise<ExplanationCacheFile | null> {
  try {
    const raw = await readFile(getCachePath(root), "utf-8");
    const cache = JSON.parse(raw) as Partial<ExplanationCacheFile>;

    if (cache.version !== 1 || typeof cache.root !== "string" || !cache.files) {
      return null;
    }

    return cache as ExplanationCacheFile;
  } catch {
    return null;
  }
}

async function writeExplanationCache(root: string, cache: ExplanationCacheFile) {
  const cachePath = getCachePath(root);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
}

function createEmptyCache(root: string): ExplanationCacheFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    root: normalizePath(path.resolve(root)),
    files: {},
  };
}

function getCachePath(root: string): string {
  return path.join(root, CACHE_DIR_NAME, CACHE_FILE_NAME);
}

function getRelativeKey(root: string, fsPath: string): string {
  return normalizePath(path.relative(root, fsPath)) || ".";
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
