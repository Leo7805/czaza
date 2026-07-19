import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stat: vi.fn(),
  openTextDocument: vi.fn(),
}));

vi.mock("vscode", () => ({
  FileType: { File: 1, Directory: 2 },
  workspace: {
    fs: { stat: mocks.stat },
    openTextDocument: mocks.openTextDocument,
  },
}));

import { getResourceFingerprint } from "@vscode/services/resourceFingerprint/getResourceFingerprintService";

describe("getResourceFingerprint()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stat.mockResolvedValue({ type: 1, size: 8192, mtime: 20, ctime: 10 });
  });

  it("hashes complete text when VS Code can open the resource as a document", async () => {
    const uri = createUri("/workspace/icon.svg");
    mocks.openTextDocument.mockResolvedValue({
      uri,
      languageId: "svg",
      getText: () => "<svg />",
    });

    const result = await getResourceFingerprint(uri);

    expect(result).toMatchObject({ kind: "text", programmingLanguage: "svg" });
    expect(result.kind === "text" ? result.hash : "").toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("uses metadata without reading binary content", async () => {
    const uri = createUri("/workspace/image.png");
    mocks.openTextDocument.mockRejectedValue(
      new Error("File seems to be binary and cannot be opened as text"),
    );

    const result = await getResourceFingerprint(uri);

    expect(result).toMatchObject({ kind: "binary" });
    expect(result.kind === "binary" ? result.hash : "").toMatch(
      /^metadata-sha256:[0-9a-f]{64}$/,
    );
  });

  it("returns directories without attempting to open a text document", async () => {
    const uri = createUri("/workspace/assets");
    mocks.stat.mockResolvedValue({ type: 2, size: 0, mtime: 20, ctime: 10 });

    await expect(getResourceFingerprint(uri)).resolves.toEqual({ kind: "directory" });
    expect(mocks.openTextDocument).not.toHaveBeenCalled();
  });
});

function createUri(fsPath: string): vscodeTypes.Uri {
  return { scheme: "file", fsPath, path: fsPath, toString: () => `file://${fsPath}` } as vscodeTypes.Uri;
}
