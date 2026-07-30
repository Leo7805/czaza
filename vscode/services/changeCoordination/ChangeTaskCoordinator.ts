/**
 * Coordinates suppression, debounce, serialization, and invalidation for source tasks.
 */

import type * as vscode from "vscode";

import { ResourceEventSuppressionRegistry } from "./ResourceEventSuppressionRegistry";

/** Version captured when one coordinated task is created. */
export type ChangeTaskToken = {
  /** Coordinator revision used to reject obsolete task results. */
  revision: number;
};

/** Task invoked after debounce or queue coordination. */
export type CoordinatedChangeTask = (
  token: ChangeTaskToken,
) => void | Promise<void>;

/**
 * Owns short-lived coordination state shared by source and resource events.
 *
 * The coordinator does not classify changes or update Notes. It only filters
 * known duplicate deletes, debounces Watcher work, serializes work per resource,
 * and invalidates obsolete asynchronous results.
 *
 * @example
 * const coordinator = new ChangeTaskCoordinator(800);
 * coordinator.schedule("file:///workspace/src/index.ts", async (token) => {
 *   coordinator.enqueue("file:///workspace/src/index.ts", async () => {
 *     if (coordinator.canApply(token)) {
 *       await inspectSource();
 *     }
 *   });
 * });
 */
export class ChangeTaskCoordinator implements vscode.Disposable {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly delayMs: number;
  private readonly resourceSuppression: ResourceEventSuppressionRegistry;
  private revision = 0;

  /**
   * Creates one coordinator with configurable debounce and suppression windows.
   *
   * @param delayMs - Quiet period before scheduled Watcher work starts.
   * @param suppressionMs - Lifetime for deterministic Delete suppression markers.
   */
  constructor(delayMs: number, suppressionMs?: number) {
    this.delayMs = delayMs;
    this.resourceSuppression = new ResourceEventSuppressionRegistry(suppressionMs);
  }

  /**
   * Captures the current coordinator revision for a new task.
   *
   * @returns Token used for final task validity checks.
   */
  captureToken(): ChangeTaskToken {
    return { revision: this.revision };
  }

  /**
   * Reports whether a task token still belongs to the current revision.
   *
   * @param token - Revision captured before asynchronous work started.
   * @returns True when the task may still apply its result.
   */
  canApply(token: ChangeTaskToken): boolean {
    return token.revision === this.revision;
  }

  /**
   * Schedules or replaces debounced Watcher work for one stable key.
   *
   * @param key - Resource or event key used to merge repeated work.
   * @param task - Work started after the quiet period.
   * @returns Nothing.
   */
  schedule(key: string, task: CoordinatedChangeTask): void {
    const previousTimer = this.timers.get(key);

    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    const token = this.captureToken();
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);

        if (this.canApply(token)) {
          void task(token);
        }
      }, this.delayMs),
    );
  }

  /**
   * Appends one task to the serialized queue for a resource.
   *
   * @param key - Stable resource key owning the queue.
   * @param task - Asynchronous task executed after earlier work settles.
   * @returns Nothing.
   */
  enqueue(key: string, task: () => Promise<void>): void {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(task)
      .catch((error) => {
        console.error("Failed to apply queued CZaza source-change task.", error);
      });
    const tracked = next.finally(() => {
      if (this.queues.get(key) === tracked) {
        this.queues.delete(key);
      }
    });

    this.queues.set(key, tracked);
  }

  /**
   * Waits for the currently queued work for one resource.
   *
   * @param key - Stable resource key owning the queue.
   * @returns Promise resolved after work currently in the queue settles.
   */
  async waitForIdle(key: string): Promise<void> {
    await this.queues.get(key);
  }

  /**
   * Marks one deterministic Delete for suppression of duplicate Watcher events.
   *
   * @param uri - Explicitly deleted VS Code resource.
   * @returns Nothing.
   */
  markDeleted(uri: vscode.Uri): void {
    this.resourceSuppression.markDeleted(uri);
  }

  /**
   * Reports whether a Watcher Delete repeats a recent deterministic Delete.
   *
   * @param uri - Resource reported by the filesystem watcher.
   * @returns True when the event should be ignored.
   */
  isDeleteSuppressed(uri: vscode.Uri): boolean {
    return this.resourceSuppression.isDeleteSuppressed(uri);
  }

  /**
   * Invalidates old tokens and cancels work that has not started.
   *
   * @returns Nothing.
   */
  invalidate(): void {
    this.revision += 1;
    this.cancelPending();
  }

  /**
   * Cancels all debounced work that has not started.
   *
   * @returns Nothing.
   */
  cancelPending(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
  }

  /**
   * Releases timers, suppression markers, queues, and old task tokens.
   *
   * @returns Nothing.
   */
  dispose(): void {
    this.invalidate();
    this.queues.clear();
    this.resourceSuppression.dispose();
  }
}
