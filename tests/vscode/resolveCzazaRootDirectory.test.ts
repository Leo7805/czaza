/**
 * Unit tests for resolving the CZaza root directory from VS Code settings.
 */

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type * as vscodeTypes from "vscode";

import { beforeEach, describe, expect, it, vi } from "vitest";

type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
  configuredRootDirectory: "",
}));

vi.mock("vscode", () => ({
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
  },
}));

import {
  getCzazaRelativePath,
  isUriInsideCzazaRoot,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";

describe("resolveCzazaRootDirectory()", () => {
  beforeEach(() => {
    mocks.workspaceFolders.length = 0;
    mocks.configuredRootDirectory = "";
  });

  it("uses the resource workspace folder when rootDirectory is empty", async () => {
    const firstWorkspace = await createTempWorkspaceFolder("first");
    const secondWorkspace = await createTempWorkspaceFolder("second");
    const resource = createUri(path.join(secondWorkspace.uri.fsPath, "src", "index.ts"));

    mocks.workspaceFolders.push(firstWorkspace, secondWorkspace);

    const resolved = resolveCzazaRootDirectory(resource);

    expect(resolved).toEqual({
      workspaceFolderPath: secondWorkspace.uri.fsPath,
      rootDirectory: secondWorkspace.uri.fsPath,
      configuredRootDirectory: "",
      isConfigured: false,
    });
  });

  it("resolves configured relative roots from the resource workspace folder", async () => {
    const workspace = await createTempWorkspaceFolder("relative-root");
    const packageRoot = path.join(workspace.uri.fsPath, "packages", "app");
    await mkdir(packageRoot, { recursive: true });

    mocks.workspaceFolders.push(workspace);
    mocks.configuredRootDirectory = "packages/app";

    const resolved = resolveCzazaRootDirectory(createUri(path.join(packageRoot, "src", "index.ts")));

    expect(resolved.rootDirectory).toBe(packageRoot);
    expect(resolved.workspaceFolderPath).toBe(workspace.uri.fsPath);
    expect(resolved.configuredRootDirectory).toBe("packages/app");
    expect(resolved.isConfigured).toBe(true);
  });

  it("uses configured absolute roots directly", async () => {
    const workspace = await createTempWorkspaceFolder("absolute-workspace");
    const absoluteRoot = await mkdtemp(path.join(tmpdir(), "czaza-absolute-root-"));

    mocks.workspaceFolders.push(workspace);
    mocks.configuredRootDirectory = absoluteRoot;

    const resolved = resolveCzazaRootDirectory(createUri(path.join(workspace.uri.fsPath, "src", "index.ts")));

    expect(resolved.rootDirectory).toBe(absoluteRoot);
    expect(resolved.workspaceFolderPath).toBe(workspace.uri.fsPath);
    expect(resolved.isConfigured).toBe(true);
  });

  it("creates normalized CZaza-relative source paths", async () => {
    const workspace = await createTempWorkspaceFolder("relative-path");
    const sourceFile = path.join(workspace.uri.fsPath, "src", "index.ts");

    await mkdir(path.dirname(sourceFile), { recursive: true });
    await writeFile(sourceFile, "const value = 1;\n", "utf-8");

    expect(getCzazaRelativePath(createUri(sourceFile), workspace.uri.fsPath)).toBe("src/index.ts");
    expect(isUriInsideCzazaRoot(createUri(sourceFile), workspace.uri.fsPath)).toBe(true);
  });

  it("rejects files outside the resolved CZaza root", async () => {
    const workspace = await createTempWorkspaceFolder("inside");
    const outside = await mkdtemp(path.join(tmpdir(), "czaza-outside-"));
    const outsideFile = path.join(outside, "other.ts");

    await writeFile(outsideFile, "const outside = true;\n", "utf-8");

    expect(isUriInsideCzazaRoot(createUri(outsideFile), workspace.uri.fsPath)).toBe(false);
    expect(() => getCzazaRelativePath(createUri(outsideFile), workspace.uri.fsPath)).toThrow(
      "outside the configured CZaza root",
    );
  });

  it("throws when there is no open workspace folder", () => {
    expect(() => resolveCzazaRootDirectory()).toThrow("requires an open VS Code workspace folder");
  });

  it("throws when the resolved configured root does not exist", async () => {
    const workspace = await createTempWorkspaceFolder("missing-root");

    mocks.workspaceFolders.push(workspace);
    mocks.configuredRootDirectory = "missing";

    expect(() => resolveCzazaRootDirectory(createUri(path.join(workspace.uri.fsPath, "src.ts")))).toThrow(
      "does not exist",
    );
  });
});

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
 * Creates the minimum URI shape required by the resolver tests.
 *
 * @param fsPath - Local file-system path represented by the URI.
 * @returns Mock VS Code file URI.
 *
 * @example
 * const uri = createUri("/workspace/project/src/index.ts");
 */
function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
  } as vscodeTypes.Uri;
}
