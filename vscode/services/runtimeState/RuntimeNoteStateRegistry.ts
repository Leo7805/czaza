/**
 * Stores transient source-change detection results for affected Note resources.
 */

import * as path from "node:path";

import type {
  RuntimeNoteState,
  RuntimeNoteStateChange,
  RuntimeNoteStateCoordinates,
  RuntimeNoteStateDisposable,
  RuntimeNoteStateListener,
  RuntimeNoteStateScope,
  RuntimeNoteTargetChange,
} from "./runtimeNoteState";

/**
 * Owns session-only Note detection state without reading or writing the filesystem.
 *
 * @example
 * const registry = new RuntimeNoteStateRegistry();
 * registry.setState({
 *   workspaceRoot: "/workspace/project",
 *   outputDirectory: ".czaza",
 *   relativePath: "src/index.ts",
 *   issues: ["stale"],
 *   reason: "sourceChanged",
 *   observedAt: new Date().toISOString(),
 *   targetChanges: [],
 * });
 */
export class RuntimeNoteStateRegistry {
  private readonly states = new Map<string, RuntimeNoteState>();
  private readonly listeners = new Set<RuntimeNoteStateListener>();

  /**
   * Stores the latest state for one source resource.
   *
   * @param state - Complete latest runtime state for the resource.
   * @returns Defensive copy of the stored state.
   */
  setState(state: RuntimeNoteState): RuntimeNoteState {
    if (state.issues.length === 0 && state.targetChanges.length === 0) {
      throw new Error("Runtime Note state must contain an issue or target change.");
    }

    const normalized = normalizeState(state);
    const key = createStateKey(normalized);
    const previousState = this.states.get(key);

    this.states.set(key, normalized);
    this.emit({
      kind: "set",
      state: cloneState(normalized),
      ...(previousState ? { previousState: cloneState(previousState) } : {}),
    });

    return cloneState(normalized);
  }

  /**
   * Reads one source resource state.
   *
   * @param coordinates - Workspace and source resource coordinates.
   * @returns Defensive state copy, or undefined when the resource is current.
   */
  getState(coordinates: RuntimeNoteStateCoordinates): RuntimeNoteState | undefined {
    const state = this.states.get(createStateKey(coordinates));
    return state ? cloneState(state) : undefined;
  }

  /**
   * Lists affected resources in one workspace Note Store scope.
   *
   * @param scope - Workspace root and configured output directory.
   * @returns Defensive copies ordered by normalized relative path.
   */
  listStates(scope: RuntimeNoteStateScope): RuntimeNoteState[] {
    const scopeKey = createScopeKey(scope);

    return [...this.states.entries()]
      .filter(([key]) => key.startsWith(`${scopeKey}\u0000`))
      .map(([, state]) => cloneState(state))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  /**
   * Removes one source resource state.
   *
   * @param coordinates - Workspace and source resource coordinates.
   * @returns True when an existing state was removed.
   */
  deleteState(coordinates: RuntimeNoteStateCoordinates): boolean {
    const key = createStateKey(coordinates);
    const previousState = this.states.get(key);

    if (!previousState) {
      return false;
    }

    this.states.delete(key);
    this.emit({ kind: "delete", previousState: cloneState(previousState) });
    return true;
  }

  /**
   * Removes all runtime states belonging to one workspace Note Store scope.
   *
   * @param scope - Workspace root and configured output directory.
   * @returns Number of removed resource states.
   */
  clearScope(scope: RuntimeNoteStateScope): number {
    const states = this.listStates(scope);

    if (states.length === 0) {
      return 0;
    }

    for (const state of states) {
      this.states.delete(createStateKey(state));
    }

    this.emit({
      kind: "clear",
      scope: normalizeScope(scope),
      previousStates: states,
    });
    return states.length;
  }

  /**
   * Moves one runtime state to a new relative source path.
   *
   * Any existing state at the destination is replaced by the moved state.
   *
   * @param coordinates - Current workspace and source resource coordinates.
   * @param nextRelativePath - New source path relative to the CZaza root.
   * @returns Moved state, or undefined when the old resource has no state.
   */
  moveState(
    coordinates: RuntimeNoteStateCoordinates,
    nextRelativePath: string,
  ): RuntimeNoteState | undefined {
    const previousKey = createStateKey(coordinates);
    const previousState = this.states.get(previousKey);

    if (!previousState) {
      return undefined;
    }

    const nextState = normalizeState({
      ...previousState,
      relativePath: nextRelativePath,
    });

    this.states.delete(previousKey);
    this.states.set(createStateKey(nextState), nextState);
    this.emit({
      kind: "move",
      state: cloneState(nextState),
      previousState: cloneState(previousState),
    });

    return cloneState(nextState);
  }

  /**
   * Moves every runtime state at or below one file or directory path.
   *
   * @param scope - Workspace Note Store scope.
   * @param previousRelativePath - Existing file or directory path.
   * @param nextRelativePath - Replacement file or directory path.
   * @returns Number of moved states.
   */
  moveStatesUnderPath(
    scope: RuntimeNoteStateScope,
    previousRelativePath: string,
    nextRelativePath: string,
  ): number {
    const states = this.listStates(scope).filter((state) =>
      isSameOrDescendantPath(state.relativePath, previousRelativePath),
    );

    for (const state of states) {
      this.moveState(
        state,
        replaceRelativePathPrefix(state.relativePath, previousRelativePath, nextRelativePath),
      );
    }

    return states.length;
  }

  /**
   * Deletes every runtime state at or below one file or directory path.
   *
   * @param scope - Workspace Note Store scope.
   * @param relativePath - Deleted file or directory path.
   * @returns Number of deleted states.
   */
  deleteStatesUnderPath(scope: RuntimeNoteStateScope, relativePath: string): number {
    const states = this.listStates(scope).filter((state) =>
      isSameOrDescendantPath(state.relativePath, relativePath),
    );

    for (const state of states) {
      this.deleteState(state);
    }

    return states.length;
  }

  /**
   * Registers a listener for runtime state mutations.
   *
   * @param listener - Callback invoked synchronously after each mutation.
   * @returns Disposable listener registration.
   */
  onDidChange(listener: RuntimeNoteStateListener): RuntimeNoteStateDisposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  /**
   * Notifies a stable listener snapshot about one mutation.
   *
   * @param change - Registry mutation to publish.
   * @returns Nothing.
   */
  private emit(change: RuntimeNoteStateChange): void {
    for (const listener of [...this.listeners]) {
      listener(change);
    }
  }
}

/**
 * Creates a collision-safe key for one workspace Note Store scope.
 *
 * @param scope - Workspace root and configured output directory.
 * @returns Normalized scope key.
 */
function createScopeKey(scope: RuntimeNoteStateScope): string {
  const normalized = normalizeScope(scope);
  return `${normalized.workspaceRoot}\u0000${normalized.outputDirectory}`;
}

/**
 * Creates a collision-safe key for one source resource.
 *
 * @param coordinates - Workspace and source resource coordinates.
 * @returns Normalized resource key.
 */
function createStateKey(coordinates: RuntimeNoteStateCoordinates): string {
  return `${createScopeKey(coordinates)}\u0000${normalizeRelativePath(coordinates.relativePath)}`;
}

/**
 * Normalizes workspace scope paths before storage or comparison.
 *
 * @param scope - Workspace root and output directory to normalize.
 * @returns Normalized scope coordinates.
 */
function normalizeScope(scope: RuntimeNoteStateScope): RuntimeNoteStateScope {
  return {
    workspaceRoot: path.resolve(scope.workspaceRoot),
    outputDirectory: normalizeRelativePath(scope.outputDirectory),
  };
}

/**
 * Normalizes and defensively copies one runtime state.
 *
 * @param state - Runtime state supplied by a detector.
 * @returns Normalized state owned by the registry.
 */
function normalizeState(state: RuntimeNoteState): RuntimeNoteState {
  const scope = normalizeScope(state);

  return {
    ...state,
    ...scope,
    relativePath: normalizeRelativePath(state.relativePath),
    ...(state.relatedRelativePath
      ? { relatedRelativePath: normalizeRelativePath(state.relatedRelativePath) }
      : {}),
    issues: [...new Set(state.issues)],
    targetChanges: state.targetChanges.map(cloneTargetChange),
  };
}

/**
 * Normalizes one relative path to portable forward-slash form.
 *
 * @param value - Relative workspace path.
 * @returns Normalized relative path.
 */
function normalizeRelativePath(value: string): string {
  return path.posix.normalize(value.replaceAll("\\", "/")).replace(/^\.\//, "");
}

/**
 * Reports whether a relative path equals or descends from one resource path.
 *
 * @param candidate - Candidate source path.
 * @param parent - File or directory path.
 * @returns True when the candidate is the same path or one of its descendants.
 */
function isSameOrDescendantPath(candidate: string, parent: string): boolean {
  const normalizedCandidate = normalizeRelativePath(candidate);
  const normalizedParent = normalizeRelativePath(parent);

  return (
    normalizedCandidate === normalizedParent ||
    normalizedCandidate.startsWith(`${normalizedParent}/`)
  );
}

/**
 * Replaces a matching relative path prefix.
 *
 * @param candidate - Existing source path.
 * @param previousPrefix - Existing file or directory prefix.
 * @param nextPrefix - Replacement prefix.
 * @returns Moved relative path.
 */
function replaceRelativePathPrefix(
  candidate: string,
  previousPrefix: string,
  nextPrefix: string,
): string {
  const normalizedCandidate = normalizeRelativePath(candidate);
  const normalizedPrevious = normalizeRelativePath(previousPrefix);
  const normalizedNext = normalizeRelativePath(nextPrefix);
  const suffix =
    normalizedCandidate === normalizedPrevious
      ? ""
      : normalizedCandidate.slice(normalizedPrevious.length + 1);

  return normalizeRelativePath(suffix ? `${normalizedNext}/${suffix}` : normalizedNext);
}

/**
 * Creates a defensive copy of one runtime state.
 *
 * @param state - Stored runtime state.
 * @returns Independent state copy safe for callers to modify.
 */
function cloneState(state: RuntimeNoteState): RuntimeNoteState {
  return {
    ...state,
    issues: [...state.issues],
    targetChanges: state.targetChanges.map(cloneTargetChange),
  };
}

/**
 * Creates a defensive copy of one target-level runtime change.
 *
 * @param change - File, Section, or Line target change.
 * @returns Independent target change copy.
 */
function cloneTargetChange(change: RuntimeNoteTargetChange): RuntimeNoteTargetChange {
  return {
    ...change,
    status: { ...change.status },
    ...(change.kind === "section" && change.range ? { range: { ...change.range } } : {}),
  };
}
