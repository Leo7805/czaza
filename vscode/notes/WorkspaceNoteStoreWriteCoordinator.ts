/**
 * Serializes writes that target the same workspace Note Store.
 */

/**
 * Coordinates one-at-a-time writes for each workspace and output directory.
 */
export class WorkspaceNoteStoreWriteCoordinator {
  private readonly queues = new Map<string, Promise<void>>();

  /**
   * Runs one write after earlier writes for the same Store have settled.
   *
   * @param key - Stable workspace Note Store key.
   * @param task - Write operation to serialize.
   * @returns Result produced by the write operation.
   */
  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => current);

    this.queues.set(key, queued);
    await previous.catch(() => undefined);

    try {
      return await task();
    } finally {
      release?.();

      if (this.queues.get(key) === queued) {
        this.queues.delete(key);
      }
    }
  }
}
