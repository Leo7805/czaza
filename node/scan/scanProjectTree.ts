import path from "node:path";
import { readdir } from "node:fs/promises";
import picomatch from "picomatch";
import { DEFAULT_SCAN_RULES } from "@shared/config/scanRules";
import type {
  ProjectTreeCategory,
  ProjectTreeUnit,
  ProjectTreeStatus,
} from "@shared/types/projectTreeUnit";

const DEFAULT_MAX_DEPTH = 8; // Maximum depth of directories to scan before stopping.
const DEFAULT_MAX_ENTRIES = 5000; // Maximum number of files and directories to scan before stopping.

const isIgnored = picomatch([...DEFAULT_SCAN_RULES.ignore]);
const isCollapsed = picomatch([...DEFAULT_SCAN_RULES.collapseOnly]);

type ScanProjectTreeOptions = {
  maxDepth?: number;
  maxEntries?: number;
};

type ScanProjectTreeContext = {
  visitedCount: number;
  maxDepth: number;
  maxEntries: number;
};

/**
 * Scans a project root and builds a tree for Project Map generation.
 */
export async function scanProjectTree(
  root: string,
  options: ScanProjectTreeOptions = {},
): Promise<ProjectTreeUnit> {
  const normalizedRoot = path.resolve(root);

  const context: ScanProjectTreeContext = {
    visitedCount: 0,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
  };

  return {
    id: ".",
    kind: "directory",
    category: "authored",
    status: "normal",
    path: ".",
    name: path.basename(normalizedRoot),
    children: await scanDirectory(normalizedRoot, normalizedRoot, 0, context),
  };
}

/**
 * Recursively scans one directory and returns its direct children.
 */
async function scanDirectory(
  root: string,
  currentDir: string,
  depth: number,
  context: ScanProjectTreeContext,
): Promise<ProjectTreeUnit[]> {
  if (depth >= context.maxDepth) {
    return [];
  }

  if (context.visitedCount >= context.maxEntries) {
    return [];
  }

  const dirents = await readdir(currentDir, { withFileTypes: true });
  const units: ProjectTreeUnit[] = [];

  for (const dirent of dirents) {
    const absolutePath = path.join(currentDir, dirent.name);
    const relativePath = normalizePath(path.relative(root, absolutePath));

    const ignored = isIgnored(relativePath) || isIgnored(`${relativePath}/`);

    if (ignored) {
      continue;
    }

    const kind: "file" | "directory" = dirent.isDirectory() ? "directory" : "file";
    const category = getProjectTreeCategory(relativePath);

    if (kind === "directory") {
      const collapsed = isCollapsed(relativePath) || isCollapsed(`${relativePath}/`);
      const status: ProjectTreeStatus = collapsed ? "collapsed" : "normal";

      const unit: ProjectTreeUnit = {
        id: relativePath,
        kind,
        category,
        status,
        path: relativePath,
        name: dirent.name,
      };

      if (context.visitedCount >= context.maxEntries) {
        break;
      }

      context.visitedCount++;

      if (status === "normal") {
        unit.children = await scanDirectory(root, absolutePath, depth + 1, context);
      }

      units.push(unit);
      continue;
    }

    if (dirent.isFile()) {
      units.push({
        id: relativePath,
        kind,
        category,
        status: "normal",
        path: relativePath,
        name: dirent.name,
      });
    }
  }

  return units;
}

/**
 * Categorizes a project path by common project conventions.
 */
const isDependencyPath = picomatch([
  "**/node_modules",
  "**/node_modules/**",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

const isGeneratedPath = picomatch([
  "**/dist",
  "**/dist/**",
  "**/build",
  "**/build/**",
  "**/.next",
  "**/.next/**",
  "**/.cache",
  "**/.cache/**",
  "**/coverage",
  "**/coverage/**",
]);

const isAssetPath = picomatch([
  "**/public",
  "**/public/**",
  "**/assets",
  "**/assets/**",
  "**/images",
  "**/images/**",
  "**/icons",
  "**/icons/**",
  "**/fonts",
  "**/fonts/**",
  "**/*.{png,jpg,jpeg,gif,svg,webp,ico,woff,woff2,ttf}",
]);

const isConfigPath = picomatch([
  "*.config.*",
  ".*rc",
  "**/*.config.*",
  "**/.*rc",
  "package.json",
  "**/package.json",
  "tsconfig*.json",
  "**/tsconfig*.json",
  "vite.config.*",
  "**/vite.config.*",
  "eslint.config.*",
  "**/eslint.config.*",
]);

/**
 * Categorizes a project path by common project conventions.
 */
function getProjectTreeCategory(pathname: string): ProjectTreeCategory {
  if (isDependencyPath(pathname)) {
    return "dependency";
  }

  if (isGeneratedPath(pathname)) {
    return "generated";
  }

  if (isAssetPath(pathname)) {
    return "asset";
  }

  if (isConfigPath(pathname)) {
    return "config";
  }

  return "authored";
}

/**
 * Checks whether a path matches any glob pattern.
 */
// function matchesAny(pathname: string, patterns: string[]): boolean {
//   return picomatch(patterns)(pathname);
// }

/**
 * Normalizes Windows paths to POSIX-style paths.
 */
function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
