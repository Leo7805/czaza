/**
 * Unit tests for the Git workspace transition stability guard.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { GitWorkspaceTransitionGuard } from "@vscode/services/workspaceTransition/GitWorkspaceTransitionGuard";

describe("GitWorkspaceTransitionGuard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts once and finishes after the configured quiet period", async () => {
    vi.useFakeTimers();
    const guard = new GitWorkspaceTransitionGuard(100);
    const onStart = vi.fn();
    const onFinish = vi.fn();
    guard.onDidStartTransition(onStart);
    guard.onDidFinishTransition(onFinish);

    guard.beginTransition();
    guard.beginTransition();

    expect(guard.isTransitioning()).toBe(true);
    expect(onStart).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(100);

    expect(guard.isTransitioning()).toBe(false);
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it("keeps the transition active until asynchronous finish work completes", async () => {
    vi.useFakeTimers();
    const guard = new GitWorkspaceTransitionGuard(100);
    let finishRefresh: (() => void) | undefined;
    const refresh = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    guard.onDidFinishTransition(() => refresh);

    guard.beginTransition();
    await vi.advanceTimersByTimeAsync(100);

    expect(guard.isTransitioning()).toBe(true);

    finishRefresh?.();
    await vi.waitFor(() => expect(guard.isTransitioning()).toBe(false));

    expect(guard.isTransitioning()).toBe(false);
  });

  it("increments the revision for every observed HEAD transition", () => {
    const guard = new GitWorkspaceTransitionGuard(100);
    const initialRevision = guard.getRevision();

    guard.beginTransition();
    const firstRevision = guard.getRevision();
    guard.beginTransition();

    expect(firstRevision).toBe(initialRevision + 1);
    expect(guard.getRevision()).toBe(firstRevision + 1);
    expect(guard.isRevisionCurrent(firstRevision)).toBe(false);
    guard.dispose();
  });

  it("extends the quiet period when workspace events continue", async () => {
    vi.useFakeTimers();
    const guard = new GitWorkspaceTransitionGuard(100);

    guard.beginTransition();
    await vi.advanceTimersByTimeAsync(75);
    guard.touchTransition();
    await vi.advanceTimersByTimeAsync(75);

    expect(guard.isTransitioning()).toBe(true);

    await vi.advanceTimersByTimeAsync(25);

    expect(guard.isTransitioning()).toBe(false);
  });

  it("disposes its timer and listeners", async () => {
    vi.useFakeTimers();
    const guard = new GitWorkspaceTransitionGuard(100);
    const onFinish = vi.fn();
    guard.onDidFinishTransition(onFinish);

    guard.beginTransition();
    guard.dispose();
    await vi.advanceTimersByTimeAsync(100);

    expect(guard.isTransitioning()).toBe(false);
    expect(onFinish).not.toHaveBeenCalled();
  });
});
