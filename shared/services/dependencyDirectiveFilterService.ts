/**
 * Detects dependency directive source lines that can be omitted from structured prompts.
 */

import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";

/**
 * Dependency directive syntax groups supported by local filtering.
 */
export type DependencyDirectiveRule =
  | "cInclude"
  | "csharpUsing"
  | "pythonImport"
  | "ecmaScriptImport";

/**
 * Mutable scanner state used to skip multiline dependency declarations.
 */
export type DependencyDirectiveScanState = {
  /** Active multiline dependency declaration, when the previous line started one. */
  dependencyContinuation?: {
    /** Syntax rule that owns the continuation. */
    rule: Exclude<DependencyDirectiveRule, "csharpUsing">;

    /** Lightweight nesting depth for grouped import declarations. */
    nestingDepth: number;
  };
};

/**
 * Creates scanner state for dependency directive filtering.
 *
 * @returns Empty dependency directive scanner state.
 *
 * @example
 * const state = createDependencyDirectiveScanState();
 */
export function createDependencyDirectiveScanState(): DependencyDirectiveScanState {
  return {};
}

/**
 * Decides whether one source line is part of a dependency directive.
 *
 * The function uses configured VS Code language ids to select the syntax rule,
 * while keeping the language id itself open-ended.
 *
 * @param text - Trimmed source line text.
 * @param programmingLanguage - VS Code language id, when available.
 * @param state - Scanner state shared across consecutive source lines.
 * @returns `true` when the line should be skipped as dependency setup.
 *
 * @example
 * const state = createDependencyDirectiveScanState();
 * shouldSkipDependencyDirectiveLine("import value from './value';", "typescript", state);
 */
export function shouldSkipDependencyDirectiveLine(
  text: string,
  programmingLanguage: string | undefined,
  state: DependencyDirectiveScanState,
): boolean {
  const normalizedLanguage = programmingLanguage?.toLowerCase();

  if (state.dependencyContinuation) {
    updateDependencyContinuation(text, state);
    return true;
  }

  if (usesDependencyRule("cInclude", normalizedLanguage) && isCInclude(text)) {
    startDependencyContinuation("cInclude", text, state);
    return true;
  }

  if (
    usesDependencyRule("csharpUsing", normalizedLanguage) &&
    isCSharpUsingDirective(text)
  ) {
    return true;
  }

  if (usesDependencyRule("pythonImport", normalizedLanguage) && isPythonImport(text)) {
    startDependencyContinuation("pythonImport", text, state);
    return true;
  }

  if (
    usesDependencyRule("ecmaScriptImport", normalizedLanguage) &&
    isEcmaScriptStaticImport(text)
  ) {
    startDependencyContinuation("ecmaScriptImport", text, state);
    return true;
  }

  return false;
}

/** Checks whether one language id is assigned to a configured syntax rule. */
function usesDependencyRule(
  rule: DependencyDirectiveRule,
  programmingLanguage: string | undefined,
): boolean {
  if (!programmingLanguage) {
    return false;
  }

  return AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.languageIds[
    rule
  ].some((languageId) => languageId === programmingLanguage);
}

/** Detects a C or C++ include directive. */
function isCInclude(text: string): boolean {
  return /^#\s*include\b/.test(text);
}

/** Detects a C# namespace import without matching a using statement or declaration. */
function isCSharpUsingDirective(text: string): boolean {
  return /^(?:global\s+)?using\s+(?:static\s+)?(?:[A-Za-z_]\w*\s*=\s*)?[A-Za-z_]\w*(?:(?:\.|::)[A-Za-z_]\w*)*\s*;\s*(?:\/\/.*)?$/.test(
    text,
  );
}

/** Detects the first line of a Python import statement. */
function isPythonImport(text: string): boolean {
  return /^(?:import\s+\S|from\s+\S+\s+import\b)/.test(text);
}

/** Detects ECMAScript static imports without matching import() or import.meta. */
function isEcmaScriptStaticImport(text: string): boolean {
  return /^import\b(?!\s*[.(])/.test(text);
}

/** Initializes continuation tracking for a dependency declaration. */
function startDependencyContinuation(
  rule: Exclude<DependencyDirectiveRule, "csharpUsing">,
  text: string,
  state: DependencyDirectiveScanState,
): void {
  state.dependencyContinuation = { rule, nestingDepth: 0 };
  updateDependencyContinuation(text, state);
}

/** Updates syntax-specific continuation state after one skipped source line. */
function updateDependencyContinuation(
  text: string,
  state: DependencyDirectiveScanState,
): void {
  const continuation = state.dependencyContinuation;

  if (!continuation) {
    return;
  }

  if (continuation.rule === "cInclude") {
    if (!/\\\s*$/.test(text)) {
      state.dependencyContinuation = undefined;
    }
    return;
  }

  if (continuation.rule === "pythonImport") {
    continuation.nestingDepth = Math.max(
      0,
      continuation.nestingDepth + countCharacter(text, "(") - countCharacter(text, ")"),
    );

    if (continuation.nestingDepth === 0 && !/\\\s*$/.test(text)) {
      state.dependencyContinuation = undefined;
    }
    return;
  }

  continuation.nestingDepth = Math.max(
    0,
    continuation.nestingDepth + countCharacter(text, "{") - countCharacter(text, "}"),
  );

  const hasModuleSpecifier =
    /^import\s*["']/.test(text) ||
    /\bfrom\s*["']/.test(text) ||
    /=\s*require\s*\(/.test(text);
  const endsStatement = /;\s*(?:\/\/.*)?$/.test(text);

  if (continuation.nestingDepth === 0 && (hasModuleSpecifier || endsStatement)) {
    state.dependencyContinuation = undefined;
  }
}

/** Counts occurrences of one character in source text. */
function countCharacter(text: string, target: string): number {
  return [...text].filter((character) => character === target).length;
}
