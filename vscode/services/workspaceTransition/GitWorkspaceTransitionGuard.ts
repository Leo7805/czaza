/**
 * Tracks the short workspace transition window caused by Git HEAD changes.
 */

/** Disposable listener registration returned by the transition guard. */
export type WorkspaceTransitionDisposable = {
  /** Removes the registered listener. */
  dispose(): void;
};

/** Callback invoked when a workspace transition starts or finishes. */
export type WorkspaceTransitionListener = () => void;

/**
 * Coordinates transition state and a trailing stability timer.
 *
 * The guard owns its timer and listener registrations until disposed.
 *
 * @example
 * const guard = new GitWorkspaceTransitionGuard();
 * guard.beginTransition();
 */
export class GitWorkspaceTransitionGuard {
  private readonly startListeners = new Set<WorkspaceTransitionListener>();
  private readonly finishListeners = new Set<WorkspaceTransitionListener>();
  private readonly settleDelayMs: number;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private transitioning = false;

  /**
   * Creates a transition guard.
   *
   * @param settleDelayMs - Quiet period required before finishing a transition.
   */
  constructor(settleDelayMs = 800) {
    this.settleDelayMs = settleDelayMs;
  }

  /**
   * Reports whether Git is currently replacing workspace state.
   *
   * @returns True while the transition stability timer is active.
   */
  isTransitioning(): boolean {
    return this.transitioning;
  }

  /**
   * Starts a transition or extends the current transition stability period.
   *
   * @returns Nothing.
   */
  beginTransition(): void {
    if (!this.transitioning) {
      this.transitioning = true;
      this.emit(this.startListeners);
    }

    this.restartSettleTimer();
  }

  /**
   * Extends an active transition after another workspace file event.
   *
   * @returns Nothing.
   */
  touchTransition(): void {
    if (this.transitioning) {
      this.restartSettleTimer();
    }
  }

  /**
   * Registers a listener invoked once when a transition starts.
   *
   * @param listener - Callback to invoke.
   * @returns Disposable listener registration.
   */
  onDidStartTransition(
    listener: WorkspaceTransitionListener,
  ): WorkspaceTransitionDisposable {
    return this.addListener(this.startListeners, listener);
  }

  /**
   * Registers a listener invoked after the transition becomes stable.
   *
   * @param listener - Callback to invoke.
   * @returns Disposable listener registration.
   */
  onDidFinishTransition(
    listener: WorkspaceTransitionListener,
  ): WorkspaceTransitionDisposable {
    return this.addListener(this.finishListeners, listener);
  }

  /**
   * Clears the active timer and all listeners.
   *
   * @returns Nothing.
   */
  dispose(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = undefined;
    }

    this.transitioning = false;
    this.startListeners.clear();
    this.finishListeners.clear();
  }

  /**
   * Restarts the trailing stability timer.
   *
   * @returns Nothing.
   */
  private restartSettleTimer(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
    }

    this.settleTimer = setTimeout(() => {
      this.settleTimer = undefined;
      this.transitioning = false;
      this.emit(this.finishListeners);
    }, this.settleDelayMs);
  }

  /**
   * Adds one callback to a listener collection.
   *
   * @param listeners - Listener collection to update.
   * @param listener - Callback to register.
   * @returns Disposable listener registration.
   */
  private addListener(
    listeners: Set<WorkspaceTransitionListener>,
    listener: WorkspaceTransitionListener,
  ): WorkspaceTransitionDisposable {
    listeners.add(listener);

    return {
      dispose: () => listeners.delete(listener),
    };
  }

  /**
   * Invokes a stable snapshot of registered listeners.
   *
   * @param listeners - Listener collection to notify.
   * @returns Nothing.
   */
  private emit(listeners: Set<WorkspaceTransitionListener>): void {
    for (const listener of [...listeners]) {
      listener();
    }
  }
}
