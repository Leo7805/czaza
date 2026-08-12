/**
 * Tests the primary Git-match path of the Personal Notes identity command.
 */

import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commandHandler: undefined as (() => Promise<void>) | undefined,
  showQuickPick: vi.fn(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  readGitIdentity: vi.fn(),
  resolveRoot: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("vscode", () => ({
  commands: {
    registerCommand: vi.fn((_id: string, handler: () => Promise<void>) => {
      mocks.commandHandler = handler;
      return { dispose: vi.fn() };
    }),
  },
  window: {
    activeTextEditor: undefined,
    showQuickPick: mocks.showQuickPick,
    showWarningMessage: mocks.showWarningMessage,
    showInformationMessage: mocks.showInformationMessage,
    showErrorMessage: mocks.showErrorMessage,
  },
}));

vi.mock("@vscode/config/resolveCzazaRootDirectory", () => ({
  resolveCzazaRootDirectory: mocks.resolveRoot,
}));
vi.mock("@vscode/config/czazaSettings", () => ({ getCzazaSettings: mocks.getSettings }));
vi.mock("@vscode/personalNotes", () => ({ readGitIdentity: mocks.readGitIdentity }));

import { registerSelectPersonalIdentityCommand } from "@vscode/commands/selectPersonalIdentityCommand";

describe("registerSelectPersonalIdentityCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commandHandler = undefined;
    mocks.resolveRoot.mockReturnValue({ rootDirectory: "/workspace" });
    mocks.getSettings.mockReturnValue({ outputDirectory: ".czaza" });
    mocks.readGitIdentity.mockResolvedValue({ displayName: "Leo", email: "leo@example.com" });
  });

  it("confirms and binds a Git-matched identity", async () => {
    const member = { memberId: "leo-12345678", displayName: "Leo", identityHash: "a".repeat(64) };
    const identities = {
      getCurrentIdentity: vi.fn().mockResolvedValue(undefined),
      findByEmail: vi.fn().mockResolvedValue(member),
      bindCurrentIdentity: vi.fn().mockResolvedValue(undefined),
    };
    mocks.showWarningMessage.mockResolvedValue("Use Identity");
    const context = { subscriptions: [] } as unknown as vscodeTypes.ExtensionContext;

    registerSelectPersonalIdentityCommand(context, identities as never);
    await mocks.commandHandler?.();

    expect(identities.findByEmail).toHaveBeenCalledWith("/workspace", ".czaza", "leo@example.com");
    expect(identities.bindCurrentIdentity).toHaveBeenCalledWith("/workspace", member.memberId);
    expect(mocks.showInformationMessage).toHaveBeenCalledWith("Personal Notes identity set to Leo.");
  });
});
