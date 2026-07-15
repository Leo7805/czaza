/**
 * Generates and persists AI notes for meaningful lines near the active line.
 */

import * as vscode from "vscode";

import type { AiClient } from "@shared/ai/aiClient";
import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";
import type { LineAnalysisEntry } from "@shared/models/ai/line";
import type { StoredLineNote } from "@shared/models/store/line";
import { explainLineBatchPrompt } from "@shared/prompts/explainLineBatchPrompt";
import { createDeepSeekClient } from "@shared/providers/deepseek";
import { createLineNoteFromAiAnalysis } from "@shared/services/aiToDomainService";
import { createStoredLineNote, createStoredSourceFile } from "@shared/services/domainToStoreService";
import { explainLineBatchService } from "@shared/services/explainLineBatchService";
import {
  selectLineAnalysisCandidates,
  type LineAnalysisCandidate,
} from "@shared/services/lineAnalysisCandidateService";
import { createAvailableLineNoteId } from "@shared/services/notes/lineNoteIdentityService";
import { getAiRequestConfigOrShowError } from "@vscode/ai/getAiRequestConfigOrShowError";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";

/** Provider-independent input for nearby line-batch generation. */
export type GenerateLineBatchNotesInput = {
  /** Complete current source text. */
  sourceCode: string;
  /** One-based active line used as the center of the nearby range. */
  activeLine: number;
  /** Root-relative source path included as AI context. */
  relativePath: string;
  /** Open-ended VS Code language identifier. */
  programmingLanguage?: string;
  /** Prompt instruction resolved from the response-language setting. */
  responseLanguageInstruction: string;
  /** Existing line notes used to preserve identity and user content. */
  existingLineNotes?: readonly StoredLineNote[];
  /** Whether existing AI notes should be skipped. */
  onlyMissing: boolean;
  /** Existing line-note identifiers used to prevent collisions. */
  usedLineNoteIds?: readonly string[];
  /** AI client used to complete the batch prompt. */
  aiClient: AiClient;
  /** ISO timestamp used for generated and updated metadata. */
  now: string;
};

/**
 * Generates nearby line notes with one batch AI request.
 *
 * @param input - Source context, active line, existing notes, and AI client.
 * @returns Stored line notes ready to persist.
 *
 * @example
 * const notes = await generateLineBatchNotesService({
 *   sourceCode: "const value = 1;\nreturn value;",
 *   activeLine: 2,
 *   relativePath: "src/value.ts",
 *   responseLanguageInstruction: "Respond in English.",
 *   onlyMissing: true,
 *   aiClient,
 *   now: new Date().toISOString(),
 * });
 */
export async function generateLineBatchNotesService(
  input: GenerateLineBatchNotesInput,
): Promise<StoredLineNote[]> {
  const sourceLines = input.sourceCode.split(/\r?\n/);
  const candidates = selectNearbyCandidates(
    input.sourceCode,
    input.programmingLanguage,
    input.activeLine,
  );
  const existingByLine = new Map(
    (input.existingLineNotes ?? []).map((note) => [note.line, note]),
  );
  const requestedCandidates = input.onlyMissing
    ? candidates.filter((candidate) => !existingByLine.get(candidate.lineNumber)?.aiExplanation)
    : candidates;

  if (requestedCandidates.length === 0) {
    return [];
  }

  const prompt = explainLineBatchPrompt({
    sourceLines: requestedCandidates,
    filePath: input.relativePath,
    ...(input.programmingLanguage
      ? { programmingLanguage: input.programmingLanguage }
      : {}),
    responseLanguageInstruction: input.responseLanguageInstruction,
  });
  const analyses = await explainLineBatchService(prompt, input.aiClient, {
    requestedLineNumbers: requestedCandidates.map((candidate) => candidate.lineNumber),
  });

  return analyses.map((analysis) => createStoredLineNoteFromAnalysis(
    analysis,
    sourceLines,
    existingByLine.get(analysis.lineNumber),
    input.usedLineNoteIds ?? [],
    input.now,
  ));
}

/**
 * Resolves VS Code state, generates nearby line notes, and persists each result.
 *
 * @param context - Extension context used to resolve the provider API key.
 * @param notes - Shared workspace note store.
 * @param uri - Local source-file URI that owns the active line.
 * @param activeLine - One-based active editor line.
 * @returns `true` after saving notes, or `false` when configuration is unavailable.
 *
 * @example
 * await generateLineBatchNotesForResource(context, notes, document.uri, 42);
 */
export async function generateLineBatchNotesForResource(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  activeLine: number,
): Promise<boolean> {
  const aiConfig = await getAiRequestConfigOrShowError(context, uri);

  if (!aiConfig) {
    return false;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const resolvedRoot = resolveCzazaRootDirectory(uri);
  const relativePath = getCzazaRelativePath(uri, resolvedRoot.rootDirectory);
  const settings = getCzazaSettings(uri);
  const existingSourceFile = await notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
  );
  const existingLineNotes = existingSourceFile?.lineNotes ?? [];
  const onlyMissing = !existingLineNotes.find((note) => note.line === activeLine)?.aiExplanation;
  const now = new Date().toISOString();
  const generatedLineNotes = await generateLineBatchNotesService({
    sourceCode: document.getText(),
    activeLine,
    relativePath,
    programmingLanguage: document.languageId,
    responseLanguageInstruction: aiConfig.languageInstruction,
    existingLineNotes,
    onlyMissing,
    usedLineNoteIds: existingLineNotes.map((note) => note.id),
    aiClient: createRuntimeAiClient(aiConfig),
    now,
  });

  if (generatedLineNotes.length === 0) {
    return false;
  }

  if (!existingSourceFile) {
    const sourceFile = createStoredSourceFile({
      sourceCode: document.getText(),
      programmingLanguage: document.languageId,
      lineNotes: generatedLineNotes,
      now,
    });

    await notes.cache.saveSourceFile(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
      sourceFile,
      now,
    );
    return true;
  }

  for (const lineNote of generatedLineNotes) {
    await notes.crud.upsertLineNote(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
      lineNote,
      now,
    );
  }

  return true;
}

/** Selects meaningful candidates inside the configured nearby-line window. */
function selectNearbyCandidates(
  sourceCode: string,
  programmingLanguage: string | undefined,
  activeLine: number,
): LineAnalysisCandidate[] {
  const lines = sourceCode.split(/\r?\n/);
  const startLine = Math.max(1, activeLine - AI_REQUEST_DEFAULTS.lineBatch.surroundingLineRadius);
  const endLine = Math.min(
    lines.length,
    activeLine + AI_REQUEST_DEFAULTS.lineBatch.surroundingLineRadius,
  );

  return selectLineAnalysisCandidates({ sourceText: sourceCode, programmingLanguage }).filter(
    (candidate) => candidate.lineNumber >= startLine && candidate.lineNumber <= endLine,
  );
}

/** Converts one batch analysis entry while preserving existing note metadata. */
function createStoredLineNoteFromAnalysis(
  analysis: LineAnalysisEntry,
  sourceLines: string[],
  existing: StoredLineNote | undefined,
  usedLineNoteIds: readonly string[],
  now: string,
): StoredLineNote {
  const generated = createStoredLineNote(
    createLineNoteFromAiAnalysis(analysis.lineNumber, analysis, sourceLines),
    now,
  );

  if (!existing) {
    return {
      ...generated,
      id: createAvailableLineNoteId(analysis.lineNumber, usedLineNoteIds),
    };
  }

  return {
    ...generated,
    id: existing.id,
    createdBy: existing.createdBy,
    createdAt: existing.createdAt,
    ...(existing.userNote !== undefined ? { userNote: existing.userNote } : {}),
  };
}

/** Creates the configured provider client for one nearby-line request. */
function createRuntimeAiClient(
  config: NonNullable<Awaited<ReturnType<typeof getAiRequestConfigOrShowError>>>,
): AiClient {
  if (config.provider === "deepseek") {
    return createDeepSeekClient({
      apiKey: config.apiKey,
      model: config.model,
      maxTokens: AI_REQUEST_DEFAULTS.lineBatch.maxOutputTokens,
    });
  }

  throw new Error(`Unsupported AI provider: ${String(config.provider)}`);
}
