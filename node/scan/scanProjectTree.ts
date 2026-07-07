import path from "node:path";
import { readdir } from "node:fs/promises";
import picomatch from "picomatch";
import { DEFAULT_SCAN_RULES } from "@shared/config/scanRules";
import type {
  ProjectTreeCategory,
  ProjectTreeUnit,
  ProjectTreeStatus,
} from "@shared/types/projectTreeUnit";

const isIgnored = picomatch([...DEFAULT_SCAN_RULES.ignore]);
const isCollapsed = picomatch([...DEFAULT_SCAN_RULES.collapseOnly]);

/**
 * Scans a project root and builds a tree for Project Map generation.
 */
export async function scanProjectTree(root: string): Promise<ProjectTreeUnit[]> {
  return scanDirectory(root, root);
}

/**
 * Recursively scans one directory.
 */
async function scanDirectory(root: string, currentDir: string): Promise<ProjectTreeUnit[]> {
  const dirents = await readdir(currentDir, { withFileTypes: true });
  const units: ProjectTreeUnit[] = [];

  for (const dirent of dirents) {
    const absolutePath = path.join(currentDir, dirent.name);
    const relativePath = normalizePath(path.relative(root, absolutePath));

    if (isIgnored(relativePath)) {
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

      if (status === "normal") {
        unit.children = await scanDirectory(root, absolutePath);
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
function getProjectTreeCategory(pathname: string): ProjectTreeCategory {
  if (
    matchesAny(pathname, ["node_modules/**", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"])
  ) {
    return "dependency";
  }

  if (matchesAny(pathname, ["dist/**", "build/**", ".next/**", ".cache/**", "coverage/**"])) {
    return "generated";
  }

  if (
    matchesAny(pathname, [
      "public/**",
      "assets/**",
      "images/**",
      "icons/**",
      "fonts/**",
      "**/*.{png,jpg,jpeg,gif,svg,webp,ico,woff,woff2,ttf}",
    ])
  ) {
    return "asset";
  }

  if (
    matchesAny(pathname, [
      "*.config.*",
      ".*rc",
      "package.json",
      "tsconfig*.json",
      "vite.config.*",
      "eslint.config.*",
    ])
  ) {
    return "config";
  }

  return "authored";
}

/**
 * Checks whether a path matches any glob pattern.
 */
function matchesAny(pathname: string, patterns: string[]): boolean {
  return picomatch(patterns)(pathname);
}

/**
 * Normalizes Windows paths to POSIX-style paths.
 */
function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
