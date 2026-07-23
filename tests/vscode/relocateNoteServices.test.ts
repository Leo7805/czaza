/** Unit tests for atomic Section/Line Note relocation services. */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";
import {
  relocateLineNoteService,
  relocateSectionNoteService,
} from "@vscode/services/noteRelocation";

const mocks = vi.hoisted(() => ({
  sourceFile: undefined as StoredSourceFile | undefined,
  saveSourceFile: vi.fn(),
  sourceText: "one\ntwo\nthree\nfour",
}));

vi.mock("vscode", () => ({}));
vi.mock("@vscode/config/czazaSettings", () => ({
  getCzazaSettings: () => ({ outputDirectory: ".czaza" }),
}));
vi.mock("@vscode/config/resolveCzazaRootDirectory", () => ({
  resolveCzazaRootDirectory: () => ({ rootDirectory: "/workspace" }),
  getCzazaRelativePath: () => "src/index.ts",
}));
vi.mock("@vscode/services/resourceFingerprint/getResourceFingerprintService", () => ({
  getResourceFingerprint: async () => {
    const lines = mocks.sourceText.split("\n");
    return {
      kind: "text",
      hash: createSourceHash(mocks.sourceText),
      programmingLanguage: "typescript",
      document: {
        lineCount: lines.length,
        getText: () => mocks.sourceText,
        lineAt: (line: number) => ({ text: lines[line] ?? "" }),
      },
    };
  },
}));

describe("relocateSectionNoteService()", () => {
  beforeEach(resetMocks);

  it("updates range and anchor while preserving stale content status", async () => {
    mocks.sourceFile = createSourceFile();

    await relocateSectionNoteService({
      uri: {} as never,
      notes: createNotes(),
      sectionId: "section:one",
      startLine: 2,
      endLine: 3,
    });

    const saved = mocks.saveSourceFile.mock.calls[0]?.[3] as StoredSourceFile;
    expect(saved.sectionNotes[0]).toMatchObject({
      id: "section:one",
      range: { startLine: 2, endLine: 3 },
      anchorHash: createSourceHash("two\nthree"),
      status: { content: "stale", anchor: "confirmed" },
    });
    expect(mocks.saveSourceFile).toHaveBeenCalledOnce();
  });

  it("rejects a range outside the source document without saving", async () => {
    mocks.sourceFile = createSourceFile();

    await expect(
      relocateSectionNoteService({
        uri: {} as never,
        notes: createNotes(),
        sectionId: "section:one",
        startLine: 2,
        endLine: 8,
      }),
    ).rejects.toThrow("exceeds source line count");
    expect(mocks.saveSourceFile).not.toHaveBeenCalled();
  });
});

describe("relocateLineNoteService()", () => {
  beforeEach(resetMocks);

  it("updates line and anchor text while preserving stale content status", async () => {
    mocks.sourceFile = createSourceFile();

    await relocateLineNoteService({
      uri: {} as never,
      notes: createNotes(),
      lineId: "line:one",
      line: 3,
    });

    const saved = mocks.saveSourceFile.mock.calls[0]?.[3] as StoredSourceFile;
    expect(saved.lineNotes.find(({ id }) => id === "line:one")).toMatchObject({
      line: 3,
      anchorText: "three",
      status: { content: "stale", anchor: "confirmed" },
    });
  });

  it("rejects a target line already owned by another Line Note", async () => {
    mocks.sourceFile = createSourceFile();

    await expect(
      relocateLineNoteService({
        uri: {} as never,
        notes: createNotes(),
        lineId: "line:one",
        line: 4,
      }),
    ).rejects.toThrow("already has another Line Note");
    expect(mocks.saveSourceFile).not.toHaveBeenCalled();
  });
});

function resetMocks(): void {
  mocks.sourceFile = undefined;
  mocks.sourceText = "one\ntwo\nthree\nfour";
  mocks.saveSourceFile.mockReset();
}

function createNotes() {
  return {
    cache: {
      getSourceFile: vi.fn().mockImplementation(async () => mocks.sourceFile),
      saveSourceFile: mocks.saveSourceFile,
    },
  } as never;
}

function createSourceFile(): StoredSourceFile {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return {
    source: { sourceHash: "sha256:old", programmingLanguage: "typescript" },
    sectionNotes: [
      {
        id: "section:one",
        title: "One",
        range: { startLine: 1, endLine: 2 },
        anchorHash: "sha256:old-section",
        status: { content: "stale", anchor: "needsConfirmation" },
        createdBy: "ai",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    lineNotes: [
      {
        id: "line:one",
        line: 1,
        anchorText: "one",
        status: { content: "stale", anchor: "needsConfirmation" },
        createdBy: "ai",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "line:other",
        line: 4,
        anchorText: "four",
        status: { content: "current", anchor: "confirmed" },
        createdBy: "user",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}
