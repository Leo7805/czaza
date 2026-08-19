/**
 * Tests shared Runtime Note State detection entry points.
 */

import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCzazaSettings: vi.fn(),
  resolveCzazaRootDirectory: vi.fn(),
  getResourceFingerprint: vi.fn(),
  refreshRuntimeNoteStateService: vi.fn(),
  refreshBinaryRuntimeNoteStateService: vi.fn(),
  refreshMissingRuntimeNoteStateService: vi.fn(),
}));

vi.mock("vscode", () => ({
  Uri: {
    file: (fsPath: string) => ({ scheme: "file", fsPath }),
  },
}));

vi.mock("@vscode/config/czazaSettings", () => ({
  getCzazaSettings: mocks.getCzazaSettings,
}));

vi.mock("@vscode/config/resolveCzazaRootDirectory", () => ({
  resolveCzazaRootDirectory: mocks.resolveCzazaRootDirectory,
}));

vi.mock("@vscode/services/resourceFingerprint/getResourceFingerprintService", () => ({
  getResourceFingerprint: mocks.getResourceFingerprint,
}));

vi.mock("@vscode/services/runtimeState/refreshRuntimeNoteStateService", () => ({
  refreshRuntimeNoteStateService: mocks.refreshRuntimeNoteStateService,
}));

vi.mock("@vscode/services/runtimeState/refreshBinaryRuntimeNoteStateService", () => ({
  refreshBinaryRuntimeNoteStateService: mocks.refreshBinaryRuntimeNoteStateService,
}));

vi.mock("@vscode/services/runtimeState/refreshMissingRuntimeNoteStateService", () => ({
  refreshMissingRuntimeNoteStateService: mocks.refreshMissingRuntimeNoteStateService,
}));

import { RuntimeNoteStateDetectionController } from "@vscode/services/runtimeState/RuntimeNoteStateDetectionController";

describe("RuntimeNoteStateDetectionController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCzazaSettings.mockReturnValue({ outputDirectory: ".czaza" });
    mocks.resolveCzazaRootDirectory.mockReturnValue({ rootDirectory: "/workspace" });
    mocks.refreshRuntimeNoteStateService.mockResolvedValue({
      kind: "current",
      registryChange: "none",
    });
    mocks.refreshBinaryRuntimeNoteStateService.mockResolvedValue({
      kind: "current",
      registryChange: "none",
    });
    mocks.refreshMissingRuntimeNoteStateService.mockResolvedValue({
      kind: "affected",
      registryChange: "set",
    });
  });

  it("routes one current text resource through the shared detector", async () => {
    const notes = createNotes({});
    const registry = {} as never;
    const document = createDocument("/workspace/src/index.ts");
    const canApply = vi.fn().mockReturnValue(true);
    const controller = new RuntimeNoteStateDetectionController(
      notes,
      registry,
      () => "2026-07-30T00:00:00.000Z",
    );

    await controller.detectCurrentFileNotes(document, canApply);

    expect(mocks.refreshRuntimeNoteStateService).toHaveBeenCalledWith({
      document,
      notes,
      registry,
      now: "2026-07-30T00:00:00.000Z",
      canApply,
    });
  });

  it("uses its scoped Note Store for current text detection", async () => {
    const notes = createNotes({});
    const registry = {} as never;
    const document = createDocument("/workspace/src/index.ts");
    const controller = new RuntimeNoteStateDetectionController(
      notes,
      registry,
      () => "2026-07-30T00:00:00.000Z",
    );

    await controller.detectCurrentFileNotes(document);

    expect(mocks.refreshRuntimeNoteStateService).toHaveBeenCalledWith({
      document,
      notes,
      registry,
      now: "2026-07-30T00:00:00.000Z",
    });
  });

  it("checks only indexed resources that contain File Notes", async () => {
    const textDocument = createDocument("/workspace/src/text.ts");
    const notes = createNotes({
      "src/text.ts": { fileNote: {} },
      "src/binary.png": { fileNote: {} },
      "src/missing.ts": { fileNote: {} },
      "src/section-only.ts": { sectionNotes: [{}] },
    });
    const registry = {} as never;
    const controller = new RuntimeNoteStateDetectionController(
      notes,
      registry,
      () => "2026-07-30T00:00:00.000Z",
    );

    mocks.getResourceFingerprint.mockImplementation(
      async (uri: vscodeTypes.Uri) => {
        if (uri.fsPath.endsWith("text.ts")) {
          return { kind: "text", document: textDocument, hash: "text" };
        }

        if (uri.fsPath.endsWith("binary.png")) {
          return { kind: "binary", hash: "binary" };
        }

        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    );

    const result = await controller.detectAllFileNotes({
      scheme: "file",
      fsPath: "/workspace/src/current.ts",
    } as vscodeTypes.Uri);

    expect(result).toEqual({ checked: 3, skipped: 2, failed: [] });
    expect(mocks.refreshRuntimeNoteStateService).toHaveBeenCalledWith({
      document: textDocument,
      notes,
      registry,
      now: "2026-07-30T00:00:00.000Z",
    });
    expect(mocks.refreshBinaryRuntimeNoteStateService).toHaveBeenCalledWith({
      uri: expect.objectContaining({ fsPath: "/workspace/src/binary.png" }),
      currentSourceHash: "binary",
      notes,
      registry,
      now: "2026-07-30T00:00:00.000Z",
    });
    expect(mocks.refreshMissingRuntimeNoteStateService).toHaveBeenCalledWith({
      uri: expect.objectContaining({ fsPath: "/workspace/src/missing.ts" }),
      notes,
      registry,
      now: "2026-07-30T00:00:00.000Z",
    });
  });
});

/**
 * Creates a minimal Note Store with indexed source entries.
 *
 * @param sourceFiles - Stored source fixtures keyed by root-relative path.
 * @returns Note Store test double.
 */
function createNotes(sourceFiles: Record<string, unknown>): never {
  return {
    cache: {
      loadIndex: vi.fn().mockResolvedValue({
        files: Object.fromEntries(
          ["", ...Object.keys(sourceFiles)].map((relativePath) => [
            relativePath,
            { noteFile: `${relativePath || "project"}.json` },
          ]),
        ),
      }),
      getSourceFile: vi.fn(
        async (_root: string, _output: string, relativePath: string) =>
          sourceFiles[relativePath],
      ),
    },
  } as never;
}

/**
 * Creates a minimal text document fixture.
 *
 * @param fsPath - Absolute source path.
 * @returns Runtime detection document.
 */
function createDocument(fsPath: string): vscodeTypes.TextDocument {
  return {
    uri: { scheme: "file", fsPath },
    languageId: "typescript",
    getText: () => "export const value = 1;",
  } as vscodeTypes.TextDocument;
}
