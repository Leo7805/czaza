/**
 * Unit tests for connecting built-in Git HEAD changes to transition protection.
 */

import type * as vscodeTypes from "vscode";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repositoryListener: undefined as (() => void) | undefined,
  head: { name: "main", commit: "main-commit" },
  clearCache: vi.fn(),
  refreshCurrentNotes: vi.fn(),
}));

vi.mock("vscode", () => {
  const rootUri = {
    scheme: "file",
    fsPath: "/private/tmp",
    toString: () => "file:///private/tmp",
  };
  const repository = {
    rootUri,
    state: {
      get HEAD() {
        return mocks.head;
      },
      onDidChange: (listener: () => void) => {
        mocks.repositoryListener = listener;
        return { dispose: vi.fn() };
      },
    },
  };

  return {
    extensions: {
      getExtension: () => ({
        isActive: true,
        exports: {
          getAPI: () => ({
            repositories: [repository],
            onDidOpenRepository: () => ({ dispose: vi.fn() }),
          }),
        },
      }),
    },
    workspace: {
      getWorkspaceFolder: () => ({
        uri: rootUri,
        name: "workspace",
        index: 0,
      }),
      getConfiguration: () => ({
        get: <T>(_key: string, defaultValue: T): T => defaultValue,
      }),
    },
  };
});

import type { WorkspaceNoteStore } from "@vscode/notes";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import {
  GitWorkspaceTransitionGuard,
  registerGitWorkspaceTransition,
} from "@vscode/services/workspaceTransition";

describe("registerGitWorkspaceTransition()", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears cache around a HEAD change and refreshes after settling", async () => {
    vi.useFakeTimers();
    const guard = new GitWorkspaceTransitionGuard(100);
    const context = {
      subscriptions: [],
    } as unknown as vscodeTypes.ExtensionContext;
    const notes = {
      cache: { clearCache: mocks.clearCache },
    } as unknown as WorkspaceNoteStore;
    const notesProvider = {
      refreshCurrentNotes: mocks.refreshCurrentNotes,
    } as unknown as NotesViewProvider;

    await registerGitWorkspaceTransition(context, notes, notesProvider, guard);
    mocks.head = { name: "feature", commit: "feature-commit" };
    mocks.repositoryListener?.();

    expect(guard.isTransitioning()).toBe(true);
    expect(mocks.clearCache).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(100);

    expect(mocks.clearCache).toHaveBeenCalledTimes(2);
    expect(mocks.refreshCurrentNotes).toHaveBeenCalledOnce();
    expect(guard.isTransitioning()).toBe(false);
  });
});
