/**
 * Applies a classified source change to persisted workspace Notes.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import * as vscode from "vscode";
import {
  applyDeterministicRelocation,
  type ApplyDeterministicRelocationResult,
} from "./applyDeterministicRelocationService";
import type { ClassifiedSourceChange } from "./classifySourceChangeService";

/** Minimal document shape required by deterministic text-change application. */
export type TextDocumentChangeNotesDocument = {
  /** VS Code URI for the source document. */
  uri: vscode.Uri;

  /** VS Code language id, such as `typescript`, when available. */
  languageId?: string;

  /** Returns the full current document text after the change. */
  getText(): string;
};

/** Input for applying one classified text document change to stored notes. */
export type ApplySourceChangeToNotesInput = {
  /** Current source document after the text change. */
  document: TextDocumentChangeNotesDocument;

  /** Classified text change. */
  change: ClassifiedSourceChange;

  /** Shared workspace note store. */
  notes: WorkspaceNoteStore;

  /** ISO timestamp used for saved note metadata. */
  now: string;
};

/** Result from applying one classified text document change to stored notes. */
export type ApplySourceChangeToNotesResult =
  | {
      /** The change was deterministic and persisted. */
      kind: "updated";
      relativePath: string;
      sourceFile: StoredSourceFile;
      updatedSourceFile: StoredSourceFile;
      applyResult: ApplyDeterministicRelocationResult;
    }
  | {
      /** The change was deterministic, but no stored note data changed. */
      kind: "unchanged";
      relativePath: string;
      sourceFile: StoredSourceFile;
      applyResult: ApplyDeterministicRelocationResult;
    }
  | {
      /** The change cannot be applied deterministically. */
      kind: "unsupported";
      reason: Extract<ClassifiedSourceChange, { kind: "unsupported" }>["reason"];
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
 * Applies a deterministic text change to the current file's note bundle.
 *
 * @param input - Current document, classified change, notes store, and timestamp.
 * @returns Apply outcome for the document.
 *
 * @example
 * const result = await applySourceChangeToNotesService({ document, change, notes, now });
 */
export async function applySourceChangeToNotesService(
  input: ApplySourceChangeToNotesInput,
): Promise<ApplySourceChangeToNotesResult> {
  const { document, change, notes, now } = input;

  if (change.kind === "unsupported") {
    return {
      kind: "unsupported",
      reason: change.reason,
    };
  }

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

  const applyResult = applyDeterministicRelocation({
    sourceFile,
    change,
    currentSourceText: document.getText(),
    programmingLanguage: document.languageId,
    now,
  });

  if (!applyResult.changed) {
    return {
      kind: "unchanged",
      relativePath,
      sourceFile,
      applyResult,
    };
  }

  await notes.cache.saveSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
    applyResult.sourceFile,
    now,
  );

  return {
    kind: "updated",
    relativePath,
    sourceFile,
    updatedSourceFile: applyResult.sourceFile,
    applyResult,
  };
}
