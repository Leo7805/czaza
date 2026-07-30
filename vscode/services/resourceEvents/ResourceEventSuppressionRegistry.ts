/**
 * Tracks short-lived deterministic resource events that may be repeated by a filesystem watcher.
 */

import * as path from "node:path";
import type * as vscode from "vscode";

/** Default lifetime for one deterministic resource-event suppression marker. */
const DEFAULT_SUPPRESSION_MS = 1500;

/**
 * Owns short-lived deletion markers shared by VS Code and Watcher event handlers.
 *
 * @example
 * const registry = new ResourceEventSuppressionRegistry();
 * registry.markDeleted(uri);
 * if (registry.isDeleteSuppressed(uri)) {
 *   // Ignore the duplicate Watcher Delete.
 * }
 */
export class ResourceEventSuppressionRegistry implements vscode.Disposable {
  private readonly deletedResources = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly suppressionMs: number;

  /**
   * Creates a registry with a configurable marker lifetime.
   *
   * @param suppressionMs - Milliseconds before one deletion marker expires.
   */
  constructor(suppressionMs = DEFAULT_SUPPRESSION_MS) {
    this.suppressionMs = suppressionMs;
  }

  /**
   * Marks one deterministically deleted file or directory.
   *
   * @param uri - Resource reported by VS Code's explicit delete event.
   * @returns Nothing.
   */
  markDeleted(uri: vscode.Uri): void {
    const key = normalizeFilePath(uri);
    const previousTimer = this.deletedResources.get(key);

    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    this.deletedResources.set(
      key,
      setTimeout(() => {
        this.deletedResources.delete(key);
      }, this.suppressionMs),
    );
  }

  /**
   * Reports whether a Watcher Delete duplicates a recent deterministic deletion.
   *
   * Directory markers suppress descendant file notifications without consuming
   * the marker, because one directory deletion may emit several Watcher events.
   *
   * @param uri - Resource reported by the filesystem watcher.
   * @returns True when the resource equals or descends from a marked deletion.
   */
  isDeleteSuppressed(uri: vscode.Uri): boolean {
    const candidate = normalizeFilePath(uri);

    return [...this.deletedResources.keys()].some((deletedPath) =>
      isSameOrDescendantPath(candidate, deletedPath)
    );
  }

  /**
   * Clears every pending marker and timer.
   *
   * @returns Nothing.
   */
  dispose(): void {
    for (const timer of this.deletedResources.values()) {
      clearTimeout(timer);
    }

    this.deletedResources.clear();
  }
}

/**
 * Normalizes one local URI for stable path comparison.
 *
 * @param uri - Local resource URI.
 * @returns Absolute normalized filesystem path.
 */
function normalizeFilePath(uri: vscode.Uri): string {
  return path.resolve(uri.fsPath);
}

/**
 * Reports whether a path equals or descends from another path.
 *
 * @param candidate - Candidate absolute path.
 * @param parent - Marked file or directory path.
 * @returns True when the candidate is the same path or lies below it.
 */
function isSameOrDescendantPath(candidate: string, parent: string): boolean {
  const relativePath = path.relative(parent, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}
