/**
 * Generates coordinated file, section, and line notes from one AI request.
 */

import * as vscode from "vscode";

import type { AiClient } from "@shared/ai/aiClient";
import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";
import type { LineAnalysisEntry } from "@shared/models/ai/line";
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
import {
  explainFileSectionLineService,
  type FileSectionLineAnalysis,
} from "@shared/services/explainFileSectionLineService";
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
      resolveBatchOutputLimit(input.modelMaxOutputTokens),
    );
  }

  const firstBatchLineNumbers = batches[0] ?? [];
  let analysis: FileSectionLineAnalysis;

  try {
    analysis = await generateInitialBatchWithRecovery(
      input,
      sourceLines.length,
      firstBatchLineNumbers,
      maxCandidateLines,
    );
  } catch (error) {
    throwInvalidAiResponseError(error);
  }

  const lineAnalyses = [...analysis.lines];

  for (const lineNumbers of batches.slice(1)) {
    try {
      lineAnalyses.push(
        ...(await generateLineBatchWithRecovery(
          input,
          sourceLines.length,
          lineNumbers,
          maxCandidateLines,
        )),
      );
    } catch (error) {
      throwInvalidAiResponseError(error);
    }
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

/** User-facing terminal failure after malformed-response retries are exhausted. */
export class AllNotesInvalidResponseError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(
      "The AI returned invalid JSON after automatic retries and smaller batches. No notes were changed.",
      options,
    );
    this.name = "AllNotesInvalidResponseError";
  }
}

/** Runs the coordinated first batch, retrying and splitting malformed responses. */
async function generateInitialBatchWithRecovery(
  input: GenerateAllNotesInput,
  sourceLineCount: number,
  lineNumbers: readonly number[],
  maxCandidateLines: number,
): Promise<FileSectionLineAnalysis> {
  try {
    return await retryInvalidAiResponse(async () => {
      const prompt = explainFileSectionLinePrompt({
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
      const assessment = assessBatch(
        input,
        prompt,
        sourceLineCount,
        lineNumbers.length,
        maxCandidateLines,
        AI_REQUEST_DEFAULTS.allNotes.baseOutputTokens,
      );

      return explainFileSectionLineService(
        prompt,
        input.createAiClient(assessment.recommendedMaxTokens),
        { lineCount: sourceLineCount, requestedLineNumbers: lineNumbers },
      );
    });
  } catch (error) {
    if (!isInvalidAiResponseError(error) || lineNumbers.length < 2) {
      throw error;
    }

    const midpoint = Math.ceil(lineNumbers.length / 2);
    const first = await generateInitialBatchWithRecovery(
      input,
      sourceLineCount,
      lineNumbers.slice(0, midpoint),
      maxCandidateLines,
    );
    const remainingLines = await generateLineBatchWithRecovery(
      input,
      sourceLineCount,
      lineNumbers.slice(midpoint),
      maxCandidateLines,
    );

    return { ...first, lines: [...first.lines, ...remainingLines] };
  }
}

/** Runs one line-only batch, recursively halving malformed responses. */
async function generateLineBatchWithRecovery(
  input: GenerateAllNotesInput,
  sourceLineCount: number,
  lineNumbers: readonly number[],
  maxCandidateLines: number,
): Promise<LineAnalysisEntry[]> {
  try {
    return await retryInvalidAiResponse(async () => {
      const prompt = explainAllNotesLineBatchPrompt({
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
      const assessment = assessBatch(
        input,
        prompt,
        sourceLineCount,
        lineNumbers.length,
        maxCandidateLines,
        0,
      );

      return explainLineBatchService(
        prompt,
        input.createAiClient(assessment.recommendedMaxTokens),
        { requestedLineNumbers: lineNumbers },
      );
    });
  } catch (error) {
    if (!isInvalidAiResponseError(error) || lineNumbers.length < 2) {
      throw error;
    }

    const midpoint = Math.ceil(lineNumbers.length / 2);
    return [
      ...(await generateLineBatchWithRecovery(
        input,
        sourceLineCount,
        lineNumbers.slice(0, midpoint),
        maxCandidateLines,
      )),
      ...(await generateLineBatchWithRecovery(
        input,
        sourceLineCount,
        lineNumbers.slice(midpoint),
        maxCandidateLines,
      )),
    ];
  }
}

/** Assesses one planned batch against both the reliability target and model capability. */
function assessBatch(
  input: GenerateAllNotesInput,
  prompt: string,
  sourceLineCount: number,
  candidateLineCount: number,
  maxCandidateLines: number,
  baseOutputTokens: number,
): AllNotesRequestAssessment {
  const assessment = assessAllNotesRequest({
    prompt,
    sourceLineCount,
    candidateLineCount,
    modelContextWindowTokens: input.modelContextWindowTokens,
    modelMaxOutputTokens: input.modelMaxOutputTokens,
    limits: {
      maxCandidateLines,
      maxRequestOutputTokens: resolveBatchOutputLimit(input.modelMaxOutputTokens),
      baseOutputTokens,
    },
  });

  assertRequestAllowed(assessment, maxCandidateLines);
  return assessment;
}

/** Retries only malformed or structurally invalid AI responses. */
async function retryInvalidAiResponse<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt < AI_REQUEST_DEFAULTS.allNotes.invalidResponseAttempts;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (error) {
      if (!isInvalidAiResponseError(error)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError;
}

/** Identifies response syntax and DTO validation failures safe to retry. */
function isInvalidAiResponseError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && /^Invalid .* response:/.test(error.message))
  );
}

/** Converts only exhausted malformed responses into a stable user-facing error. */
function throwInvalidAiResponseError(error: unknown): never {
  if (isInvalidAiResponseError(error)) {
    throw new AllNotesInvalidResponseError({ cause: error });
  }
  throw error;
}

/** Resolves the practical JSON batch target without exceeding hard or model limits. */
function resolveBatchOutputLimit(modelMaxOutputTokens: number): number {
  const limits = AI_REQUEST_DEFAULTS.allNotes;
  return Math.min(
    limits.targetBatchOutputTokens,
    limits.maxRequestOutputTokens,
    modelMaxOutputTokens,
  );
}

/** Splits target lines using the smaller of the CZaza and selected-model limits. */
function createLineNumberBatches(
  lineNumbers: readonly number[],
  modelMaxOutputTokens: number,
): number[][] {
  const limits = AI_REQUEST_DEFAULTS.allNotes;
  const effectiveOutputLimit = resolveBatchOutputLimit(modelMaxOutputTokens);
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
