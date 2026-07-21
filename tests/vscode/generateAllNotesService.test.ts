/**
 * Unit tests for coordinated file, section, and line note generation.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  getAiConfig: vi.fn(),
  getSettings: vi.fn(),
  getRelativePath: vi.fn(),
  resolveRoot: vi.fn(),
  openTextDocument: vi.fn(),
  createDeepSeekClient: vi.fn(),
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
  AllNotesBatchRequiredError,
  generateAllNotesForResource,
  generateAllNotesService,
} from "@vscode/services/generateAllNotesService";

const now = "2026-07-15T00:00:00.000Z";
const modelLimits = {
  modelContextWindowTokens: 1_000_000,
  modelMaxOutputTokens: 384_000,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateAllNotesService()", () => {
  it("generates all note levels with one filtered AI request", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(createAiResponse()));
    const createAiClient = vi.fn<(maxTokens: number) => AiClient>(() => ({ complete }));
    const sourceCode = [
      "// Adds two numbers.",
      "export function add(a: number, b: number) {",
      "  return a + b;",
      "}",
    ].join("\n");
    const result = await generateAllNotesService({
      sourceCode,
      relativePath: "src/add.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      ...modelLimits,
      createAiClient,
      now,
    });

    expect(createAiClient).toHaveBeenCalledOnce();
    expect(createAiClient).toHaveBeenCalledWith(9_960);
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[0]).toContain("Target line numbers: [2,3]");
    expect(result.fileNote?.aiExplanation?.summary).toBe("Adds two numbers.");
    expect(result.sectionNotes).toHaveLength(1);
    expect(result.lineNotes.map((line) => line.line)).toEqual([2, 3]);
    expect(result.lineNotes[1]?.anchorText).toBe("  return a + b;");
  });

  it("preserves user content while replacing generated AI notes", async () => {
    const existing = createExistingSourceFile();
    const createAiClient = (): AiClient => ({
      complete: vi.fn().mockResolvedValue(JSON.stringify(createAiResponse())),
    });
    const result = await generateAllNotesService({
      sourceCode: [
        "// Adds two numbers.",
        "export function add(a: number, b: number) {",
        "  return a + b;",
        "}",
      ].join("\n"),
      relativePath: "src/add.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      ...modelLimits,
      createAiClient,
      existingSourceFile: existing,
      now,
    });

    expect(result.fileNote).toMatchObject({
      userNote: "Keep the file note.",
      createdBy: "user",
      createdAt: existing.fileNote?.createdAt,
      aiExplanation: { summary: "Adds two numbers." },
    });
    expect(result.sectionNotes[0]).toMatchObject({
      id: "section:existing",
      userNote: "Keep the section note.",
      aiExplanation: { summary: "Declares the add function." },
    });
    expect(result.lineNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "line:existing-2",
          line: 2,
          userNote: "Keep line two.",
          anchorText: "export function add(a: number, b: number) {",
        }),
        expect.objectContaining({
          id: "line:user-only",
          line: 4,
          userNote: "Keep this unmatched user line.",
        }),
      ]),
    );
    expect(result.lineNotes.some((line) => line.id === "line:old-ai-only")).toBe(false);
  });

  it("rejects an oversized line request before creating an AI client", async () => {
    const createAiClient = vi.fn<(maxTokens: number) => AiClient>();
    const sourceCode = Array.from(
      { length: 301 },
      (_, index) => `const value${index} = ${index};`,
    ).join("\n");

    await expect(
      generateAllNotesService({
        sourceCode,
        relativePath: "src/large.ts",
        programmingLanguage: "typescript",
        responseLanguageInstruction: "Respond in English.",
        ...modelLimits,
        createAiClient,
        now,
      }),
    ).rejects.toThrow("All Notes generation request rejected: too-many-lines.");
    expect(createAiClient).not.toHaveBeenCalled();
  });

  it("uses the configured candidate-line limit", async () => {
    const createAiClient = vi.fn<(maxTokens: number) => AiClient>();

    await expect(
      generateAllNotesService({
        sourceCode: ["const one = 1;", "const two = 2;", "const three = 3;"].join("\n"),
        relativePath: "src/configured-limit.ts",
        programmingLanguage: "typescript",
        responseLanguageInstruction: "Respond in English.",
        ...modelLimits,
        maxCandidateLines: 2,
        createAiClient,
        now,
      }),
    ).rejects.toMatchObject({
      name: "AllNotesLineLimitError",
      sourceLineCount: 3,
      candidateLineCount: 3,
      maxCandidateLines: 2,
    });
    expect(createAiClient).not.toHaveBeenCalled();
  });

  it("requires confirmation before a model-limited request is split into batches", async () => {
    const createAiClient = vi.fn<(maxTokens: number) => AiClient>();

    await expect(
      generateAllNotesService({
        sourceCode: ["const one = 1;", "const two = 2;", "const three = 3;"].join("\n"),
        relativePath: "src/batched.ts",
        programmingLanguage: "typescript",
        responseLanguageInstruction: "Respond in English.",
        modelContextWindowTokens: 1_000_000,
        modelMaxOutputTokens: 10_000,
        maxCandidateLines: 10,
        createAiClient,
        now,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AllNotesBatchRequiredError>>({
        name: "AllNotesBatchRequiredError",
        candidateLineCount: 3,
        batchCount: 2,
        effectiveOutputLimit: 10_000,
      }),
    );
    expect(createAiClient).not.toHaveBeenCalled();
  });

  it("generates confirmed batches and merges line-only follow-up results", async () => {
    const responses = [
      {
        file: { summary: "Defines values.", detail: "Defines three constants." },
        sections: [
          {
            title: "Values",
            kind: "declarations",
            range: { startLine: 1, endLine: 3 },
            summary: "Declares values.",
            detail: "Contains constant declarations.",
          },
        ],
        lines: [
          { lineNumber: 1, summary: "Defines one.", detail: "Declares the first value." },
          { lineNumber: 2, summary: "Defines two.", detail: "Declares the second value." },
        ],
      },
      {
        lines: [
          { lineNumber: 3, summary: "Defines three.", detail: "Declares the third value." },
        ],
      },
    ];
    const complete = vi.fn().mockImplementation(async () => JSON.stringify(responses.shift()));
    const createAiClient = vi.fn<(maxTokens: number) => AiClient>(() => ({ complete }));

    const result = await generateAllNotesService({
      sourceCode: ["const one = 1;", "const two = 2;", "const three = 3;"].join("\n"),
      relativePath: "src/batched.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      modelContextWindowTokens: 1_000_000,
      modelMaxOutputTokens: 10_000,
      maxCandidateLines: 10,
      allowBatching: true,
      createAiClient,
      now,
    });

    expect(createAiClient).toHaveBeenCalledTimes(2);
    expect(createAiClient.mock.calls.map(([maxTokens]) => maxTokens)).toEqual([9_960, 180]);
    expect(complete.mock.calls[0]?.[0]).toContain("Analyze the file, its meaningful sections");
    expect(complete.mock.calls[1]?.[0]).toContain("return line analysis only");
    expect(result.lineNotes.map((note) => note.line)).toEqual([1, 2, 3]);
  });
});

describe("generateAllNotesForResource()", () => {
  it("reads VS Code state, calls Fake AI, and saves through the Store cache", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(createAiResponse()));
    const getSourceFile = vi.fn().mockResolvedValue(undefined);
    const saveSourceFile = vi.fn().mockResolvedValue(undefined);
    const notes = {
      cache: { getSourceFile, saveSourceFile },
    } as unknown as WorkspaceNoteStore;
    const context = {} as import("vscode").ExtensionContext;
    const uri = { scheme: "file", fsPath: "/workspace/src/add.ts" } as import("vscode").Uri;

    runtimeMocks.getAiConfig.mockResolvedValue({
      provider: "deepseek",
      providerLabel: "DeepSeek",
      model: "deepseek-v4-flash",
      responseLanguage: "en",
      languageInstruction: "Respond in English.",
      apiKey: "test-api-key",
    });
    runtimeMocks.openTextDocument.mockResolvedValue({
      getText: () => [
        "// Adds two numbers.",
        "export function add(a: number, b: number) {",
        "  return a + b;",
        "}",
      ].join("\n"),
      languageId: "typescript",
    });
    runtimeMocks.resolveRoot.mockReturnValue({ rootDirectory: "/workspace" });
    runtimeMocks.getRelativePath.mockReturnValue("src/add.ts");
    runtimeMocks.getSettings.mockReturnValue({
      ai: { maxAnalysisLines: 300 },
      outputDirectory: ".czaza",
    });
    runtimeMocks.createDeepSeekClient.mockReturnValue({ complete });

    const result = await generateAllNotesForResource(context, notes, uri);

    expect(result).toBe(true);
    expect(runtimeMocks.getAiConfig).toHaveBeenCalledWith(context, uri);
    expect(getSourceFile).toHaveBeenCalledWith(
      "/workspace",
      ".czaza",
      "src/add.ts",
    );
    expect(runtimeMocks.createDeepSeekClient).toHaveBeenCalledWith({
      apiKey: "test-api-key",
      model: "deepseek-v4-flash",
      maxTokens: 9_960,
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(saveSourceFile).toHaveBeenCalledOnce();
    expect(saveSourceFile).toHaveBeenCalledWith(
      "/workspace",
      ".czaza",
      "src/add.ts",
      expect.objectContaining({
        fileNote: expect.objectContaining({
          aiExplanation: expect.objectContaining({ summary: "Adds two numbers." }),
        }),
        sectionNotes: expect.arrayContaining([
          expect.objectContaining({ title: "Add function" }),
        ]),
        lineNotes: expect.arrayContaining([
          expect.objectContaining({ line: 2 }),
          expect.objectContaining({ line: 3 }),
        ]),
      }),
      expect.any(String),
    );
  });

  it("stops before reading or saving when AI configuration is unavailable", async () => {
    const getSourceFile = vi.fn();
    const saveSourceFile = vi.fn();
    const notes = {
      cache: { getSourceFile, saveSourceFile },
    } as unknown as WorkspaceNoteStore;
    const context = {} as import("vscode").ExtensionContext;
    const uri = { scheme: "file", fsPath: "/workspace/src/add.ts" } as import("vscode").Uri;

    runtimeMocks.getAiConfig.mockResolvedValue(undefined);

    const result = await generateAllNotesForResource(context, notes, uri);

    expect(result).toBe(false);
    expect(runtimeMocks.openTextDocument).not.toHaveBeenCalled();
    expect(runtimeMocks.createDeepSeekClient).not.toHaveBeenCalled();
    expect(getSourceFile).not.toHaveBeenCalled();
    expect(saveSourceFile).not.toHaveBeenCalled();
  });
});

/** Creates a valid combined response for the filtered source fixture. */
function createAiResponse(): Record<string, unknown> {
  return {
    file: {
      summary: "Adds two numbers.",
      detail: "The file exports a function that adds two numeric arguments.",
    },
    sections: [
      {
        title: "Add function",
        kind: "function",
        range: { startLine: 2, endLine: 4 },
        summary: "Declares the add function.",
        detail: "The function accepts two values and returns their sum.",
      },
    ],
    lines: [
      {
        lineNumber: 2,
        summary: "Declares the function.",
        detail: "The line exports the function and declares its parameters.",
      },
      {
        lineNumber: 3,
        summary: "Returns the sum.",
        detail: "The line adds both parameters and returns the result.",
      },
    ],
  };
}

/** Creates existing notes covering matched and unmatched merge cases. */
function createExistingSourceFile(): StoredSourceFile {
  const createdAt = "2026-01-01T00:00:00.000Z";

  return {
    source: {
      sourceHash: "sha256:old",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "Keep the file note.",
      aiExplanation: { summary: "Old file summary.", detail: "Old file detail." },
      status: { content: "stale", anchor: "confirmed" },
      createdBy: "user",
      createdAt,
      updatedAt: createdAt,
    },
    sectionNotes: [
      {
        id: "section:existing",
        title: "Old section",
        range: { startLine: 2, endLine: 4 },
        anchorHash: "sha256:old-section",
        userNote: "Keep the section note.",
        aiExplanation: { summary: "Old section.", detail: "Old section detail." },
        status: { content: "stale", anchor: "confirmed" },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    lineNotes: [
      {
        id: "line:existing-2",
        line: 2,
        anchorText: "old declaration",
        userNote: "Keep line two.",
        aiExplanation: { summary: "Old line.", detail: "Old line detail." },
        status: { content: "stale", anchor: "confirmed" },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "line:user-only",
        line: 4,
        anchorText: "}",
        userNote: "Keep this unmatched user line.",
        status: { content: "current", anchor: "confirmed" },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "line:old-ai-only",
        line: 1,
        anchorText: "// Old comment",
        aiExplanation: { summary: "Old AI line.", detail: "Old AI line detail." },
        status: { content: "stale", anchor: "confirmed" },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}
