/**
 * Unit tests for delayed source-change validation across Git HEAD transitions.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { GitAwareSourceChangeGate } from "@vscode/services/workspaceTransition/GitAwareSourceChangeGate";
import { GitWorkspaceTransitionGuard } from "@vscode/services/workspaceTransition/GitWorkspaceTransitionGuard";

describe("GitAwareSourceChangeGate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a stable task after the configured quiet period", async () => {
    vi.useFakeTimers();
    const guard = new GitWorkspaceTransitionGuard(100);
    const gate = new GitAwareSourceChangeGate(50, guard);
    const task = vi.fn();

    gate.schedule("file:///workspace/src/index.ts", task);
    await vi.advanceTimersByTimeAsync(49);
    expect(task).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledOnce();
    expect(gate.canPersist(task.mock.calls[0]![0])).toBe(true);
  });

  it("cancels a delayed task when HEAD changes before it starts", async () => {
    vi.useFakeTimers();
    const guard = new GitWorkspaceTransitionGuard(100);
    const gate = new GitAwareSourceChangeGate(50, guard);
    const task = vi.fn();

    gate.schedule("file:///workspace/src/index.ts", task);
    guard.beginTransition();
    await vi.advanceTimersByTimeAsync(50);

    expect(task).not.toHaveBeenCalled();
  });

  it("invalidates a running task token after a later HEAD transition", () => {
    const guard = new GitWorkspaceTransitionGuard(100);
    const gate = new GitAwareSourceChangeGate(50, guard);
    const token = gate.captureToken();

    expect(gate.canPersist(token)).toBe(true);

    guard.beginTransition();

    expect(gate.canPersist(token)).toBe(false);
    expect(guard.isRevisionCurrent(token.revision)).toBe(false);
    guard.dispose();
  });

  it("coalesces repeated changes for the same resource", async () => {
    vi.useFakeTimers();
    const gate = new GitAwareSourceChangeGate(50);
    const firstTask = vi.fn();
    const secondTask = vi.fn();

    gate.schedule("file:///workspace/src/index.ts", firstTask);
    await vi.advanceTimersByTimeAsync(25);
    gate.schedule("file:///workspace/src/index.ts", secondTask);
    await vi.advanceTimersByTimeAsync(50);

    expect(firstTask).not.toHaveBeenCalled();
    expect(secondTask).toHaveBeenCalledOnce();
  });

  it("invalidates running tokens after the Note Store changes externally", () => {
    const gate = new GitAwareSourceChangeGate(50);
    const token = gate.captureToken();

    gate.invalidate();

    expect(gate.canPersist(token)).toBe(false);
  });
});
