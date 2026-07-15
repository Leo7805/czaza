/**
 * Generates and persists AI notes for one explicitly selected source line.
 */

import * as vscode from "vscode";

import type { AiClient } from "@shared/ai/aiClient";
import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";
import type { StoredLineNote } from "@shared/models/store/line";
import { explainLinePrompt } from "@shared/prompts/explainLinePrompt";
import { createDeepSeekClient } from "@shared/providers/deepseek";
import { createLineNoteFromAiAnalysis } from "@shared/services/aiToDomainService";
import {
  createStoredLineNote,
  createStoredSourceFile,
} from "@shared/services/domainToStoreService";
import { explainLineService } from "@shared/services/explainLineService";
import { selectLineAnalysisCandidates } from "@shared/services/lineAnalysisCandidateService";
import { createAvailableLineNoteId } from "@shared/services/notes/lineNoteIdentityService";
import { getAiRequestConfigOrShowError } from "@vscode/ai/getAiRequestConfigOrShowError";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";

/**
 * Provider-independent input for generating one stored line note.
 */
export type GenerateLineNoteInput = {
  /** Complete current source text. */
  sourceCode: string;

  /** One-based target source line number. */
  lineNumber: number;

  /** Root-relative source path included as AI context. */
  relativePath: string;

  /** Open-ended VS Code language identifier. */
  programmingLanguage?: string;

  /** Prompt instruction resolved from the response-language setting. */
  responseLanguageInstruction: string;

  /** AI client used to complete the single-line prompt. */
  aiClient: AiClient;

  /** Existing note attached to the target line, when present. */
  existingLineNote?: StoredLineNote;

  /** Existing line-note identifiers used to prevent id collisions. */
  usedLineNoteIds?: readonly string[];

  /** ISO timestamp used for generated and updated metadata. */
  now: string;
};

/**
 * Generates one stored line note without reading VS Code configuration or storage.
 *
 * Existing user content and creation metadata are retained while AI content,
 * source anchor, status, and update time are refreshed.
 *
 * @param input - Source context, line target, AI client, and existing note metadata.
 * @returns Stored line note ready to insert or upsert.
 * @throws RangeError when the line is outside the current source file.
 * @throws Error when local filtering marks the line as ineligible for AI analysis.
 *
 * @example
 * const lineNote = await generateLineNoteService({
 *   sourceCode: "return value;",
 *   lineNumber: 1,
 *   relativePath: "src/value.ts",
 *   responseLanguageInstruction: "Respond in English.",
 *   aiClient,
 *   now: new Date().toISOString(),
 * });
 */
export async function generateLineNoteService(
  input: GenerateLineNoteInput,
): Promise<StoredLineNote> {
  const sourceLines = input.sourceCode.split(/\r?\n/);

  assertLineInRange(input.lineNumber, sourceLines.length);
  assertLineIsEligible(input.sourceCode, input.lineNumber, input.programmingLanguage);

  const sourceLine = sourceLines[input.lineNumber - 1] ?? "";
  const prompt = explainLinePrompt({
    lineNumber: input.lineNumber,
    sourceLine,
    filePath: input.relativePath,
    ...(input.programmingLanguage
      ? { programmingLanguage: input.programmingLanguage }
      : {}),
    responseLanguageInstruction: input.responseLanguageInstruction,
    surroundingSourceLines: createSurroundingSourceLines(
      sourceLines,
      input.lineNumber,
      AI_REQUEST_DEFAULTS.singleLine.surroundingLineRadius,
    ),
  });
  const analysis = await explainLineService(prompt, input.aiClient);
  const generated = createStoredLineNote(
    createLineNoteFromAiAnalysis(input.lineNumber, analysis, sourceLines),
    input.now,
  );
  const existing = input.existingLineNote;

  if (!existing) {
    return {
      ...generated,
      id: createAvailableLineNoteId(
        input.lineNumber,
        input.usedLineNoteIds ?? [],
      ),
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

/**
 * Resolves VS Code state, generates one line note, and saves it through the shared Store.
 *
 * @param context - Extension context used to resolve the selected provider API key.
 * @param notes - Shared workspace note store.
 * @param uri - Local source-file URI that owns the target line.
 * @param lineNumber - One-based line captured when the user requested generation.
 * @returns `true` after saving, or `false` when AI configuration is unavailable.
 *
 * @example
 * await generateLineNoteForResource(context, notes, document.uri, 42);
 */
export async function generateLineNoteForResource(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  lineNumber: number,
): Promise<boolean> {
  const aiConfig = await getAiRequestConfigOrShowError(context, uri);

  if (!aiConfig) {
    return false;
  }

  const document = await vscode.workspace.openTextDocument(uri);

  assertLineInRange(lineNumber, document.lineCount);

  const resolvedRoot = resolveCzazaRootDirectory(uri);
  const relativePath = getCzazaRelativePath(uri, resolvedRoot.rootDirectory);
  const settings = getCzazaSettings(uri);
  const existingSourceFile = await notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
  );
  const existingLineNote = existingSourceFile?.lineNotes.find(
    (note) => note.line === lineNumber,
  );
  const now = new Date().toISOString();
  const lineNote = await generateLineNoteService({
    sourceCode: document.getText(),
    lineNumber,
    relativePath,
    programmingLanguage: document.languageId,
    responseLanguageInstruction: aiConfig.languageInstruction,
    aiClient: createRuntimeAiClient(aiConfig),
    ...(existingLineNote ? { existingLineNote } : {}),
    usedLineNoteIds: existingSourceFile?.lineNotes.map((note) => note.id) ?? [],
    now,
  });

  if (existingSourceFile) {
    await notes.crud.upsertLineNote(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
      lineNote,
      now,
    );
    return true;
  }

  const sourceFile = createStoredSourceFile({
    sourceCode: document.getText(),
    programmingLanguage: document.languageId,
    lineNotes: [lineNote],
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

/** Creates the configured provider client for one single-line request. */
function createRuntimeAiClient(
  config: NonNullable<Awaited<ReturnType<typeof getAiRequestConfigOrShowError>>>,
): AiClient {
  if (config.provider === "deepseek") {
    return createDeepSeekClient({
      apiKey: config.apiKey,
      model: config.model,
      maxTokens: AI_REQUEST_DEFAULTS.singleLine.maxOutputTokens,
    });
  }

  throw new Error(`Unsupported AI provider: ${String(config.provider)}`);
}

/** Validates a one-based line against the current source line count. */
function assertLineInRange(lineNumber: number, lineCount: number): void {
  if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lineCount) {
    throw new RangeError(`Line ${lineNumber} is outside the current document.`);
  }
}

/** Rejects locally filtered lines before spending an AI request. */
function assertLineIsEligible(
  sourceCode: string,
  lineNumber: number,
  programmingLanguage: string | undefined,
): void {
  const candidates = selectLineAnalysisCandidates({
    sourceText: sourceCode,
    ...(programmingLanguage ? { programmingLanguage } : {}),
  });

  if (!candidates.some((candidate) => candidate.lineNumber === lineNumber)) {
    throw new Error(`Line ${lineNumber} is not eligible for AI analysis.`);
  }
}

/** Selects an inclusive, bounded source window around the target line. */
function createSurroundingSourceLines(
  sourceLines: string[],
  lineNumber: number,
  radius: number,
): ReadonlyArray<{ lineNumber: number; text: string }> {
  const startIndex = Math.max(0, lineNumber - radius - 1);
  const endIndex = Math.min(sourceLines.length, lineNumber + radius);

  return sourceLines.slice(startIndex, endIndex).map((text, index) => ({
    lineNumber: startIndex + index + 1,
    text,
  }));
}
