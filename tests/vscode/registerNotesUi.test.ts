/**
 * Verifies that Notes toolbar mode commands load the correct Provider content.
 */

import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  executeCommand: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("vscode", () => ({
  commands: {
    executeCommand: mocks.executeCommand,
    registerCommand: (command: string, callback: (...args: unknown[]) => unknown) => {
      mocks.commands.set(command, callback);
      return { dispose: vi.fn() };
    },
  },
  window: {
    activeTextEditor: undefined,
    registerWebviewViewProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    workspaceFolders: undefined,
  },
}));

import { registerNotesUi } from "@vscode/notesUi/registerNotesUi";

describe("registerNotesUi()", () => {
  beforeEach(() => {
    mocks.commands.clear();
    mocks.executeCommand.mockClear();
  });

  it("reloads the active resource when switching back to Detail", async () => {
    const provider = createProvider();

    registerNotesUi(createExtensionContext(), provider.value, {} as never, {} as never);
    await mocks.commands.get("czaza.showNotesDetail")?.();

    expect(provider.showResourceNotes).toHaveBeenCalledOnce();
    expect(provider.showResourceNotes).toHaveBeenCalledWith();
    expect(provider.postViewMode).not.toHaveBeenCalledWith("detail");
  });

  it("loads Navigator content through the existing mode switch", async () => {
    const provider = createProvider();

    registerNotesUi(createExtensionContext(), provider.value, {} as never, {} as never);
    await mocks.commands.get("czaza.showNotesNavigator")?.();

    expect(provider.postViewMode).toHaveBeenCalledWith("navigator");
    expect(provider.showResourceNotes).not.toHaveBeenCalled();
  });
});

/** Creates the minimum VS Code extension context required by UI registration. */
function createExtensionContext(): vscodeTypes.ExtensionContext {
  return { subscriptions: [] } as unknown as vscodeTypes.ExtensionContext;
}

/** Creates a Notes provider mock with observable mode and resource operations. */
function createProvider() {
  const postViewMode = vi.fn();
  const showResourceNotes = vi.fn().mockResolvedValue(undefined);

  return {
    value: {
      postViewMode,
      showResourceNotes,
      openEmojiPicker: vi.fn(),
      openNotesSpaceMenu: vi.fn(),
      refreshCurrentResourceNotes: vi.fn(),
    } as never,
    postViewMode,
    showResourceNotes,
  };
}
