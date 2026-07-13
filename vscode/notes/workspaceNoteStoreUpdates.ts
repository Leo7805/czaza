/**
 * Provides manager-bound fine-grained source-file note update helpers.
 */

import type { AIExplanation } from "@shared/models/ai/common";
import type { LineRange } from "@shared/models/common";
import type { NoteStatus } from "@shared/models/domain/common";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  updateLineAnchorText as updateLineAnchorTextPure,
  updateLineNumber as updateLineNumberPure,
  updateProgrammingLanguage as updateProgrammingLanguagePure,
  updateSectionAnchorHash as updateSectionAnchorHashPure,
  updateSectionRange as updateSectionRangePure,
  updateSourceHash as updateSourceHashPure,
} from "@shared/services/notes/noteAnchorService";
import {
  updateFileAiExplanation as updateFileAiExplanationPure,
  updateFileUserNote as updateFileUserNotePure,
  updateLineAiExplanation as updateLineAiExplanationPure,
  updateLineUserNote as updateLineUserNotePure,
  updateSectionAiExplanation as updateSectionAiExplanationPure,
  updateSectionKind as updateSectionKindPure,
  updateSectionTitle as updateSectionTitlePure,
  updateSectionUserNote as updateSectionUserNotePure,
} from "@shared/services/notes/noteContentService";
import {
  markSourceFileNotesCurrentConfirmed as markSourceFileNotesCurrentConfirmedPure,
  markSourceFileNotesStale as markSourceFileNotesStalePure,
  updateFileNoteStatus as updateFileNoteStatusPure,
  updateLineNoteStatus as updateLineNoteStatusPure,
  updateSectionNoteStatus as updateSectionNoteStatusPure,
} from "@shared/services/notes/noteStatusService";

/**
 * Dependencies required by fine-grained source-file note update helpers.
 *
 * @example
 * const deps: WorkspaceNoteUpdateDependencies = managerDeps;
 */
export type WorkspaceNoteUpdateDependencies = {
  /** Applies a pure source-file update and persists the result. */
  updateStoredSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
    update: (sourceFile: StoredSourceFile) => StoredSourceFile,
  ): Promise<StoredSourceFile>;
};

/**
 * Updates the stored source hash for one source file.
 *
 * @example
 * await updateSourceHash(deps, root, ".czaza", "src/index.ts", "sha256:abc", now);
 */
export function updateSourceHash(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sourceHash: string,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateSourceHashPure(sourceFile, sourceHash),
  );
}

/**
 * Updates the stored VS Code language id for one source file.
 *
 * @example
 * await updateProgrammingLanguage(deps, root, ".czaza", "src/index.ts", "typescriptreact", now);
 */
export function updateProgrammingLanguage(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  programmingLanguage: ProgrammingLanguage | undefined,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateProgrammingLanguagePure(sourceFile, programmingLanguage),
  );
}

/**
 * Updates the file-level note status.
 *
 * @example
 * await updateFileNoteStatus(deps, root, ".czaza", "src/index.ts", status, now);
 */
export function updateFileNoteStatus(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  status: NoteStatus,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateFileNoteStatusPure(sourceFile, status, now),
  );
}

/**
 * Updates one section note status.
 *
 * @example
 * await updateSectionNoteStatus(deps, root, ".czaza", "src/index.ts", "section:1", status, now);
 */
export function updateSectionNoteStatus(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
  status: NoteStatus,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateSectionNoteStatusPure(sourceFile, sectionId, status, now),
  );
}

/**
 * Updates one line note status.
 *
 * @example
 * await updateLineNoteStatus(deps, root, ".czaza", "src/index.ts", "line:1", status, now);
 */
export function updateLineNoteStatus(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  lineId: string,
  status: NoteStatus,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateLineNoteStatusPure(sourceFile, lineId, status, now),
  );
}

/**
 * Marks every existing note in one source file as stale.
 *
 * @example
 * await markSourceFileNotesStale(deps, root, ".czaza", "src/index.ts", now);
 */
export function markSourceFileNotesStale(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => markSourceFileNotesStalePure(sourceFile, now),
  );
}

/**
 * Marks every existing note in one source file as current and confirmed.
 *
 * @example
 * await markSourceFileNotesCurrentConfirmed(deps, root, ".czaza", "src/index.ts", now);
 */
export function markSourceFileNotesCurrentConfirmed(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => markSourceFileNotesCurrentConfirmedPure(sourceFile, now),
  );
}

/**
 * Updates one section note source range.
 *
 * @example
 * await updateSectionRange(deps, root, ".czaza", "src/index.ts", "section:1", { startLine: 1, endLine: 3 }, 20, now);
 */
export function updateSectionRange(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
  range: LineRange,
  lineCount: number,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateSectionRangePure(sourceFile, sectionId, range, lineCount, now),
  );
}

/**
 * Updates one section note anchor hash.
 *
 * @example
 * await updateSectionAnchorHash(deps, root, ".czaza", "src/index.ts", "section:1", "sha256:abc", now);
 */
export function updateSectionAnchorHash(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
  anchorHash: string,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateSectionAnchorHashPure(sourceFile, sectionId, anchorHash, now),
  );
}

/**
 * Updates one line note source line.
 *
 * @example
 * await updateLineNumber(deps, root, ".czaza", "src/index.ts", "line:1", 3, 20, now);
 */
export function updateLineNumber(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  lineId: string,
  line: number,
  lineCount: number,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateLineNumberPure(sourceFile, lineId, line, lineCount, now),
  );
}

/**
 * Updates one line note anchor text.
 *
 * @example
 * await updateLineAnchorText(deps, root, ".czaza", "src/index.ts", "line:1", "const value = 1;", now);
 */
export function updateLineAnchorText(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  lineId: string,
  anchorText: string,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateLineAnchorTextPure(sourceFile, lineId, anchorText, now),
  );
}

/**
 * Updates the file-level user note.
 *
 * @example
 * await updateFileUserNote(deps, root, ".czaza", "src/index.ts", "Remember this.", now);
 */
export function updateFileUserNote(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  userNote: string | undefined,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateFileUserNotePure(sourceFile, userNote, now),
  );
}

/**
 * Updates one section note user note.
 *
 * @example
 * await updateSectionUserNote(deps, root, ".czaza", "src/index.ts", "section:1", "Review this.", now);
 */
export function updateSectionUserNote(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
  userNote: string | undefined,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateSectionUserNotePure(sourceFile, sectionId, userNote, now),
  );
}

/**
 * Updates one line note user note.
 *
 * @example
 * await updateLineUserNote(deps, root, ".czaza", "src/index.ts", "line:1", "Important.", now);
 */
export function updateLineUserNote(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  lineId: string,
  userNote: string | undefined,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateLineUserNotePure(sourceFile, lineId, userNote, now),
  );
}

/**
 * Updates the file-level AI explanation.
 *
 * @example
 * await updateFileAiExplanation(deps, root, ".czaza", "src/index.ts", explanation, now);
 */
export function updateFileAiExplanation(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  aiExplanation: AIExplanation | undefined,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateFileAiExplanationPure(sourceFile, aiExplanation, now),
  );
}

/**
 * Updates one section note AI explanation.
 *
 * @example
 * await updateSectionAiExplanation(deps, root, ".czaza", "src/index.ts", "section:1", explanation, now);
 */
export function updateSectionAiExplanation(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
  aiExplanation: AIExplanation | undefined,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateSectionAiExplanationPure(sourceFile, sectionId, aiExplanation, now),
  );
}

/**
 * Updates one line note AI explanation.
 *
 * @example
 * await updateLineAiExplanation(deps, root, ".czaza", "src/index.ts", "line:1", explanation, now);
 */
export function updateLineAiExplanation(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  lineId: string,
  aiExplanation: AIExplanation | undefined,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateLineAiExplanationPure(sourceFile, lineId, aiExplanation, now),
  );
}

/**
 * Updates one section note title.
 *
 * @example
 * await updateSectionTitle(deps, root, ".czaza", "src/index.ts", "section:1", "Setup", now);
 */
export function updateSectionTitle(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
  title: string,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateSectionTitlePure(sourceFile, sectionId, title, now),
  );
}

/**
 * Updates one section note kind.
 *
 * @example
 * await updateSectionKind(deps, root, ".czaza", "src/index.ts", "section:1", "setup", now);
 */
export function updateSectionKind(
  deps: WorkspaceNoteUpdateDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
  kind: string | undefined,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => updateSectionKindPure(sourceFile, sectionId, kind, now),
  );
}
