/**
 * Unit tests for selected-section AI generation and precise Store updates.
 */

import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDeepSeekClient: vi.fn(),
  getAiConfig: vi.fn(),
  getSettings: vi.fn(),
  getRelativePath: vi.fn(),
  openTextDocument: vi.fn(),
  resolveRoot: vi.fn(),
}));

vi.mock("vscode", () => ({
  workspace: {
    openTextDocument: mocks.openTextDocument,
  },
}));

vi.mock("@shared/providers/deepseek", () => ({
  createDeepSeekClient: mocks.createDeepSeekClient,
}));

vi.mock("@vscode/ai/getAiRequestConfigOrShowError", () => ({
  getAiRequestConfigOrShowError: mocks.getAiConfig,
}));

vi.mock("@vscode/config/czazaSettings", () => ({
  getCzazaSettings: mocks.getSettings,
}));

vi.mock("@vscode/config/resolveCzazaRootDirectory", () => ({
  getCzazaRelativePath: mocks.getRelativePath,
  resolveCzazaRootDirectory: mocks.resolveRoot,
}));

import { generateSectionNoteForResource } from "@vscode/services/generateSectionNoteService";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAiConfig.mockResolvedValue({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    apiKey: "test-api-key",
    languageInstruction: "Respond in Simplified Chinese.",
  });
  mocks.getSettings.mockReturnValue({ outputDirectory: ".czaza" });
  mocks.getRelativePath.mockReturnValue("src/run.ts");
  mocks.resolveRoot.mockReturnValue({ rootDirectory: "/workspace" });
  mocks.openTextDocument.mockResolvedValue({
    languageId: "typescript",
    getText: () => "function run() {\n  return true;\n}",
  });
  mocks.createDeepSeekClient.mockReturnValue({
    complete: vi.fn().mockResolvedValue(
      JSON.stringify({
        sections: [
          {
            title: "Run function",
            kind: "function",
            range: { startLine: 1, endLine: 3 },
            summary: "执行操作。",
            detail: "这个 Section 包含函数体和返回行为。",
          },
        ],
      }),
    ),
  });
});

describe("generateSectionNoteForResource()", () => {
  it("updates only the selected section AI explanation", async () => {
    const updateSectionAiExplanation = vi.fn().mockResolvedValue(undefined);
    const notes = createNotes(updateSectionAiExplanation);
    const result = await generateSectionNoteForResource(
      {} as vscodeTypes.ExtensionContext,
      notes,
      createUri(),
      "section:run:1-3",
    );

    expect(result).toBe(true);
    expect(mocks.createDeepSeekClient).toHaveBeenCalledWith({
      apiKey: "test-api-key",
      model: "deepseek-v4-flash",
      maxTokens: 4_000,
    });
    expect(updateSectionAiExplanation).toHaveBeenCalledWith(
      "/workspace",
      ".czaza",
      "src/run.ts",
      "section:run:1-3",
      {
        summary: "执行操作。",
        detail: "这个 Section 包含函数体和返回行为。",
      },
      expect.any(String),
    );
  });

  it("rejects a missing section before calling AI or updating Store", async () => {
    const updateSectionAiExplanation = vi.fn();
    const notes = createNotes(updateSectionAiExplanation, []);

    await expect(
      generateSectionNoteForResource(
        {} as vscodeTypes.ExtensionContext,
        notes,
        createUri(),
        "section:missing",
      ),
    ).rejects.toThrow("Section note section:missing was not found");

    expect(mocks.createDeepSeekClient).not.toHaveBeenCalled();
    expect(updateSectionAiExplanation).not.toHaveBeenCalled();
  });
});

function createNotes(updateSectionAiExplanation: ReturnType<typeof vi.fn>, sectionNotes = [
  {
    id: "section:run:1-3",
    title: "Run function",
    kind: "function",
    range: { startLine: 1, endLine: 3 },
    anchorHash: "sha256:run",
    status: { content: "current", anchor: "confirmed" },
    createdBy: "ai",
  },
]) {
  return {
    cache: {
      getSourceFile: vi.fn().mockResolvedValue({
        source: { sourceHash: "sha256:file" },
        sectionNotes,
        lineNotes: [],
      }),
    },
    update: { updateSectionAiExplanation },
  } as never;
}

function createUri(): vscodeTypes.Uri {
  return { scheme: "file", fsPath: "/workspace/src/run.ts" } as vscodeTypes.Uri;
}
