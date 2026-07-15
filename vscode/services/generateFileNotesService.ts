/**
 * Generates file and section notes with AI and persists them for one VS Code resource.
 */

import * as vscode from "vscode";

import type { AiClient } from "@shared/ai/aiClient";
import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { explainFileSectionPrompt } from "@shared/prompts/explainFileSectionPrompt";
import { createDeepSeekClient } from "@shared/providers/deepseek";
import { createFileSectionNotesFromAiAnalysis } from "@shared/services/aiToDomainService";
import { createStoredSourceFile } from "@shared/services/domainToStoreService";
import { explainFileSectionService } from "@shared/services/explainFileSectionService";
import { getAiRequestConfigOrShowError } from "@vscode/ai/getAiRequestConfigOrShowError";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";

/**
 * Provider-independent input for generating stored file and section notes.
 */
export type GenerateFileNotesInput = {
  /** Complete current source text. */
  sourceCode: string;

  /** Root-relative source path included as AI context. */
  relativePath: string;

  /** Open-ended VS Code language identifier. */
  programmingLanguage?: string;

  /** Prompt instruction resolved from the response-language setting. */
  responseLanguageInstruction: string;

  /** AI client used to complete the combined file and section prompt. */
  aiClient: AiClient;

  /** Previously stored notes merged during regeneration. */
  existingSourceFile?: StoredSourceFile;

  /** ISO timestamp used for newly generated and updated notes. */
  now: string;
};

/**
 * Generates and merges file and section notes without reading VS Code configuration or storage.
 *
 * Existing user content and line notes are retained. Generated sections reuse an
 * existing section with the same range so user notes attached to that range survive.
 *
 * @param input - Source context, AI client, previous notes, and timestamp.
 * @returns Stored source-file data ready to persist.
 *
 * @example
 * const sourceFile = await generateFileNotesService({
 *   sourceCode: "export const value = 1;",
 *   relativePath: "src/value.ts",
 *   programmingLanguage: "typescript",
 *   responseLanguageInstruction: "Respond in English.",
 *   aiClient,
 *   now: new Date().toISOString(),
 * });
 */
export async function generateFileNotesService(
  input: GenerateFileNotesInput,
): Promise<StoredSourceFile> {
  const sourceLines = input.sourceCode.split(/\r?\n/);
  const prompt = explainFileSectionPrompt({
    sourceCode: input.sourceCode,
    filePath: input.relativePath,
    ...(input.programmingLanguage
      ? { programmingLanguage: input.programmingLanguage }
      : {}),
    responseLanguageInstruction: input.responseLanguageInstruction,
    skipDependencyDirectives:
      AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled,
  });
  const analysis = await explainFileSectionService(prompt, input.aiClient, {
    lineCount: sourceLines.length,
  });
  const generatedNotes = createFileSectionNotesFromAiAnalysis(analysis, sourceLines);
  const generatedSourceFile = createStoredSourceFile({
    sourceCode: input.sourceCode,
    ...(input.programmingLanguage
      ? { programmingLanguage: input.programmingLanguage }
      : {}),
    fileNote: generatedNotes.fileNote,
    sectionNotes: generatedNotes.sectionNotes,
    now: input.now,
  });

  return mergeGeneratedFileSectionNotes(
    generatedSourceFile,
    input.existingSourceFile,
    input.now,
  );
}

/**
 * Resolves VS Code settings, generates notes for one file, and saves the result.
 *
 * @param context - Extension context used to read the selected provider API key.
 * @param notes - Shared note store used for cached reads and persistent writes.
 * @param uri - Local source-file URI to analyze.
 * @returns `true` after notes are saved, or `false` when configuration resolution is cancelled.
 *
 * @example
 * await generateFileNotesForResource(context, notes, document.uri);
 */
export async function generateFileNotesForResource(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
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
  const now = new Date().toISOString();
  const sourceFile = await generateFileNotesService({
    sourceCode: document.getText(),
    relativePath,
    programmingLanguage: document.languageId,
    responseLanguageInstruction: aiConfig.languageInstruction,
    aiClient: createAiClient(aiConfig),
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

function createAiClient(config: Awaited<ReturnType<typeof getAiRequestConfigOrShowError>>): AiClient {
  if (!config) {
    throw new Error("AI configuration is required to create an AI client.");
  }

  if (config.provider === "deepseek") {
    return createDeepSeekClient({
      apiKey: config.apiKey,
      model: config.model,
    });
  }

  throw new Error(`Unsupported AI provider: ${String(config.provider)}`);
}

/**
 * Merges regenerated file and section AI notes with previously stored user content.
 *
 * Existing line notes are retained because file-and-section generation does not
 * produce replacements for them.
 *
 * @param generated - Newly generated file and section notes.
 * @param existing - Previously stored notes for the same source file.
 * @param now - ISO timestamp applied to matched regenerated notes.
 * @returns Generated notes with existing user content and line notes preserved.
 *
 * @example
 * const merged = mergeGeneratedFileSectionNotes(generated, existing, now);
 */
export function mergeGeneratedFileSectionNotes(
  generated: StoredSourceFile,
  existing: StoredSourceFile | undefined,
  now: string,
): StoredSourceFile {
  if (!existing) {
    return generated;
  }

  const matchedSectionIds = new Set<string>();
  const sectionNotes = generated.sectionNotes.map((generatedSection) => {
    const existingSection = existing.sectionNotes.find(
      (candidate) =>
        !matchedSectionIds.has(candidate.id) &&
        candidate.range.startLine === generatedSection.range.startLine &&
        candidate.range.endLine === generatedSection.range.endLine,
    );

    if (!existingSection) {
      return generatedSection;
    }

    matchedSectionIds.add(existingSection.id);
    return mergeMatchedSection(generatedSection, existingSection, now);
  });
  const retainedSections = existing.sectionNotes.filter(
    (section) =>
      !matchedSectionIds.has(section.id) &&
      (section.createdBy === "user" || Boolean(section.userNote?.trim())),
  );

  return {
    ...generated,
    fileNote: mergeFileNote(generated, existing, now),
    sectionNotes: [...sectionNotes, ...retainedSections].sort(compareStoredSections),
    lineNotes: existing.lineNotes,
  };
}

function mergeFileNote(
  generated: StoredSourceFile,
  existing: StoredSourceFile,
  now: string,
): StoredSourceFile["fileNote"] {
  const generatedFileNote = generated.fileNote;

  if (!generatedFileNote || !existing.fileNote) {
    return generatedFileNote;
  }

  return {
    ...generatedFileNote,
    id: existing.fileNote.id,
    createdBy: existing.fileNote.createdBy,
    createdAt: existing.fileNote.createdAt,
    updatedAt: now,
    ...(existing.fileNote.userNote !== undefined
      ? { userNote: existing.fileNote.userNote }
      : {}),
  };
}

function mergeMatchedSection(
  generated: StoredSectionNote,
  existing: StoredSectionNote,
  now: string,
): StoredSectionNote {
  return {
    ...generated,
    id: existing.id,
    createdBy: existing.createdBy,
    createdAt: existing.createdAt,
    updatedAt: now,
    ...(existing.userNote !== undefined ? { userNote: existing.userNote } : {}),
  };
}

function compareStoredSections(left: StoredSectionNote, right: StoredSectionNote): number {
  return (
    left.range.startLine - right.range.startLine ||
    left.range.endLine - right.range.endLine ||
    left.id.localeCompare(right.id)
  );
}
