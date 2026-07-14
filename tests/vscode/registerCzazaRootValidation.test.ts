/**
 * Unit tests for activation-time CZaza root directory validation.
 */

import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type * as vscodeTypes from "vscode";

import { beforeEach, describe, expect, it, vi } from "vitest";

type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

type MockConfigurationChangeEvent = {
  affectsConfiguration: (section: string) => boolean;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
  configuredRootDirectory: "",
  showWarningMessage: vi.fn(),
  configurationListeners: [] as Array<(event: MockConfigurationChangeEvent) => void>,
}));

vi.mock("vscode", () => ({
  window: {
    showWarningMessage: mocks.showWarningMessage,
  },

  workspace: {
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },

    getConfiguration: () => ({
      get: <T>(key: string, defaultValue: T): T => {
        if (key === "rootDirectory") {
          return mocks.configuredRootDirectory as T;
        }

        return defaultValue;
      },
    }),

    getWorkspaceFolder: (uri: vscodeTypes.Uri) =>
      mocks.workspaceFolders.find((folder) => {
        const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
        return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
      }),

    onDidChangeConfiguration: (listener: (event: MockConfigurationChangeEvent) => void) => {
      mocks.configurationListeners.push(listener);
      return { dispose: vi.fn() };
    },
  },
}));

import { registerCzazaRootValidation } from "@vscode/config/registerCzazaRootValidation";

describe("registerCzazaRootValidation()", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.workspaceFolders.length = 0;
    mocks.configurationListeners.length = 0;
    mocks.configuredRootDirectory = "";
  });

  it("does not warn when rootDirectory is empty", () => {
    const context = createExtensionContext();

    registerCzazaRootValidation(context);

    expect(mocks.showWarningMessage).not.toHaveBeenCalled();
    expect(context.subscriptions).toHaveLength(1);
  });

  it("does not warn when there is no workspace", () => {
    const context = createExtensionContext();

    mocks.configuredRootDirectory = "packages/app";

    registerCzazaRootValidation(context);

    expect(mocks.showWarningMessage).not.toHaveBeenCalled();
  });

  it("warns when an explicitly configured root does not exist", async () => {
    const context = createExtensionContext();
    const workspace = await createTempWorkspaceFolder("missing-root");

    mocks.workspaceFolders.push(workspace);
    mocks.configuredRootDirectory = "packages/app";

    registerCzazaRootValidation(context);

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("CZaza root directory is invalid"),
    );
  });

  it("does not warn when an explicitly configured root exists", async () => {
    const context = createExtensionContext();
    const workspace = await createTempWorkspaceFolder("valid-root");

    await mkdir(path.join(workspace.uri.fsPath, "packages", "app"), { recursive: true });

    mocks.workspaceFolders.push(workspace);
    mocks.configuredRootDirectory = "packages/app";

    registerCzazaRootValidation(context);

    expect(mocks.showWarningMessage).not.toHaveBeenCalled();
  });

  it("revalidates when czaza.rootDirectory changes", async () => {
    const context = createExtensionContext();
    const workspace = await createTempWorkspaceFolder("config-change");

    mocks.workspaceFolders.push(workspace);

    registerCzazaRootValidation(context);

    mocks.configuredRootDirectory = "missing";
    mocks.configurationListeners[0]?.({
      affectsConfiguration: (section) => section === "czaza.rootDirectory",
    });

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("CZaza root directory is invalid"),
    );
  });
});

/**
 * Creates the minimum extension context required by the validation registration.
 *
 * @returns Mock extension context with subscriptions.
 *
 * @example
 * const context = createExtensionContext();
 */
function createExtensionContext(): vscodeTypes.ExtensionContext {
  return {
    subscriptions: [],
  } as unknown as vscodeTypes.ExtensionContext;
}

/**
 * Creates a temporary VS Code workspace folder mock.
 *
 * @param name - Human-readable name used in the temporary directory prefix.
 * @returns Mock workspace folder backed by a real temporary directory.
 *
 * @example
 * const workspace = await createTempWorkspaceFolder("app");
 */
async function createTempWorkspaceFolder(name: string): Promise<MockWorkspaceFolder> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), `czaza-${name}-`));

  return {
    uri: createUri(workspaceRoot),
    name,
    index: mocks.workspaceFolders.length,
  };
}

/**
 * Creates the minimum URI shape required by the validation tests.
 *
 * @param fsPath - Local file-system path represented by the URI.
 * @returns Mock VS Code file URI.
 *
 * @example
 * const uri = createUri("/workspace/project");
 */
function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
  } as vscodeTypes.Uri;
}
