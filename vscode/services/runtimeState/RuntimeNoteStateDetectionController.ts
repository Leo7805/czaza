/**
 * Provides shared entry points for reconciling source resources with Runtime Note State.
 */

import * as path from "node:path";

import * as vscode from "vscode";

import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { getResourceFingerprint } from "@vscode/services/resourceFingerprint/getResourceFingerprintService";

import {
  refreshBinaryRuntimeNoteStateService,
  type RefreshBinaryRuntimeNoteStateResult,
} from "./refreshBinaryRuntimeNoteStateService";
import {
  refreshMissingRuntimeNoteStateService,
  type RefreshMissingRuntimeNoteStateResult,
} from "./refreshMissingRuntimeNoteStateService";
import {
  refreshRuntimeNoteStateService,
  type RefreshRuntimeNoteStateResult,
} from "./refreshRuntimeNoteStateService";
import type { RuntimeNoteDetectionDocument } from "./detectRuntimeNoteStateService";
import type { RuntimeNoteStateRegistry } from "./RuntimeNoteStateRegistry";

/** Result produced when one current source resource is detected. */
export type CurrentFileNotesDetectionResult = RefreshRuntimeNoteStateResult;

/** Result produced when one URI is classified and detected. */
export type ResourceNotesDetectionResult =
  | CurrentFileNotesDetectionResult
  | RefreshBinaryRuntimeNoteStateResult
  | RefreshMissingRuntimeNoteStateResult
  | { kind: "directory"; registryChange: "none" };

/** Summary produced after checking every resource represented by a File Note. */
export type AllFileNotesDetectionResult = {
  checked: number;
  skipped: number;
  failed: readonly string[];
};

/**
 * Owns reusable Runtime State detection entry points without refreshing UI directly.
 *
 * A project-wide File Note check selects resources through the File Note index,
 * then reconciles each complete resource state so existing Section and Line state
 * cannot be accidentally discarded from the resource-level Registry entry.
 *
 * @example
 * const controller = new RuntimeNoteStateDetectionController(notes, registry);
 * await controller.detectCurrentFileNotes(document);
 */
export class RuntimeNoteStateDetectionController {
  private readonly notes: WorkspaceNoteStore;
  private readonly registry: RuntimeNoteStateRegistry;
  private readonly now: () => string;

  /**
   * Creates shared detection entry points for one Note Store and Registry.
   *
   * @param notes - Persistent Note Store used only for detection reads.
   * @param registry - Session-only Registry receiving detection results.
   * @param now - Optional timestamp factory for deterministic tests.
   */
  constructor(
    notes: WorkspaceNoteStore,
    registry: RuntimeNoteStateRegistry,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.notes = notes;
    this.registry = registry;
    this.now = now;
  }

  /**
   * Detects File, Section, and Line Note state for one current text resource.
   *
   * @param document - Current immutable or VS Code text document snapshot.
   * @param canApply - Optional final check that rejects an obsolete result.
   * @returns Detection result and Registry mutation.
   */
  async detectCurrentFileNotes(
    document: RuntimeNoteDetectionDocument,
    canApply?: () => boolean,
  ): Promise<CurrentFileNotesDetectionResult> {
    return refreshRuntimeNoteStateService({
      document,
      notes: this.notes,
      registry: this.registry,
      now: this.now(),
      ...(canApply ? { canApply } : {}),
    });
  }

  /**
   * Classifies and detects one text, binary, missing, or directory resource.
   *
   * @param uri - Source resource to reconcile with persistent Notes.
   * @returns Resource-specific detection result and Registry mutation.
   */
  async detectResourceNotes(uri: vscode.Uri): Promise<ResourceNotesDetectionResult> {
    try {
      const fingerprint = await getResourceFingerprint(uri);

      if (fingerprint.kind === "directory") {
        return { kind: "directory", registryChange: "none" };
      }

      if (fingerprint.kind === "binary") {
        return refreshBinaryRuntimeNoteStateService({
          uri,
          currentSourceHash: fingerprint.hash,
          notes: this.notes,
          registry: this.registry,
          now: this.now(),
        });
      }

      return this.detectCurrentFileNotes(fingerprint.document);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return this.detectMissingFileNotes(uri);
      }

      throw error;
    }
  }

  /**
   * Detects every source resource represented by a project File Note.
   *
   * @param referenceUri - Resource used to resolve the current CZaza project root.
   * @returns Counts for checked, skipped, and failed File Note resources.
   */
  async detectAllFileNotes(referenceUri: vscode.Uri): Promise<AllFileNotesDetectionResult> {
    const { rootDirectory } = resolveCzazaRootDirectory(referenceUri);
    const settings = getCzazaSettings(referenceUri);
    const index = await this.notes.cache.loadIndex(rootDirectory, settings.outputDirectory);
    const failed: string[] = [];
    let checked = 0;
    let skipped = 0;

    for (const relativePath of Object.keys(index?.files ?? {}).sort()) {
      if (!relativePath) {
        skipped += 1;
        continue;
      }

      const sourceFile = await this.notes.cache.getSourceFile(
        rootDirectory,
        settings.outputDirectory,
        relativePath,
      );

      if (!sourceFile?.fileNote) {
        skipped += 1;
        continue;
      }

      const uri = vscode.Uri.file(path.join(rootDirectory, relativePath));

      try {
        const result = await this.detectResourceNotes(uri);

        if (result.kind === "directory") {
          skipped += 1;
          continue;
        }

        checked += 1;
      } catch {
        failed.push(relativePath);
      }
    }

    return { checked, skipped, failed };
  }

  /**
   * Reconciles one missing File Note resource through the shared Registry.
   *
   * @param uri - Missing source resource URI.
   * @returns Missing-resource detection result.
   */
  private async detectMissingFileNotes(
    uri: vscode.Uri,
  ): Promise<RefreshMissingRuntimeNoteStateResult> {
    return refreshMissingRuntimeNoteStateService({
      uri,
      notes: this.notes,
      registry: this.registry,
      now: this.now(),
    });
  }
}

/**
 * Reports whether a filesystem operation failed because its target is absent.
 *
 * @param error - Unknown filesystem error.
 * @returns True for VS Code or Node-style missing-file errors.
 */
function isFileNotFoundError(error: unknown): boolean {
  return (
    (error instanceof Error &&
      "code" in error &&
      (error as Error & { code?: string }).code === "FileNotFound") ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT")
  );
}
