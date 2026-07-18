/**
 * Unit tests for deleting one Navigator line note.
 */

import type * as vscodeTypes from "vscode";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rootDirectory: "/workspace",
  relativePath: "src/index.ts",
  outputDirectory: ".czaza",
}));

vi.mock("@vscode/config/resolveCzazaRootDirectory", () => ({
  resolveCzazaRootDirectory: () => ({ rootDirectory: mocks.rootDirectory }),
  getCzazaRelativePath: () => mocks.relativePath,
}));

vi.mock("@vscode/config/czazaSettings", () => ({
  getCzazaSettings: () => ({ outputDirectory: mocks.outputDirectory }),
}));

vi.mock("vscode", () => ({}));

import { deleteNavigatorLineNoteService } from "@vscode/services/deleteNavigatorLineNoteService";

describe("deleteNavigatorLineNoteService()", () => {
  it("deletes the line note from the current source file", async () => {
    const deleteLineNote = vi.fn().mockResolvedValue(undefined);
    const uri = createUri("/workspace/src/index.ts");

    await deleteNavigatorLineNoteService({
      currentUri: uri,
      notes: {
        crud: { deleteLineNote },
      } as never,
      lineId: "line:3",
    });

    expect(deleteLineNote).toHaveBeenCalledWith(
      "/workspace",
      ".czaza",
      "src/index.ts",
      "line:3",
      expect.any(String),
    );
  });
});

function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    path: fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}
