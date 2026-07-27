/**
 * Delays automatic source changes and invalidates work across Git HEAD transitions.
 */

import type { GitWorkspaceTransitionGuard } from "./GitWorkspaceTransitionGuard";

/** Revision token captured when one automatic source-change task is accepted. */
export type SourceChangeRevisionToken = {
  /** HEAD transition revision observed before the task started. */
  revision: number;

  /** Gate-local revision incremented when the Note Store changes externally. */
  gateRevision: number;
};

/** Automatic source-change task invoked after the configured quiet period. */
export type GitAwareSourceChangeTask = (
  token: SourceChangeRevisionToken,
) => void | Promise<void>;

/**
 * Owns debounced automatic source-change tasks and their HEAD revision tokens.
 *
 * @example
 * const gate = new GitAwareSourceChangeGate(800, guard);
 * gate.schedule("file:///workspace/src/index.ts", async (token) => {
 *   if (gate.canPersist(token)) {
 *     await updateNotes();
 *   }
 * });
 */
export class GitAwareSourceChangeGate {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly delayMs: number;
  private readonly guard: GitWorkspaceTransitionGuard | undefined;
  private gateRevision = 0;

  /**
   * Creates a Git-aware automatic source-change gate.
   *
   * @param delayMs - Quiet period before a scheduled task may start.
   * @param guard - Optional Git transition guard for revision validation.
   */
  constructor(
    delayMs: number,
    guard?: GitWorkspaceTransitionGuard,
  ) {
    this.delayMs = delayMs;
    this.guard = guard;
  }

  /**
   * Captures the revision used to validate a newly started automatic task.
   *
   * @returns Current source-change revision token.
   */
  captureToken(): SourceChangeRevisionToken {
    return {
      revision: this.guard?.getRevision() ?? 0,
      gateRevision: this.gateRevision,
    };
  }

  /**
   * Reports whether a task may persist under its captured revision.
   *
   * @param token - Revision token captured when the task started.
   * @returns True when no Git transition is active and the revision is current.
   */
  canPersist(token: SourceChangeRevisionToken): boolean {
    return (
      this.guard?.isTransitioning() !== true &&
      (this.guard?.isRevisionCurrent(token.revision) ?? true) &&
      token.gateRevision === this.gateRevision
    );
  }

  /**
   * Waits for the configured confirmation window before validating a task token.
   *
   * The timer starts when this method is called, so multiple queued document
   * changes wait concurrently while preserving their later execution order.
   *
   * @param token - Revision token captured when the automatic change arrived.
   * @returns Promise resolving whether the task may enter its persistence queue.
   */
  async confirmPersistence(token: SourceChangeRevisionToken): Promise<boolean> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, this.delayMs);
    });

    return this.canPersist(token);
  }

  /**
   * Invalidates pending and running tasks after an external Note Store change.
   *
   * @returns Nothing.
   */
  invalidate(): void {
    this.gateRevision += 1;
    this.cancelPending();
  }

  /**
   * Schedules or replaces one debounced automatic source-change task.
   *
   * @param key - Stable resource key used to coalesce repeated changes.
   * @param task - Task invoked after the quiet period when still valid.
   * @returns Nothing.
   */
  schedule(key: string, task: GitAwareSourceChangeTask): void {
    if (this.guard?.isTransitioning()) {
      this.guard.touchTransition();
      return;
    }

    const previousTimer = this.timers.get(key);

    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    const token = this.captureToken();
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);

        if (this.canPersist(token)) {
          void task(token);
        }
      }, this.delayMs),
    );
  }

  /**
   * Cancels every automatic task that has not started yet.
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
   * Releases pending timers owned by the gate.
   *
   * @returns Nothing.
   */
  dispose(): void {
    this.cancelPending();
  }
}
