/**
 * Checks and persists note status for one saved or externally changed source file.
 */

import {
  updateProgrammingLanguage,
  updateSourceHash,
} from "@shared/services/notes/noteAnchorService";
import { applyFileNotesDetectionReport } from "@shared/services/notes/noteDetectionApplyService";
import {
  detectFileNotes,
  type FileNotesDetectionReport,
} from "@shared/services/notes/noteDetectionService";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import * as vscode from "vscode";

/** Minimal document shape required by changed file note detection. */
export type ChangedFileNotesDocument = {
  /** VS Code URI for the source document. */
  uri: vscode.Uri;

  /** VS Code language id, such as `typescript`, when available. */
  languageId?: string;

  /** Returns the full current document text. */
  getText(): string;
};

/** Input for checking and applying changed file notes. */
export type CheckChangedFileNotesInput = {
  /** Current saved or externally changed source document. */
  document: ChangedFileNotesDocument;

  /** Shared workspace note store. */
  notes: WorkspaceNoteStore;

  /** ISO timestamp used for saved note metadata. */
  now: string;
};

/** Result from checking one changed source file's notes. */
export type CheckChangedFileNotesResult =
  | {
      /** The file had tracked notes and persisted changes. */
      kind: "updated";
      relativePath: string;
      report: FileNotesDetectionReport;
      sourceFile: StoredSourceFile;
      updatedSourceFile: StoredSourceFile;
    }
  | {
      /** The file had tracked notes, but no stored status or source metadata changed. */
      kind: "unchanged";
      relativePath: string;
      report: FileNotesDetectionReport;
      sourceFile: StoredSourceFile;
    }
  | {
      /** The URI was not a local file. */
      kind: "ignored";
      reason: "nonFileUri";
    }
  | {
      /** No stored note bundle exists for this source path. */
      kind: "untracked";
      relativePath: string;
    };

/**
 * Detects the current file's file, section, and line note status and saves changes.
 *
 * @param input - Current document, notes store, and timestamp.
 * @returns Detection outcome for the document.
 *
 * @example
 * const result = await checkChangedFileNotesService({ document, notes, now });
 */
export async function checkChangedFileNotesService(
  input: CheckChangedFileNotesInput,
): Promise<CheckChangedFileNotesResult> {
  const { document, notes, now } = input;

  if (document.uri.scheme !== "file") {
    return {
      kind: "ignored",
      reason: "nonFileUri",
    };
  }

  const resolvedRoot = resolveCzazaRootDirectory(document.uri);
  const settings = getCzazaSettings(document.uri);
  const relativePath = getCzazaRelativePath(document.uri, resolvedRoot.rootDirectory);
  const sourceFile = await notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
  );

  if (!sourceFile) {
    return {
      kind: "untracked",
      relativePath,
    };
  }

  const report = detectFileNotes(document.getText(), sourceFile, {
    programmingLanguage: document.languageId,
  });

  if (!report.file.sourceHashChanged) {
    if (report.file.programmingLanguageChanged !== true) {
      return {
        kind: "unchanged",
        relativePath,
        report,
        sourceFile,
      };
    }

    const updatedSourceFile = updateProgrammingLanguage(
      updateSourceHash(sourceFile, report.file.currentSourceHash),
      report.file.currentProgrammingLanguage,
    );

    await notes.cache.saveSourceFile(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
      updatedSourceFile,
      now,
    );

    return {
      kind: "updated",
      relativePath,
      report,
      sourceFile,
      updatedSourceFile,
    };
  }

  if (!hasDetectedChanges(sourceFile, report)) {
    return {
      kind: "unchanged",
      relativePath,
      report,
      sourceFile,
    };
  }

  const updatedSourceFile = updateProgrammingLanguage(
    updateSourceHash(applyFileNotesDetectionReport(sourceFile, report, now), report.file.currentSourceHash),
    report.file.currentProgrammingLanguage,
  );

  await notes.cache.saveSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
    updatedSourceFile,
    now,
  );

  return {
    kind: "updated",
    relativePath,
    report,
    sourceFile,
    updatedSourceFile,
  };
}

function hasDetectedChanges(
  sourceFile: StoredSourceFile,
  report: FileNotesDetectionReport,
): boolean {
  return (
    report.file.sourceHashChanged ||
    report.file.programmingLanguageChanged === true ||
    hasFileStatusChanged(sourceFile, report) ||
    report.sections.some((section) => {
      const note = sourceFile.sectionNotes.find((candidate) => candidate.id === section.id);

      return Boolean(note && !isSameStatus(note.status, section.status));
    }) ||
    report.lines.some((line) => {
      const note = sourceFile.lineNotes.find((candidate) => candidate.id === line.id);

      return Boolean(note && !isSameStatus(note.status, line.status));
    })
  );
}

function hasFileStatusChanged(
  sourceFile: StoredSourceFile,
  report: FileNotesDetectionReport,
): boolean {
  return Boolean(
    sourceFile.fileNote && !isSameStatus(sourceFile.fileNote.status, report.file.status),
  );
}

function isSameStatus(
  left: { content: string; anchor: string },
  right: { content: string; anchor: string },
): boolean {
  return left.content === right.content && left.anchor === right.anchor;
}
