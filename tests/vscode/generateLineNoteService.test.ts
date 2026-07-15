/**
 * Unit tests for single-line AI note generation and VS Code persistence.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { StoredLineNote } from "@shared/models/store/line";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  createDeepSeekClient: vi.fn(),
  getAiConfig: vi.fn(),
  getSettings: vi.fn(),
  getRelativePath: vi.fn(),
  openTextDocument: vi.fn(),
  resolveRoot: vi.fn(),
}));

vi.mock("vscode", () => ({
  workspace: {
    openTextDocument: runtimeMocks.openTextDocument,
  },
}));

vi.mock("@shared/providers/deepseek", () => ({
  createDeepSeekClient: runtimeMocks.createDeepSeekClient,
}));

vi.mock("@vscode/ai/getAiRequestConfigOrShowError", () => ({
  getAiRequestConfigOrShowError: runtimeMocks.getAiConfig,
}));

vi.mock("@vscode/config/czazaSettings", () => ({
  getCzazaSettings: runtimeMocks.getSettings,
}));

vi.mock("@vscode/config/resolveCzazaRootDirectory", () => ({
  getCzazaRelativePath: runtimeMocks.getRelativePath,
  resolveCzazaRootDirectory: runtimeMocks.resolveRoot,
}));

import {
  generateLineNoteForResource,
  generateLineNoteService,
} from "@vscode/services/generateLineNoteService";

const now = "2026-07-15T00:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  runtimeMocks.getAiConfig.mockResolvedValue(createAiConfig());
  runtimeMocks.getSettings.mockReturnValue({ outputDirectory: ".czaza" });
  runtimeMocks.getRelativePath.mockReturnValue("src/value.ts");
  runtimeMocks.resolveRoot.mockReturnValue({ rootDirectory: "/workspace" });
});

describe("generateLineNoteService()", () => {
  it("generates one stored line note with a bounded source context", async () => {
    const sourceLines = Array.from(
      { length: 50 },
      (_, index) => `const value${index + 1} = ${index + 1};`,
    );
    const complete = vi.fn().mockResolvedValue(JSON.stringify(createAiResponse()));
    const result = await generateLineNoteService({
      sourceCode: sourceLines.join("\n"),
      lineNumber: 25,
      relativePath: "src/values.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      aiClient: { complete },
      now,
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[0]).toContain("5: const value5 = 5;");
    expect(complete.mock.calls[0]?.[0]).toContain("45: const value45 = 45;");
    expect(complete.mock.calls[0]?.[0]).not.toContain("4: const value4 = 4;");
    expect(complete.mock.calls[0]?.[0]).not.toContain("46: const value46 = 46;");
    expect(result).toMatchObject({
      id: "line:25",
      line: 25,
      anchorText: "const value25 = 25;",
      aiExplanation: { summary: "Returns the value." },
      status: { content: "current", anchor: "confirmed" },
      createdBy: "ai",
      createdAt: now,
      updatedAt: now,
    });
  });

  it("regenerates AI content while preserving existing user metadata", async () => {
    const existing = createExistingLineNote();
    const result = await generateLineNoteService({
      sourceCode: "const value = 1;\nreturn value;",
      lineNumber: 2,
      relativePath: "src/value.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      aiClient: createFakeAiClient(),
      existingLineNote: existing,
      usedLineNoteIds: [existing.id],
      now,
    });

    expect(result).toMatchObject({
      id: existing.id,
      line: 2,
      anchorText: "return value;",
      userNote: "Keep this user note.",
      createdBy: "user",
      createdAt: existing.createdAt,
      updatedAt: now,
      aiExplanation: { summary: "Returns the value." },
      status: { content: "current", anchor: "confirmed" },
    });
  });

  it("creates a collision-free id when a relocated note owns the base id", async () => {
    const result = await generateLineNoteService({
      sourceCode: "const value = 1;\nreturn value;",
      lineNumber: 2,
      relativePath: "src/value.ts",
      responseLanguageInstruction: "Respond in English.",
      aiClient: createFakeAiClient(),
      usedLineNoteIds: ["line:2", "line:2:note:1"],
      now,
    });

    expect(result.id).toBe("line:2:note:2");
  });

  it("rejects invalid and ineligible lines before calling AI", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(createAiResponse()));
    const baseInput = {
      sourceCode: "const value = 1;\n// Comment only\nreturn value;",
      relativePath: "src/value.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      aiClient: { complete },
      now,
    };

    await expect(
      generateLineNoteService({ ...baseInput, lineNumber: 4 }),
    ).rejects.toThrow("Line 4 is outside the current document.");
    await expect(
      generateLineNoteService({ ...baseInput, lineNumber: 2 }),
    ).rejects.toThrow("Line 2 is not eligible for AI analysis.");
    expect(complete).not.toHaveBeenCalled();
  });

  it("allows explicit single-line analysis for an import line", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(createAiResponse()));
    const result = await generateLineNoteService({
      sourceCode: 'import value from "./value";\nuse(value);',
      lineNumber: 1,
      relativePath: "src/value.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      aiClient: { complete },
      now,
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      line: 1,
      anchorText: 'import value from "./value";',
      aiExplanation: { summary: "Returns the value." },
    });
  });
});

describe("generateLineNoteForResource()", () => {
  it("creates a missing source-file Store with Fake AI output", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(createAiResponse()));
    const getSourceFile = vi.fn().mockResolvedValue(undefined);
    const saveSourceFile = vi.fn().mockResolvedValue(undefined);
    const upsertLineNote = vi.fn();
    const notes = createNotes({ getSourceFile, saveSourceFile, upsertLineNote });
    const uri = createUri();

    runtimeMocks.openTextDocument.mockResolvedValue(createDocument());
    runtimeMocks.createDeepSeekClient.mockReturnValue({ complete });

    const result = await generateLineNoteForResource(
      {} as import("vscode").ExtensionContext,
      notes,
      uri,
      2,
    );

    expect(result).toBe(true);
    expect(runtimeMocks.createDeepSeekClient).toHaveBeenCalledWith({
      apiKey: "test-api-key",
      model: "deepseek-v4-flash",
      maxTokens: 4_000,
    });
    expect(upsertLineNote).not.toHaveBeenCalled();
    expect(saveSourceFile).toHaveBeenCalledWith(
      "/workspace",
      ".czaza",
      "src/value.ts",
      expect.objectContaining({
        lineNotes: [
          expect.objectContaining({
            line: 2,
            anchorText: "return value;",
            aiExplanation: expect.objectContaining({ summary: "Returns the value." }),
          }),
        ],
      }),
      expect.any(String),
    );
  });

  it("upserts one existing source-file line without saving the whole file directly", async () => {
    const existingLine = createExistingLineNote();
    const getSourceFile = vi.fn().mockResolvedValue({
      source: { sourceHash: "sha256:old" },
      sectionNotes: [],
      lineNotes: [existingLine],
    });
    const saveSourceFile = vi.fn();
    const upsertLineNote = vi.fn().mockResolvedValue(undefined);
    const notes = createNotes({ getSourceFile, saveSourceFile, upsertLineNote });

    runtimeMocks.openTextDocument.mockResolvedValue(createDocument());
    runtimeMocks.createDeepSeekClient.mockReturnValue(createFakeAiClient());

    await generateLineNoteForResource(
      {} as import("vscode").ExtensionContext,
      notes,
      createUri(),
      2,
    );

    expect(saveSourceFile).not.toHaveBeenCalled();
    expect(upsertLineNote).toHaveBeenCalledWith(
      "/workspace",
      ".czaza",
      "src/value.ts",
      expect.objectContaining({
        id: existingLine.id,
        userNote: existingLine.userNote,
        aiExplanation: expect.objectContaining({ summary: "Returns the value." }),
      }),
      expect.any(String),
    );
  });

  it("does not read or save notes when AI configuration is unavailable", async () => {
    const getSourceFile = vi.fn();
    const saveSourceFile = vi.fn();
    const upsertLineNote = vi.fn();
    const notes = createNotes({ getSourceFile, saveSourceFile, upsertLineNote });

    runtimeMocks.getAiConfig.mockResolvedValue(undefined);

    const result = await generateLineNoteForResource(
      {} as import("vscode").ExtensionContext,
      notes,
      createUri(),
      2,
    );

    expect(result).toBe(false);
    expect(runtimeMocks.openTextDocument).not.toHaveBeenCalled();
    expect(getSourceFile).not.toHaveBeenCalled();
    expect(saveSourceFile).not.toHaveBeenCalled();
    expect(upsertLineNote).not.toHaveBeenCalled();
  });

  it("does not write Store data when Fake AI fails", async () => {
    const getSourceFile = vi.fn().mockResolvedValue(undefined);
    const saveSourceFile = vi.fn();
    const upsertLineNote = vi.fn();
    const notes = createNotes({ getSourceFile, saveSourceFile, upsertLineNote });

    runtimeMocks.openTextDocument.mockResolvedValue(createDocument());
    runtimeMocks.createDeepSeekClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error("Fake AI failed.")),
    });

    await expect(
      generateLineNoteForResource(
        {} as import("vscode").ExtensionContext,
        notes,
        createUri(),
        2,
      ),
    ).rejects.toThrow("Fake AI failed.");
    expect(saveSourceFile).not.toHaveBeenCalled();
    expect(upsertLineNote).not.toHaveBeenCalled();
  });
});

/** Creates a valid normalized line-analysis response. */
function createAiResponse(): Record<string, unknown> {
  return {
    summary: "Returns the value.",
    detail: "The line returns the value created immediately above it.",
    aiNotes: ["The caller receives the current value."],
  };
}

/** Creates a Fake AI client returning valid line analysis. */
function createFakeAiClient(): AiClient {
  return {
    complete: vi.fn().mockResolvedValue(JSON.stringify(createAiResponse())),
  };
}

/** Creates an existing user-owned line note for regeneration tests. */
function createExistingLineNote(): StoredLineNote {
  return {
    id: "line:user-existing",
    line: 2,
    anchorText: "return oldValue;",
    userNote: "Keep this user note.",
    aiExplanation: { summary: "Old summary.", detail: "Old detail." },
    status: { content: "stale", anchor: "needsConfirmation" },
    createdBy: "user",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

/** Creates the configured Fake AI request values returned by VS Code settings. */
function createAiConfig(): Record<string, string> {
  return {
    provider: "deepseek",
    providerLabel: "DeepSeek",
    model: "deepseek-v4-flash",
    responseLanguage: "en",
    languageInstruction: "Respond in English.",
    apiKey: "test-api-key",
  };
}

/** Creates a two-line Fake VS Code document. */
function createDocument() {
  return {
    getText: () => "const value = 1;\nreturn value;",
    languageId: "typescript",
    lineCount: 2,
    lineAt: (index: number) => ({ text: index === 0 ? "const value = 1;" : "return value;" }),
  };
}

/** Creates the minimal Store surface required by the runtime entry. */
function createNotes({
  getSourceFile,
  saveSourceFile,
  upsertLineNote,
}: {
  getSourceFile: ReturnType<typeof vi.fn>;
  saveSourceFile: ReturnType<typeof vi.fn>;
  upsertLineNote: ReturnType<typeof vi.fn>;
}): WorkspaceNoteStore {
  return {
    cache: { getSourceFile, saveSourceFile },
    crud: { upsertLineNote },
  } as unknown as WorkspaceNoteStore;
}

/** Creates a local Fake VS Code URI. */
function createUri(): import("vscode").Uri {
  return {
    scheme: "file",
    fsPath: "/workspace/src/value.ts",
    toString: () => "file:///workspace/src/value.ts",
  } as import("vscode").Uri;
}
