/**
 * Unit tests for short-lived deterministic resource-event suppression.
 */

import type * as vscodeTypes from "vscode";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceEventSuppressionRegistry } from "@vscode/services/resourceEvents";

describe("ResourceEventSuppressionRegistry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("suppresses one deleted file until its marker expires", () => {
    vi.useFakeTimers();
    const registry = new ResourceEventSuppressionRegistry(100);
    const uri = createUri("/workspace/src/index.ts");

    registry.markDeleted(uri);
    expect(registry.isDeleteSuppressed(uri)).toBe(true);

    vi.advanceTimersByTime(100);
    expect(registry.isDeleteSuppressed(uri)).toBe(false);
    registry.dispose();
  });

  it("suppresses descendant Watcher events after a directory deletion", () => {
    const registry = new ResourceEventSuppressionRegistry();

    registry.markDeleted(createUri("/workspace/src/feature"));

    expect(
      registry.isDeleteSuppressed(
        createUri("/workspace/src/feature/nested/index.ts"),
      ),
    ).toBe(true);
    expect(
      registry.isDeleteSuppressed(createUri("/workspace/src/other.ts")),
    ).toBe(false);
    registry.dispose();
  });
});

/**
 * Creates one local file URI fixture.
 *
 * @param fsPath - Absolute filesystem path.
 * @returns Minimal URI fixture.
 */
function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}
