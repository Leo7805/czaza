/**
 * Coordinates Notes UI refreshes after session-only Runtime State changes.
 */

import type {
  RuntimeNoteState,
  RuntimeNoteStateChange,
  RuntimeNoteStateCoordinates,
  RuntimeNoteStateDisposable,
} from "@vscode/services/runtimeState/runtimeNoteState";
import type { RuntimeNoteStateRegistry } from "@vscode/services/runtimeState/RuntimeNoteStateRegistry";

/** Current Notes UI context used to evaluate one Runtime State change. */
export type NotesRuntimeRefreshContext = {
  coordinates: RuntimeNoteStateCoordinates;
  payloadKind: "file" | "other";
  viewMode: "detail" | "navigator";
};

/** Navigator list whose status should be detected and refreshed. */
export type NotesNavigatorList = "files" | "sections" | "lines";

/**
 * Routes Runtime State mutations to the smallest valid Notes UI refresh.
 *
 * Missing resources reuse the existing payload instead of reopening a deleted
 * source. Other current-resource changes keep the existing reload behavior.
 *
 * @example
 * const controller = new NotesRuntimeStateRefreshController({
 *   registry,
 *   getContext: () => currentContext,
 *   reloadCurrentResource: reloadCurrent,
 *   overlayMissingState: showMissing,
 *   refreshNavigator: reloadNavigator,
 * });
 */
export class NotesRuntimeStateRefreshController implements RuntimeNoteStateDisposable {
  private readonly listener: RuntimeNoteStateDisposable;
  private readonly getContext: () => NotesRuntimeRefreshContext | undefined;
  private readonly detectCurrentResource: () => Promise<void>;
  private readonly detectAllFileNotes: () => Promise<void>;
  private readonly reloadCurrentResource: () => Promise<void>;
  private readonly overlayMissingState: (state: RuntimeNoteState) => Promise<void>;
  private readonly refreshNavigator: () => Promise<void>;
  private explicitRefreshDepth = 0;

  /**
   * Subscribes to one Runtime State Registry and owns that subscription.
   *
   * @param input - Registry, current-context reader, and UI refresh callbacks.
   */
  constructor(input: {
    registry: RuntimeNoteStateRegistry;
    getContext(): NotesRuntimeRefreshContext | undefined;
    detectCurrentResource(): Promise<void>;
    detectAllFileNotes(): Promise<void>;
    reloadCurrentResource(): Promise<void>;
    overlayMissingState(state: RuntimeNoteState): Promise<void>;
    refreshNavigator(): Promise<void>;
  }) {
    this.getContext = input.getContext;
    this.detectCurrentResource = input.detectCurrentResource;
    this.detectAllFileNotes = input.detectAllFileNotes;
    this.reloadCurrentResource = input.reloadCurrentResource;
    this.overlayMissingState = input.overlayMissingState;
    this.refreshNavigator = input.refreshNavigator;
    this.listener = input.registry.onDidChange((change) => {
      void this.handleChange(change).catch((error: unknown) => {
        console.error("Failed to refresh visible CZaza Runtime Note State.", error);
      });
    });
  }

  /**
   * Releases the owned Runtime State listener.
   *
   * @returns Nothing.
   */
  dispose(): void {
    this.listener.dispose();
  }

  /**
   * Re-detects and reloads the visible resource after its Note Store baseline changes.
   *
   * Registry listener refreshes are suppressed during this explicit cycle so one
   * detection cannot produce duplicate UI reloads.
   *
   * @returns Promise resolved after the current Notes UI is reloaded.
   */
  async refreshAfterNoteStoreChange(): Promise<void> {
    if (!this.getContext()) {
      return;
    }

    await this.runExplicitRefresh(
      () => this.detectCurrentResource(),
      () => this.reloadCurrentResource(),
    );
  }

  /**
   * Detects the scope represented by one Navigator list and refreshes it once.
   *
   * @param list - Files, Sections, or Lines Navigator list.
   * @returns Promise resolved after detection and one Navigator reload.
   */
  async refreshNavigatorList(list: NotesNavigatorList): Promise<void> {
    if (!this.getContext()) {
      return;
    }

    await this.runExplicitRefresh(
      list === "files" ? () => this.detectAllFileNotes() : () => this.detectCurrentResource(),
      () => this.refreshNavigator(),
    );
  }

  /**
   * Selects a direct overlay, resource reload, or Navigator refresh.
   *
   * @param change - Runtime Registry mutation to route.
   * @returns Promise resolved after any required UI refresh.
   */
  private async handleChange(change: RuntimeNoteStateChange): Promise<void> {
    if (this.explicitRefreshDepth > 0) {
      return;
    }

    const context = this.getContext();

    if (!context) {
      return;
    }

    if (context.payloadKind === "file" && doesChangeAffectResource(change, context.coordinates)) {
      if (change.kind === "set" && change.state.issues.includes("missing")) {
        await this.overlayMissingState(change.state);

        if (context.viewMode === "navigator") {
          await this.refreshNavigator();
        }
      } else {
        await this.reloadCurrentResource();
      }
      return;
    }

    if (context.viewMode === "navigator" && doesChangeAffectScope(change, context.coordinates)) {
      await this.refreshNavigator();
    }
  }

  /**
   * Runs one explicit detection and UI reload without listener-driven duplicates.
   *
   * @param detect - Detection work that may mutate the Registry.
   * @param refresh - Single UI reload performed after detection.
   * @returns Promise resolved after the explicit refresh cycle.
   */
  private async runExplicitRefresh(
    detect: () => Promise<void>,
    refresh: () => Promise<void>,
  ): Promise<void> {
    this.explicitRefreshDepth += 1;

    try {
      await detect();
      await refresh();
    } finally {
      this.explicitRefreshDepth -= 1;
    }
  }
}

/**
 * Reports whether one Registry mutation affects a specific source resource.
 *
 * @param change - Runtime Registry mutation.
 * @param coordinates - Current Notes resource coordinates.
 * @returns True when the mutation contains the current resource.
 */
function doesChangeAffectResource(
  change: RuntimeNoteStateChange,
  coordinates: RuntimeNoteStateCoordinates,
): boolean {
  const matches = (state: RuntimeNoteStateCoordinates): boolean =>
    matchesCoordinates(state, coordinates);

  switch (change.kind) {
    case "set":
      return matches(change.state);
    case "delete":
      return matches(change.previousState);
    case "move":
      return matches(change.state) || matches(change.previousState);
    case "clear":
      return change.previousStates.some(matches);
  }
}

/**
 * Reports whether one Registry mutation affects a workspace Note Store scope.
 *
 * @param change - Runtime Registry mutation.
 * @param coordinates - Current Notes resource coordinates.
 * @returns True when the mutation belongs to the current scope.
 */
function doesChangeAffectScope(
  change: RuntimeNoteStateChange,
  coordinates: RuntimeNoteStateCoordinates,
): boolean {
  const matches = (state: { workspaceRoot: string; outputDirectory: string }): boolean =>
    state.workspaceRoot === coordinates.workspaceRoot &&
    state.outputDirectory === coordinates.outputDirectory;

  switch (change.kind) {
    case "set":
      return matches(change.state);
    case "delete":
      return matches(change.previousState);
    case "move":
      return matches(change.state) || matches(change.previousState);
    case "clear":
      return matches(change.scope);
  }
}

/**
 * Compares complete normalized Runtime State coordinates.
 *
 * @param left - First resource coordinates.
 * @param right - Second resource coordinates.
 * @returns True when both resources are identical.
 */
function matchesCoordinates(
  left: RuntimeNoteStateCoordinates,
  right: RuntimeNoteStateCoordinates,
): boolean {
  return (
    left.workspaceRoot === right.workspaceRoot &&
    left.outputDirectory === right.outputDirectory &&
    left.relativePath === right.relativePath
  );
}
