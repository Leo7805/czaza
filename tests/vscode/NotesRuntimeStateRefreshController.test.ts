/**
 * Tests Runtime State routing for the Notes UI refresh controller.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NotesRuntimeStateRefreshController,
  type NotesRuntimeRefreshContext,
} from "../../vscode/notesUi/runtimeState/NotesRuntimeStateRefreshController";
import { RuntimeNoteStateRegistry } from "../../vscode/services/runtimeState/RuntimeNoteStateRegistry";
import type { RuntimeNoteState } from "../../vscode/services/runtimeState/runtimeNoteState";

const coordinates = {
  workspaceRoot: "/workspace",
  outputDirectory: ".czaza",
  relativePath: "src/index.ts",
};

describe("NotesRuntimeStateRefreshController", () => {
  let registry: RuntimeNoteStateRegistry;
  let context: NotesRuntimeRefreshContext | undefined;
  let reloadCurrentResource: () => Promise<void>;
  let overlayMissingState: (state: RuntimeNoteState) => Promise<void>;
  let refreshNavigator: () => Promise<void>;

  beforeEach(() => {
    registry = new RuntimeNoteStateRegistry();
    context = {
      coordinates,
      payloadKind: "file",
      viewMode: "detail",
    };
    reloadCurrentResource = vi.fn().mockResolvedValue(undefined);
    overlayMissingState = vi.fn().mockResolvedValue(undefined);
    refreshNavigator = vi.fn().mockResolvedValue(undefined);
  });

  /**
   * Creates a controller connected to the current test callbacks.
   *
   * @returns Controller under test.
   */
  function createController(): NotesRuntimeStateRefreshController {
    return new NotesRuntimeStateRefreshController({
      registry,
      getContext: () => context,
      reloadCurrentResource,
      overlayMissingState,
      refreshNavigator,
    });
  }

  it("overlays missing state without reopening the deleted resource", async () => {
    const controller = createController();
    const state = createRuntimeState("src/index.ts", "missing");

    registry.setState(state);

    await vi.waitFor(() => expect(overlayMissingState).toHaveBeenCalledWith(state));
    expect(reloadCurrentResource).not.toHaveBeenCalled();
    expect(refreshNavigator).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("reloads the current resource for ordinary Runtime State changes", async () => {
    const controller = createController();

    registry.setState(createRuntimeState("src/index.ts", "stale"));

    await vi.waitFor(() => expect(reloadCurrentResource).toHaveBeenCalledOnce());
    expect(overlayMissingState).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("refreshes Navigator for another resource in the visible scope", async () => {
    const controller = createController();
    context = {
      ...context!,
      viewMode: "navigator",
    };

    registry.setState(createRuntimeState("src/other.ts", "stale"));

    await vi.waitFor(() => expect(refreshNavigator).toHaveBeenCalledOnce());
    expect(reloadCurrentResource).not.toHaveBeenCalled();
    expect(overlayMissingState).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("stops responding after disposal", async () => {
    const controller = createController();

    controller.dispose();
    registry.setState(createRuntimeState("src/index.ts", "stale"));
    await Promise.resolve();

    expect(reloadCurrentResource).not.toHaveBeenCalled();
    expect(overlayMissingState).not.toHaveBeenCalled();
  });
});

/**
 * Creates a File Note Runtime State fixture.
 *
 * @param relativePath - Source path represented by the state.
 * @param issue - Missing or stale issue represented by the state.
 * @returns Runtime State suitable for refresh-routing tests.
 */
function createRuntimeState(
  relativePath: string,
  issue: "missing" | "stale",
): RuntimeNoteState {
  return {
    workspaceRoot: "/workspace",
    outputDirectory: ".czaza",
    relativePath,
    issues: issue === "missing" ? ["missing", "locationReview"] : ["stale"],
    reason: issue === "missing" ? "resourceMissing" : "sourceChanged",
    observedAt: "2026-07-30T00:00:00.000Z",
    targetChanges: [
      {
        kind: "file",
        status:
          issue === "missing"
            ? { content: "current", anchor: "needsConfirmation" }
            : { content: "stale", anchor: "confirmed" },
      },
    ],
  };
}
