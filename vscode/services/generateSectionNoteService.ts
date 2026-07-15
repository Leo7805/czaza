/**
 * Generates and persists AI content for one existing section note.
 */

import * as vscode from "vscode";

import type { AiClient } from "@shared/ai/aiClient";
import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";
import type { AIExplanation } from "@shared/models/ai/common";
import type { StoredSectionNote } from "@shared/models/store/section";
import { explainSelectedSectionPrompt } from "@shared/prompts/explainSelectedSectionPrompt";
import { createDeepSeekClient } from "@shared/providers/deepseek";
import { explainSelectedSectionService } from "@shared/services/explainSelectedSectionService";
import { getAiRequestConfigOrShowError } from "@vscode/ai/getAiRequestConfigOrShowError";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";

/** Provider-independent input for one selected-section AI request. */
export type GenerateSectionNoteInput = {
  /** Complete current source text. */
  sourceCode: string;
  /** Root-relative source path included as AI context. */
  relativePath: string;
  /** Open-ended VS Code language identifier. */
  programmingLanguage?: string;
  /** Prompt instruction resolved from the response-language setting. */
  responseLanguageInstruction: string;
  /** Existing section whose AI content is being regenerated. */
  section: StoredSectionNote;
  /** AI client used to complete the selected-section prompt. */
  aiClient: AiClient;
};

/**
 * Generates AI content for one existing section without changing its identity.
 *
 * @param input - Source context, selected section, language instruction, and AI client.
 * @returns New AI explanation content for the selected section.
 *
 * @example
 * const explanation = await generateSectionNoteService({
 *   sourceCode: "function run() { return true; }",
 *   relativePath: "src/run.ts",
 *   responseLanguageInstruction: "Respond in Simplified Chinese.",
 *   section,
 *   aiClient,
 * });
 */
export async function generateSectionNoteService(
  input: GenerateSectionNoteInput,
): Promise<AIExplanation> {
  const sourceLines = input.sourceCode.split(/\r?\n/);
  const prompt = explainSelectedSectionPrompt({
    sourceCode: input.sourceCode,
    filePath: input.relativePath,
    ...(input.programmingLanguage
      ? { programmingLanguage: input.programmingLanguage }
      : {}),
    responseLanguageInstruction: input.responseLanguageInstruction,
    sectionTitle: input.section.title,
    ...(input.section.kind ? { sectionKind: input.section.kind } : {}),
    sectionStartLine: input.section.range.startLine,
    sectionEndLine: input.section.range.endLine,
    skipDependencyDirectives:
      AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled,
  });
  const analysis = await explainSelectedSectionService(prompt, input.aiClient, {
    lineCount: sourceLines.length,
  });

  return {
    summary: analysis.summary,
    detail: analysis.detail,
    ...(analysis.aiNotes ? { aiNotes: analysis.aiNotes } : {}),
  };
}

/**
 * Resolves VS Code state, regenerates one section, and updates only that section.
 *
 * @param context - Extension context used to resolve the provider API key.
 * @param notes - Shared workspace note store.
 * @param uri - Local source-file URI that owns the section.
 * @param sectionId - Stable ID of the section to regenerate.
 * @returns `true` after updating the section, or `false` when AI configuration is unavailable.
 * @throws Error when the source file or section ID cannot be found.
 *
 * @example
 * await generateSectionNoteForResource(context, notes, document.uri, "section:run:1-3");
 */
export async function generateSectionNoteForResource(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  sectionId: string,
): Promise<boolean> {
  const aiConfig = await getAiRequestConfigOrShowError(context, uri);

  if (!aiConfig) {
    return false;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const resolvedRoot = resolveCzazaRootDirectory(uri);
  const relativePath = getCzazaRelativePath(uri, resolvedRoot.rootDirectory);
  const settings = getCzazaSettings(uri);
  const sourceFile = await notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
  );
  const section = sourceFile?.sectionNotes.find((candidate) => candidate.id === sectionId);

  if (!sourceFile) {
    throw new Error(`No stored notes found for ${relativePath}.`);
  }

  if (!section) {
    throw new Error(`Section note ${sectionId} was not found for ${relativePath}.`);
  }

  const aiExplanation = await generateSectionNoteService({
    sourceCode: document.getText(),
    relativePath,
    programmingLanguage: document.languageId,
    responseLanguageInstruction: aiConfig.languageInstruction,
    section,
    aiClient: createRuntimeAiClient(aiConfig),
  });

  await notes.update.updateSectionAiExplanation(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
    sectionId,
    aiExplanation,
    new Date().toISOString(),
  );

  return true;
}

/** Creates the configured provider client for one selected-section request. */
function createRuntimeAiClient(
  config: NonNullable<Awaited<ReturnType<typeof getAiRequestConfigOrShowError>>>,
): AiClient {
  if (config.provider === "deepseek") {
    return createDeepSeekClient({
      apiKey: config.apiKey,
      model: config.model,
      maxTokens: AI_REQUEST_DEFAULTS.section.maxOutputTokens,
    });
  }

  throw new Error(`Unsupported AI provider: ${String(config.provider)}`);
}
