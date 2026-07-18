/**
 * Unit tests for deleting one Navigator section note.
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

import { deleteNavigatorSectionNoteService } from "@vscode/services/deleteNavigatorSectionNoteService";

describe("deleteNavigatorSectionNoteService()", () => {
  it("deletes the section note from the current source file", async () => {
    const deleteSectionNote = vi.fn().mockResolvedValue(undefined);
    const uri = createUri("/workspace/src/index.ts");

    await deleteNavigatorSectionNoteService({
      currentUri: uri,
      notes: {
        crud: { deleteSectionNote },
      } as never,
      sectionId: "section:run:1-3",
    });

    expect(deleteSectionNote).toHaveBeenCalledWith(
      "/workspace",
      ".czaza",
      "src/index.ts",
      "section:run:1-3",
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
