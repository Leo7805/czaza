/**
 * Tests generic debounce, queue, invalidation, and suppression coordination.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ChangeTaskCoordinator } from "@vscode/services/changeCoordination";

describe("ChangeTaskCoordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps only the latest debounced task for one key", async () => {
    vi.useFakeTimers();
    const coordinator = new ChangeTaskCoordinator(100);
    const first = vi.fn();
    const second = vi.fn();

    coordinator.schedule("file:///workspace/index.ts", first);
    coordinator.schedule("file:///workspace/index.ts", second);
    await vi.advanceTimersByTimeAsync(100);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it("serializes queued tasks for the same resource", async () => {
    const coordinator = new ChangeTaskCoordinator(100);
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    coordinator.enqueue("file:///workspace/index.ts", async () => {
      order.push("first:start");
      await firstPending;
      order.push("first:end");
    });
    coordinator.enqueue("file:///workspace/index.ts", async () => {
      order.push("second");
    });

    await vi.waitFor(() => expect(order).toEqual(["first:start"]));
    releaseFirst?.();
    await coordinator.waitForIdle("file:///workspace/index.ts");

    expect(order).toEqual(["first:start", "first:end", "second"]);
    coordinator.dispose();
  });

  it("invalidates old task tokens and cancels pending debounce", async () => {
    vi.useFakeTimers();
    const coordinator = new ChangeTaskCoordinator(100);
    const token = coordinator.captureToken();
    const task = vi.fn();

    coordinator.schedule("file:///workspace/index.ts", task);
    coordinator.invalidate();
    await vi.advanceTimersByTimeAsync(100);

    expect(coordinator.canApply(token)).toBe(false);
    expect(task).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("delegates deterministic Delete suppression", () => {
    vi.useFakeTimers();
    const coordinator = new ChangeTaskCoordinator(100, 100);
    const uri = {
      fsPath: "/workspace/src/index.ts",
    } as never;

    coordinator.markDeleted(uri);

    expect(coordinator.isDeleteSuppressed(uri)).toBe(true);
    coordinator.dispose();
  });
});
