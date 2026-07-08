import picomatch from "picomatch";

export type ProjectPathKind = "file" | "directory";

export type ProjectPathMatcher = (pathname: string, kind: ProjectPathKind) => boolean;

/**
 * Creates a matcher for project paths.
 *
 * Supported gitignore-style rules:
 * - "name" matches a file or directory at any depth.
 * - "name/" only matches a directory at any depth.
 * - "/name" or "/name/" only matches from the project root.
 * - Glob patterns such as "*.log" are still supported.
 */
export function createPathMatcher(patterns: readonly string[]): ProjectPathMatcher {
  const compiledPatterns = patterns.map(compilePathPattern).filter((pattern) => pattern.matchers.length > 0);

  return (pathname, kind) => {
    const normalizedPathname = normalizePathname(pathname);

    return compiledPatterns.some((pattern) => {
      if (pattern.directoryOnly && kind !== "directory") {
        return false;
      }

      return pattern.matchers.some((matches) => matches(normalizedPathname));
    });
  };
}

type CompiledPathPattern = {
  directoryOnly: boolean;
  matchers: picomatch.Matcher[];
};

function compilePathPattern(pattern: string): CompiledPathPattern {
  const normalizedPattern = normalizePathPattern(pattern);

  if (!normalizedPattern) {
    return {
      directoryOnly: false,
      matchers: [],
    };
  }

  const directoryOnly = normalizedPattern.endsWith("/");
  const rootOnly = normalizedPattern.startsWith("/");
  const body = normalizedPattern.replace(/^\/+/, "").replace(/\/+$/, "");

  if (!body) {
    return {
      directoryOnly,
      matchers: [],
    };
  }

  const variants = new Set<string>();

  if (rootOnly) {
    variants.add(body);
  } else {
    variants.add(body);

    if (!body.startsWith("**/")) {
      variants.add(`**/${body}`);
    }
  }

  return {
    directoryOnly,
    matchers: [...variants].map((variant) => picomatch(variant)),
  };
}

function normalizePathPattern(pattern: string): string {
  return pattern.trim().replaceAll("\\", "/");
}

function normalizePathname(pathname: string): string {
  return pathname.replaceAll("\\", "/").replace(/\/+$/, "");
}
