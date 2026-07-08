import { createHash } from "node:crypto";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { createPathMatcher, type ProjectPathMatcher } from "./createPathMatcher";
import { DEFAULT_SCAN_RULES } from "@shared/config/scanRules";
import type { CZazaScanRules } from "@shared/types/config";

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_ENTRIES = 5000;

export type ProjectScanSignature = {
  entryCount: number;
  hash: string;
};

type ProjectScanSignatureOptions = {
  maxDepth?: number;
  maxEntries?: number;
  rules?: CZazaScanRules;
};

type SignatureContext = {
  entries: string[];
  visitedCount: number;
  maxDepth: number;
  maxEntries: number;
  isIgnored: ProjectPathMatcher;
  isCollapsed: ProjectPathMatcher;
};

export async function getProjectScanSignature(
  root: string,
  options: ProjectScanSignatureOptions = {},
): Promise<ProjectScanSignature> {
  const normalizedRoot = path.resolve(root);
  const context: SignatureContext = {
    entries: [
      "directory:.",
      `maxDepth:${options.maxDepth ?? DEFAULT_MAX_DEPTH}`,
      `maxEntries:${options.maxEntries ?? DEFAULT_MAX_ENTRIES}`,
      `ignore:${JSON.stringify(options.rules?.ignore ?? DEFAULT_SCAN_RULES.ignore)}`,
      `collapseOnly:${JSON.stringify(options.rules?.collapseOnly ?? DEFAULT_SCAN_RULES.collapseOnly)}`,
    ],
    visitedCount: 0,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    isIgnored: createPathMatcher(options.rules?.ignore ?? DEFAULT_SCAN_RULES.ignore),
    isCollapsed: createPathMatcher(options.rules?.collapseOnly ?? DEFAULT_SCAN_RULES.collapseOnly),
  };

  await collectSignatureEntries(normalizedRoot, normalizedRoot, 0, context);

  const sortedEntries = context.entries.sort();
  const hash = createHash("sha256").update(sortedEntries.join("\n")).digest("hex");

  return {
    entryCount: sortedEntries.length,
    hash,
  };
}

async function collectSignatureEntries(
  root: string,
  currentDir: string,
  depth: number,
  context: SignatureContext,
) {
  if (depth >= context.maxDepth || context.visitedCount >= context.maxEntries) {
    return;
  }

  const dirents = await readdir(currentDir, { withFileTypes: true });

  for (const dirent of dirents) {
    const absolutePath = path.join(currentDir, dirent.name);
    const relativePath = normalizePath(path.relative(root, absolutePath));
    const kind: "file" | "directory" = dirent.isDirectory() ? "directory" : "file";

    if (context.isIgnored(relativePath, kind)) {
      continue;
    }

    if (kind === "directory") {
      context.entries.push(`directory:${relativePath}`);

      if (context.visitedCount >= context.maxEntries) {
        break;
      }

      context.visitedCount++;

      if (!context.isCollapsed(relativePath, kind)) {
        await collectSignatureEntries(root, absolutePath, depth + 1, context);
      }

      continue;
    }

    if (kind === "file") {
      context.entries.push(`file:${relativePath}`);
    }
  }
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
