/**
 * Provides manager-bound file, section, and line note CRUD helpers.
 */

import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  deleteFileNote as deleteFileNotePure,
  deleteLineNote as deleteLineNotePure,
  deleteSectionNote as deleteSectionNotePure,
  getFileNote as getFileNotePure,
  getLineNote as getLineNotePure,
  getSectionNote as getSectionNotePure,
  type FileNoteUpsertInput,
  type LineNoteUpsertInput,
  type SectionNoteUpsertInput,
  upsertFileNote as upsertFileNotePure,
  upsertLineNote as upsertLineNotePure,
  upsertSectionNote as upsertSectionNotePure,
} from "@shared/services/notes/sourceFileNoteCrudService";

/**
 * Dependencies required by workspace note CRUD helpers.
 *
 * @example
 * const deps: WorkspaceNoteCrudDependencies = managerDeps;
 */
export type WorkspaceNoteCrudDependencies = {
  /** Reads one source-file note JSON when present. */
  getSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
  ): Promise<StoredSourceFile | undefined>;

  /** Reads one source-file note JSON and throws when absent. */
  getRequiredSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
  ): Promise<StoredSourceFile>;

  /** Saves one updated source-file note JSON. */
  saveSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceFile: StoredSourceFile,
    now: string,
  ): Promise<void>;
};

/**
 * Reads the file-level note for one source file.
 *
 * @example
 * const note = await getFileNote(deps, root, ".czaza", "src/index.ts");
 */
export async function getFileNote(
  deps: WorkspaceNoteCrudDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
): Promise<StoredFileNote | undefined> {
  const sourceFile = await deps.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath);

  return sourceFile ? getFileNotePure(sourceFile) : undefined;
}

/**
 * Inserts or updates the file-level note for one source file.
 *
 * @example
 * const next = await upsertFileNote(deps, root, ".czaza", "src/index.ts", note, now);
 */
export async function upsertFileNote(
  deps: WorkspaceNoteCrudDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  fileNote: FileNoteUpsertInput,
  now: string,
): Promise<StoredSourceFile> {
  const sourceFile = await deps.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
  const next = upsertFileNotePure(sourceFile, fileNote, now);

  await deps.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

  return next;
}

/**
 * Deletes the file-level note for one source file.
 *
 * @example
 * const next = await deleteFileNote(deps, root, ".czaza", "src/index.ts", now);
 */
export async function deleteFileNote(
  deps: WorkspaceNoteCrudDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  now: string,
): Promise<StoredSourceFile> {
  const sourceFile = await deps.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
  const next = deleteFileNotePure(sourceFile);

  await deps.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

  return next;
}

/**
 * Reads one section note by id.
 *
 * @example
 * const note = await getSectionNote(deps, root, ".czaza", "src/index.ts", "section:1");
 */
export async function getSectionNote(
  deps: WorkspaceNoteCrudDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
): Promise<StoredSectionNote | undefined> {
  const sourceFile = await deps.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath);

  return sourceFile ? getSectionNotePure(sourceFile, sectionId) : undefined;
}

/**
 * Inserts or updates one section note by id.
 *
 * @example
 * const next = await upsertSectionNote(deps, root, ".czaza", "src/index.ts", note, now);
 */
export async function upsertSectionNote(
  deps: WorkspaceNoteCrudDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionNote: SectionNoteUpsertInput,
  now: string,
): Promise<StoredSourceFile> {
  const sourceFile = await deps.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
  const next = upsertSectionNotePure(sourceFile, sectionNote, now);

  await deps.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

  return next;
}

/**
 * Deletes one section note by id.
 *
 * @example
 * const next = await deleteSectionNote(deps, root, ".czaza", "src/index.ts", "section:1", now);
 */
export async function deleteSectionNote(
  deps: WorkspaceNoteCrudDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
  now: string,
): Promise<StoredSourceFile> {
  const sourceFile = await deps.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
  const next = deleteSectionNotePure(sourceFile, sectionId);

  await deps.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

  return next;
}

/**
 * Reads one line note by id.
 *
 * @example
 * const note = await getLineNote(deps, root, ".czaza", "src/index.ts", "line:1");
 */
export async function getLineNote(
  deps: WorkspaceNoteCrudDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  lineId: string,
): Promise<StoredLineNote | undefined> {
  const sourceFile = await deps.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath);

  return sourceFile ? getLineNotePure(sourceFile, lineId) : undefined;
}

/**
 * Inserts or updates one line note by id.
 *
 * @example
 * const next = await upsertLineNote(deps, root, ".czaza", "src/index.ts", note, now);
 */
export async function upsertLineNote(
  deps: WorkspaceNoteCrudDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  lineNote: LineNoteUpsertInput,
  now: string,
): Promise<StoredSourceFile> {
  const sourceFile = await deps.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
  const next = upsertLineNotePure(sourceFile, lineNote, now);

  await deps.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

  return next;
}

/**
 * Deletes one line note by id.
 *
 * @example
 * const next = await deleteLineNote(deps, root, ".czaza", "src/index.ts", "line:1", now);
 */
export async function deleteLineNote(
  deps: WorkspaceNoteCrudDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  lineId: string,
  now: string,
): Promise<StoredSourceFile> {
  const sourceFile = await deps.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
  const next = deleteLineNotePure(sourceFile, lineId);

  await deps.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

  return next;
}
