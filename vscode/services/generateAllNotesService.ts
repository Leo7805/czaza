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
export type AllNotesAiClientFactory = (maxTokens: number, timeoutMs: number) => AiClient;

/** Progress for the currently executing All Notes batch plan. */
export type AllNotesProgress = {
  currentBatch: number;
  totalBatches: number;
  completedLines: number;
  totalLines: number;
};

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

  /** Receives progress before each batch request and after final completion. */
  onProgress?: (progress: AllNotesProgress) => void | Promise<void>;

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

  const batches = createLineNumberBatches(requestedLineNumbers);

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

  const result = await executeBatchPlan(
    input,
    sourceLines.length,
    batches,
    maxCandidateLines,
  );

  const generatedSourceFile = createStoredSourceFile({
    sourceCode: input.sourceCode,
    ...(input.programmingLanguage
      ? { programmingLanguage: input.programmingLanguage }
      : {}),
    fileNote: createFileNoteFromAiAnalysis(result.file),
    sectionNotes: createSectionNotesFromAiAnalysis(result.sections, sourceLines),
    lineNotes: createLineNotesFromAiBatchAnalysis(result.lines, sourceLines),
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
  options?: {
    allowBatching?: boolean;
    onProgress?: (progress: AllNotesProgress) => void | Promise<void>;
  },
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
    onProgress: options?.onProgress,
    createAiClient: (maxTokens, timeoutMs) =>
      createRuntimeAiClient(aiConfig, maxTokens, timeoutMs),
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
  timeoutMs: number,
): AiClient {
  if (config.provider === "deepseek") {
    return createDeepSeekClient({
      apiKey: config.apiKey,
      model: config.model,
      maxTokens,
      timeoutMs,
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

/** Terminal failure after a minimum-sized request times out twice. */
export class AllNotesBatchTimeoutError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("An AI batch timed out after recovery. No notes were changed.", options);
    this.name = "AllNotesBatchTimeoutError";
  }
}

/** Terminal failure when the configured total task deadline is reached. */
export class AllNotesTaskTimeoutError extends Error {
  constructor() {
    super("All Notes reached the total task timeout. No notes were changed.");
    this.name = "AllNotesTaskTimeoutError";
  }
}

type AllNotesBatchJob = {
  lineNumbers: number[];
  mode: "complete" | "lines";
  retryCount: number;
};

/** Executes a bounded batch queue with one split level and atomic aggregation. */
async function executeBatchPlan(
  input: GenerateAllNotesInput,
  sourceLineCount: number,
  batches: readonly number[][],
  maxCandidateLines: number,
): Promise<FileSectionLineAnalysis> {
  const params = validateBatchParams();
  const deadline = Date.now() + secondsToMilliseconds(params.taskTimeoutSeconds);
  const queue: AllNotesBatchJob[] = batches.map((lineNumbers, index) => ({
    lineNumbers,
    mode: index === 0 ? "complete" : "lines",
    retryCount: 0,
  }));
  const totalLines = batches.reduce((count, batch) => count + batch.length, 0);
  const lineAnalyses: LineAnalysisEntry[] = [];
  let completeAnalysis: FileSectionLineAnalysis | undefined;
  let completedBatches = 0;
  let completedLines = 0;
  let totalBatches = queue.length;

  while (queue.length > 0) {
    assertTaskWithinDeadline(deadline);
    const job = queue.shift()!;
    await input.onProgress?.({
      currentBatch: completedBatches + 1,
      totalBatches,
      completedLines,
      totalLines,
    });

    try {
      const result = await executeBatchJob(
        input,
        sourceLineCount,
        job,
        maxCandidateLines,
        deadline,
      );

      if (job.mode === "complete") {
        completeAnalysis = result as FileSectionLineAnalysis;
        lineAnalyses.push(...completeAnalysis.lines);
      } else {
        lineAnalyses.push(...(result as LineAnalysisEntry[]));
      }
      completedBatches += 1;
      completedLines += job.lineNumbers.length;
    } catch (error) {
      if (Date.now() >= deadline) {
        throw new AllNotesTaskTimeoutError();
      }
      if (!isRecoverableBatchError(error)) {
        throw error;
      }

      const split = splitFailedBatch(job, params.minimumSplitLineCount);

      if (split) {
        queue.unshift(...split);
        totalBatches += 1;
        continue;
      }
      if (job.retryCount === 0) {
        queue.unshift({ ...job, retryCount: 1 });
        continue;
      }

      throwTerminalBatchError(error);
    }
  }

  if (!completeAnalysis) {
    throw new Error("All Notes batch plan completed without file analysis.");
  }

  await input.onProgress?.({
    currentBatch: totalBatches,
    totalBatches,
    completedLines,
    totalLines,
  });
  return { ...completeAnalysis, lines: lineAnalyses };
}

/** Executes one complete or line-only batch within the remaining task time. */
async function executeBatchJob(
  input: GenerateAllNotesInput,
  sourceLineCount: number,
  job: AllNotesBatchJob,
  maxCandidateLines: number,
  deadline: number,
): Promise<FileSectionLineAnalysis | LineAnalysisEntry[]> {
  const timeoutMs = Math.min(
    secondsToMilliseconds(
      AI_REQUEST_DEFAULTS.allNotes.batchParams.requestTimeoutSeconds,
    ),
    Math.max(1, deadline - Date.now()),
  );

  if (job.mode === "complete") {
    const prompt = explainFileSectionLinePrompt({
      sourceCode: input.sourceCode,
      filePath: input.relativePath,
      ...(input.programmingLanguage
        ? { programmingLanguage: input.programmingLanguage }
        : {}),
      responseLanguageInstruction: input.responseLanguageInstruction,
      lineNumbers: job.lineNumbers,
      skipDependencyDirectives:
        AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled,
    });
    const assessment = assessBatch(
      input,
      prompt,
      sourceLineCount,
      job.lineNumbers.length,
      maxCandidateLines,
      AI_REQUEST_DEFAULTS.allNotes.baseOutputTokens,
    );

    return explainFileSectionLineService(
      prompt,
      input.createAiClient(assessment.recommendedMaxTokens, timeoutMs),
      { lineCount: sourceLineCount, requestedLineNumbers: job.lineNumbers },
    );
  }

  const prompt = explainAllNotesLineBatchPrompt({
    sourceCode: input.sourceCode,
    filePath: input.relativePath,
    ...(input.programmingLanguage
      ? { programmingLanguage: input.programmingLanguage }
      : {}),
    responseLanguageInstruction: input.responseLanguageInstruction,
    lineNumbers: job.lineNumbers,
    skipDependencyDirectives:
      AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled,
  });
  const assessment = assessBatch(
    input,
    prompt,
    sourceLineCount,
    job.lineNumbers.length,
    maxCandidateLines,
    0,
  );

  return explainLineBatchService(
    prompt,
    input.createAiClient(assessment.recommendedMaxTokens, timeoutMs),
    { requestedLineNumbers: job.lineNumbers },
  );
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
      maxRequestOutputTokens: Math.min(
        AI_REQUEST_DEFAULTS.allNotes.maxRequestOutputTokens,
        input.modelMaxOutputTokens,
      ),
      baseOutputTokens,
    },
  });

  assertRequestAllowed(assessment, maxCandidateLines);
  return assessment;
}

/** Identifies response syntax and DTO validation failures safe to retry. */
function isInvalidAiResponseError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && /^Invalid .* response:/.test(error.message))
  );
}

/** Treats invalid JSON/DTOs and provider aborts as bounded recovery candidates. */
function isRecoverableBatchError(error: unknown): boolean {
  return (
    isInvalidAiResponseError(error) ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

/** Splits only when both children meet the configured minimum size. */
function splitFailedBatch(
  job: AllNotesBatchJob,
  minimumSplitLineCount: number,
): AllNotesBatchJob[] | undefined {
  const midpoint = Math.ceil(job.lineNumbers.length / 2);

  if (
    midpoint < minimumSplitLineCount ||
    job.lineNumbers.length - midpoint < minimumSplitLineCount
  ) {
    return undefined;
  }

  return [
    {
      lineNumbers: job.lineNumbers.slice(0, midpoint),
      mode: job.mode,
      retryCount: 0,
    },
    {
      lineNumbers: job.lineNumbers.slice(midpoint),
      mode: "lines",
      retryCount: 0,
    },
  ];
}

/** Converts an exhausted recoverable failure into a stable user-facing error. */
function throwTerminalBatchError(error: unknown): never {
  if (isInvalidAiResponseError(error)) {
    throw new AllNotesInvalidResponseError({ cause: error });
  }
  throw new AllNotesBatchTimeoutError({ cause: error });
}

/** Creates fixed-size batches from developer-configured line-count policy. */
function createLineNumberBatches(lineNumbers: readonly number[]): number[][] {
  const { regularLineCount } = validateBatchParams();
  const batches: number[][] = [];

  for (let offset = 0; offset < lineNumbers.length; offset += regularLineCount) {
    batches.push(Array.from(lineNumbers.slice(offset, offset + regularLineCount)));
  }

  return batches.length > 0 ? batches : [[]];
}

/** Validates manually adjustable batching constants before planning requests. */
function validateBatchParams(): typeof AI_REQUEST_DEFAULTS.allNotes.batchParams {
  const params = AI_REQUEST_DEFAULTS.allNotes.batchParams;
  const values = Object.values(params);

  if (values.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new RangeError("All Notes batch parameters must be positive integers.");
  }
  if (params.regularLineCount < params.minimumSplitLineCount * 2) {
    throw new RangeError(
      "All Notes regularLineCount must be at least twice minimumSplitLineCount.",
    );
  }
  if (params.taskTimeoutSeconds < params.requestTimeoutSeconds) {
    throw new RangeError(
      "All Notes taskTimeoutSeconds must be greater than or equal to requestTimeoutSeconds.",
    );
  }

  return params;
}

/** Converts developer-facing timeout seconds to runtime milliseconds. */
function secondsToMilliseconds(seconds: number): number {
  return seconds * 1000;
}

/** Stops request planning once the configured total task deadline is reached. */
function assertTaskWithinDeadline(deadline: number): void {
  if (Date.now() >= deadline) {
    throw new AllNotesTaskTimeoutError();
  }
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
