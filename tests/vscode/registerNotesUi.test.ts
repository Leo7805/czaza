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

  it("binds Detail to the active resource", async () => {
    const provider = createProvider();

    registerNotesUi(createExtensionContext(), provider.value, {} as never, {} as never);
    await mocks.commands.get("czaza.showNotesDetail")?.();

    expect(provider.showActiveResourceNotes).toHaveBeenCalledWith("detail");
  });

  it("binds Navigator to the active resource", async () => {
    const provider = createProvider();

    registerNotesUi(createExtensionContext(), provider.value, {} as never, {} as never);
    await mocks.commands.get("czaza.showNotesNavigator")?.();

    expect(provider.showActiveResourceNotes).toHaveBeenCalledWith("navigator");
  });
});

/** Creates the minimum VS Code extension context required by UI registration. */
function createExtensionContext(): vscodeTypes.ExtensionContext {
  return { subscriptions: [] } as unknown as vscodeTypes.ExtensionContext;
}

/** Creates a Notes provider mock with observable mode and resource operations. */
function createProvider() {
  const showActiveResourceNotes = vi.fn().mockResolvedValue(undefined);

  return {
    value: {
      showActiveResourceNotes,
      openEmojiPicker: vi.fn(),
      openNotesSpaceMenu: vi.fn(),
      refreshCurrentResourceNotes: vi.fn(),
    } as never,
    showActiveResourceNotes,
  };
}
