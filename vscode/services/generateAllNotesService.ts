/**
 * Generates coordinated file, section, and line notes from one AI request.
 */

import * as vscode from "vscode";

import type { AiClient } from "@shared/ai/aiClient";
import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { explainAllNotesLineBatchPrompt } from "@shared/prompts/explainAllNotesLineBatchPrompt";
import { explainFileSectionLinePrompt } from "@shared/prompts/explainFileSectionLinePrompt";
import { createDeepSeekClient } from "@shared/providers/deepseek";
import {
  createFileNoteFromAiAnalysis,
  createLineNotesFromAiBatchAnalysis,
  createSectionNotesFromAiAnalysis,
} from "@shared/services/aiToDomainService";
import {
  assessAllNotesRequest,
  type AllNotesRequestAssessment,
} from "@shared/services/allNotesRequestLimitService";
import { createStoredSourceFile } from "@shared/services/domainToStoreService";
import { explainFileSectionLineService } from "@shared/services/explainFileSectionLineService";
import { explainLineBatchService } from "@shared/services/explainLineBatchService";
import { selectLineAnalysisCandidates } from "@shared/services/lineAnalysisCandidateService";
import { getAiRequestConfigOrShowError } from "@vscode/ai/getAiRequestConfigOrShowError";
import { AI_CATALOG } from "@vscode/config/aiCatalog";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { mergeGeneratedFileSectionNotes } from "@vscode/services/generateFileNotesService";

/**
 * Factory that creates the AI client after the request output limit is known.
 *
 * @param maxTokens - Assessed output token cap for this request.
 * @returns AI client configured for the coordinated request.
 *
 * @example
 * const createAiClient = (maxTokens: number) =>
 *   createDeepSeekClient({ apiKey, model, maxTokens });
 */
export type AllNotesAiClientFactory = (maxTokens: number) => AiClient;

/**
 * Provider-independent input for coordinated note generation.
 */
export type GenerateAllNotesInput = {
  /** Complete current source text. */
  sourceCode: string;

  /** Root-relative source path included as AI context. */
  relativePath: string;

  /** Open-ended VS Code language identifier. */
  programmingLanguage?: string;

  /** Prompt instruction resolved from the response-language setting. */
  responseLanguageInstruction: string;

  /** Context-window limit published for the selected model. */
  modelContextWindowTokens: number;

  /** Maximum output limit published for the selected model. */
  modelMaxOutputTokens: number;

  /** Maximum number of filtered source lines eligible for individual notes. */
  maxCandidateLines?: number;

  /** Allows a previously confirmed request to execute across multiple AI calls. */
  allowBatching?: boolean;

  /** Factory used to apply the assessed output cap to the AI client. */
  createAiClient: AllNotesAiClientFactory;

  /** Previously stored notes merged during regeneration. */
  existingSourceFile?: StoredSourceFile;

  /** ISO timestamp used for newly generated and updated notes. */
  now: string;
};

/**
 * Generates and merges all three note levels with one or more coordinated AI requests.
 *
 * The service selects meaningful line targets locally, asks for confirmation
 * before batching, and keeps follow-up requests line-only while retaining the
 * complete source file as context.
 *
 * @param input - Source context, model limits, AI client factory, and previous notes.
 * @returns Stored source-file data ready to persist.
 * @throws Error when the request exceeds an All Notes safety limit or needs batching confirmation.
 *
 * @example
 * const sourceFile = await generateAllNotesService({
 *   sourceCode: "export const value = 1;",
 *   relativePath: "src/value.ts",
 *   programmingLanguage: "typescript",
 *   responseLanguageInstruction: "Respond in English.",
 *   modelContextWindowTokens: 1_000_000,
 *   modelMaxOutputTokens: 384_000,
 *   createAiClient: (maxTokens) => createDeepSeekClient({ apiKey, maxTokens }),
 *   now: new Date().toISOString(),
 * });
 */
export async function generateAllNotesService(
  input: GenerateAllNotesInput,
): Promise<StoredSourceFile> {
  const sourceLines = input.sourceCode.split(/\r?\n/);
  const candidates = selectLineAnalysisCandidates({
    sourceText: input.sourceCode,
    ...(input.programmingLanguage
      ? { programmingLanguage: input.programmingLanguage }
      : {}),
    skipDependencyDirectives:
      AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled,
  });
  const requestedLineNumbers = candidates.map((candidate) => candidate.lineNumber);
  const maxCandidateLines =
    input.maxCandidateLines ?? AI_REQUEST_DEFAULTS.allNotes.maxCandidateLines;

  if (requestedLineNumbers.length > maxCandidateLines) {
    throw new AllNotesLineLimitError(
      sourceLines.length,
      requestedLineNumbers.length,
      maxCandidateLines,
    );
  }

  const batches = createLineNumberBatches(
    requestedLineNumbers,
    input.modelMaxOutputTokens,
  );

  if (batches.length > 1 && !input.allowBatching) {
    throw new AllNotesBatchRequiredError(
      sourceLines.length,
      requestedLineNumbers.length,
      batches.length,
      Math.min(
        AI_REQUEST_DEFAULTS.allNotes.maxRequestOutputTokens,
        input.modelMaxOutputTokens,
      ),
    );
  }

  const firstBatchLineNumbers = batches[0] ?? [];
  const prompt = explainFileSectionLinePrompt({
    sourceCode: input.sourceCode,
    filePath: input.relativePath,
    ...(input.programmingLanguage
      ? { programmingLanguage: input.programmingLanguage }
      : {}),
    responseLanguageInstruction: input.responseLanguageInstruction,
    lineNumbers: firstBatchLineNumbers,
    skipDependencyDirectives:
      AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled,
  });
  const assessment = assessAllNotesRequest({
    prompt,
    sourceLineCount: sourceLines.length,
    candidateLineCount: firstBatchLineNumbers.length,
    modelContextWindowTokens: input.modelContextWindowTokens,
    modelMaxOutputTokens: input.modelMaxOutputTokens,
    limits: { maxCandidateLines },
  });

  assertRequestAllowed(assessment, maxCandidateLines);

  const analysis = await explainFileSectionLineService(
    prompt,
    input.createAiClient(assessment.recommendedMaxTokens),
    {
      lineCount: sourceLines.length,
      requestedLineNumbers: firstBatchLineNumbers,
    },
  );
  const lineAnalyses = [...analysis.lines];

  for (const lineNumbers of batches.slice(1)) {
    const batchPrompt = explainAllNotesLineBatchPrompt({
      sourceCode: input.sourceCode,
      filePath: input.relativePath,
      ...(input.programmingLanguage
        ? { programmingLanguage: input.programmingLanguage }
        : {}),
      responseLanguageInstruction: input.responseLanguageInstruction,
      lineNumbers,
      skipDependencyDirectives:
        AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled,
    });
    const batchAssessment = assessAllNotesRequest({
      prompt: batchPrompt,
      sourceLineCount: sourceLines.length,
      candidateLineCount: lineNumbers.length,
      modelContextWindowTokens: input.modelContextWindowTokens,
      modelMaxOutputTokens: input.modelMaxOutputTokens,
      limits: { maxCandidateLines, baseOutputTokens: 0 },
    });

    assertRequestAllowed(batchAssessment, maxCandidateLines);
    lineAnalyses.push(
      ...(await explainLineBatchService(
        batchPrompt,
        input.createAiClient(batchAssessment.recommendedMaxTokens),
        { requestedLineNumbers: lineNumbers },
      )),
    );
  }

  const generatedSourceFile = createStoredSourceFile({
    sourceCode: input.sourceCode,
    ...(input.programmingLanguage
      ? { programmingLanguage: input.programmingLanguage }
      : {}),
    fileNote: createFileNoteFromAiAnalysis(analysis.file),
    sectionNotes: createSectionNotesFromAiAnalysis(analysis.sections, sourceLines),
    lineNotes: createLineNotesFromAiBatchAnalysis(lineAnalyses, sourceLines),
    now: input.now,
  });

  return mergeGeneratedAllNotes(
    generatedSourceFile,
    input.existingSourceFile,
    input.now,
  );
}

/**
 * Resolves VS Code runtime state, generates all note levels, and saves them.
 *
 * @param context - Extension context used to resolve the selected provider API key.
 * @param notes - Shared note store used for cached reads and persistent writes.
 * @param uri - Local source-file URI to analyze.
 * @returns `true` after notes are saved, or `false` when AI configuration is unavailable.
 *
 * @example
 * await generateAllNotesForResource(context, notes, document.uri);
 */
export async function generateAllNotesForResource(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  options?: { allowBatching?: boolean },
): Promise<boolean> {
  const aiConfig = await getAiRequestConfigOrShowError(context, uri);

  if (!aiConfig) {
    return false;
  }

  const modelDefinition = AI_CATALOG[aiConfig.provider].models.find(
    (model) => model.id === aiConfig.model,
  );

  if (!modelDefinition) {
    throw new Error(
      `AI model ${aiConfig.model} is not configured for provider ${aiConfig.provider}.`,
    );
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
  const now = new Date().toISOString();
  const sourceFile = await generateAllNotesService({
    sourceCode: document.getText(),
    relativePath,
    programmingLanguage: document.languageId,
    responseLanguageInstruction: aiConfig.languageInstruction,
    modelContextWindowTokens: modelDefinition.contextWindowTokens,
    modelMaxOutputTokens: modelDefinition.maxOutputTokens,
    maxCandidateLines: settings.ai.maxAnalysisLines,
    allowBatching: options?.allowBatching,
    createAiClient: (maxTokens) => createRuntimeAiClient(aiConfig, maxTokens),
    ...(existingSourceFile ? { existingSourceFile } : {}),
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

/** Creates the configured provider client for one assessed All Notes request. */
function createRuntimeAiClient(
  config: NonNullable<Awaited<ReturnType<typeof getAiRequestConfigOrShowError>>>,
  maxTokens: number,
): AiClient {
  if (config.provider === "deepseek") {
    return createDeepSeekClient({
      apiKey: config.apiKey,
      model: config.model,
      maxTokens,
    });
  }

  throw new Error(`Unsupported AI provider: ${String(config.provider)}`);
}

/** Rejects an unsafe request before creating or calling an AI client. */
function assertRequestAllowed(
  assessment: AllNotesRequestAssessment,
  maxCandidateLines: number,
): void {
  if (!assessment.allowed) {
    if (assessment.reason === "too-many-lines") {
      throw new AllNotesLineLimitError(
        assessment.sourceLineCount,
        assessment.candidateLineCount,
        maxCandidateLines,
      );
    }

    throw new Error(
      `All Notes generation request rejected: ${assessment.reason ?? "unknown-limit"}.`,
    );
  }
}

/** User-configurable line-limit rejection surfaced by the notes webview. */
export class AllNotesLineLimitError extends Error {
  readonly sourceLineCount: number;
  readonly candidateLineCount: number;
  readonly maxCandidateLines: number;

  constructor(sourceLineCount: number, candidateLineCount: number, maxCandidateLines: number) {
    super("All Notes generation request rejected: too-many-lines.");
    this.name = "AllNotesLineLimitError";
    this.sourceLineCount = sourceLineCount;
    this.candidateLineCount = candidateLineCount;
    this.maxCandidateLines = maxCandidateLines;
  }
}

/** Signals that a safe request requires user-confirmed sequential batches. */
export class AllNotesBatchRequiredError extends Error {
  readonly sourceLineCount: number;
  readonly candidateLineCount: number;
  readonly batchCount: number;
  readonly effectiveOutputLimit: number;

  constructor(
    sourceLineCount: number,
    candidateLineCount: number,
    batchCount: number,
    effectiveOutputLimit: number,
  ) {
    super("All Notes generation requires multiple output batches.");
    this.name = "AllNotesBatchRequiredError";
    this.sourceLineCount = sourceLineCount;
    this.candidateLineCount = candidateLineCount;
    this.batchCount = batchCount;
    this.effectiveOutputLimit = effectiveOutputLimit;
  }
}

/** Splits target lines using the smaller of the CZaza and selected-model limits. */
function createLineNumberBatches(
  lineNumbers: readonly number[],
  modelMaxOutputTokens: number,
): number[][] {
  const limits = AI_REQUEST_DEFAULTS.allNotes;
  const effectiveOutputLimit = Math.min(
    limits.maxRequestOutputTokens,
    modelMaxOutputTokens,
  );
  const firstBatchCapacity = Math.floor(
    (effectiveOutputLimit / limits.outputSafetyMultiplier - limits.baseOutputTokens) /
      limits.tokensPerLineNote,
  );
  const lineOnlyBatchCapacity = Math.floor(
    effectiveOutputLimit /
      limits.outputSafetyMultiplier /
      limits.tokensPerLineNote,
  );

  if (firstBatchCapacity < 0 || (lineNumbers.length > 0 && firstBatchCapacity < 1)) {
    return [Array.from(lineNumbers)];
  }

  const batches = [Array.from(lineNumbers.slice(0, firstBatchCapacity))];
  let offset = firstBatchCapacity;

  while (offset < lineNumbers.length) {
    batches.push(Array.from(lineNumbers.slice(offset, offset + lineOnlyBatchCapacity)));
    offset += lineOnlyBatchCapacity;
  }

  return batches;
}

/** Merges generated line notes after reusing file-and-section merge behavior. */
function mergeGeneratedAllNotes(
  generated: StoredSourceFile,
  existing: StoredSourceFile | undefined,
  now: string,
): StoredSourceFile {
  const generatedLineNotes = generated.lineNotes;
  const merged = mergeGeneratedFileSectionNotes(generated, existing, now);

  if (!existing) {
    return merged;
  }

  return {
    ...merged,
    lineNotes: mergeGeneratedLineNotes(generatedLineNotes, existing.lineNotes, now),
  };
}

/** Preserves user content while replacing current AI line explanations. */
function mergeGeneratedLineNotes(
  generated: StoredLineNote[],
  existing: StoredLineNote[],
  now: string,
): StoredLineNote[] {
  const matchedLineIds = new Set<string>();
  const lineNotes = generated.map((generatedLine) => {
    const existingLine = existing.find(
      (candidate) =>
        !matchedLineIds.has(candidate.id) && candidate.line === generatedLine.line,
    );

    if (!existingLine) {
      return generatedLine;
    }

    matchedLineIds.add(existingLine.id);
    return {
      ...generatedLine,
      id: existingLine.id,
      createdBy: existingLine.createdBy,
      createdAt: existingLine.createdAt,
      updatedAt: now,
      ...(existingLine.userNote !== undefined
        ? { userNote: existingLine.userNote }
        : {}),
    };
  });
  const retainedLines = existing.filter(
    (line) =>
      !matchedLineIds.has(line.id) &&
      (line.createdBy === "user" || Boolean(line.userNote?.trim())),
  );

  return [...lineNotes, ...retainedLines].sort(
    (left, right) => left.line - right.line || left.id.localeCompare(right.id),
  );
}
