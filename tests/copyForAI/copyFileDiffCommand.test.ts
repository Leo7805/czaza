/**
 * Tests the VS Code command for copying a selected file's Git diff.
 *
 * VS Code APIs and Git diff retrieval are mocked so these tests do not
 * modify the real clipboard or run Git commands.
 */

import type * as vscodeTypes from "vscode";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Shared mocks are hoisted because Vitest moves vi.mock() calls
 * above ordinary variable declarations.
 */
const mocks = vi.hoisted(() => ({
  activeTextEditor: undefined as
    | {
        document: {
          uri: unknown;
        };
      }
    | undefined,

  textDocuments: [] as Array<{
    uri: {
      fsPath: string;
    };
    isDirty: boolean;
  }>,

  stat: vi.fn(),
  getFileDiff: vi.fn(),
  writeText: vi.fn(),

  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
}));

/**
 * Provides the minimum VS Code API required by copyFileDiffCommand.ts.
 */
vi.mock("vscode", () => ({
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },

  window: {
    get activeTextEditor() {
      return mocks.activeTextEditor;
    },

    showInformationMessage: mocks.showInformationMessage,
    showWarningMessage: mocks.showWarningMessage,
    showErrorMessage: mocks.showErrorMessage,
  },

  workspace: {
    get textDocuments() {
      return mocks.textDocuments;
    },

    fs: {
      stat: mocks.stat,
    },
  },

  env: {
    clipboard: {
      writeText: mocks.writeText,
    },
  },
}));

/**
 * Prevents the command tests from running real Git commands.
 */
vi.mock("@vscode/copyForAI/getFileDiff", () => ({
  getFileDiff: mocks.getFileDiff,
}));

import { executeCopyFileDiffCommand } from "@vscode/copyForAI/copyFileDiffCommand";

/**
 * Creates the minimum URI object required by the command tests.
 */
function createUri(filePath: string, scheme = "file"): vscodeTypes.Uri {
  return {
    fsPath: filePath,
    scheme,
  } as vscodeTypes.Uri;
}

/**
 * Adds an open document to the mocked VS Code workspace.
 */
function addOpenDocument(uri: vscodeTypes.Uri, isDirty: boolean): void {
  mocks.textDocuments.push({
    uri: {
      fsPath: uri.fsPath,
    },
    isDirty,
  });
}

describe("executeCopyFileDiffCommand()", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.activeTextEditor = undefined;
    mocks.textDocuments.length = 0;

    /**
     * The selected resource is treated as a normal file by default.
     */
    mocks.stat.mockResolvedValue({
      type: 1,
      ctime: 0,
      mtime: 0,
      size: 100,
    });

    /**
     * A real diff is returned by default unless a test overrides it.
     */
    mocks.getFileDiff.mockResolvedValue({
      kind: "diff",
      diff: [
        "diff --git a/src/Button.tsx b/src/Button.tsx",
        "--- a/src/Button.tsx",
        "+++ b/src/Button.tsx",
        "@@ -1 +1 @@",
        "-export const value = 1;",
        "+export const value = 2;",
        "",
      ].join("\n"),
      repositoryRoot: "/Users/leo/Projects/czaza",
      relativePath: "src/Button.tsx",
    });

    mocks.writeText.mockResolvedValue(undefined);
  });

  it("copies a selected file diff to the clipboard", async () => {
    const uri = createUri("/Users/leo/Projects/czaza/src/Button.tsx");

    await executeCopyFileDiffCommand(uri);

    expect(mocks.stat).toHaveBeenCalledWith(uri);

    expect(mocks.getFileDiff).toHaveBeenCalledWith(uri.fsPath);

    expect(mocks.writeText).toHaveBeenCalledTimes(1);

    expect(mocks.writeText).toHaveBeenCalledWith(
      expect.stringContaining("diff --git a/src/Button.tsx b/src/Button.tsx"),
    );

    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      "CZaza: Copied all changes in Button.tsx since HEAD.",
    );

    console.info("✅ Copy File Diff: copied the selected file's diff to the clipboard.");
  });

  it("uses the active editor file when no URI is supplied", async () => {
    const activeEditorUri = createUri("/Users/leo/Projects/czaza/src/Sidebar.tsx");

    mocks.activeTextEditor = {
      document: {
        uri: activeEditorUri,
      },
    };

    await executeCopyFileDiffCommand();

    expect(mocks.stat).toHaveBeenCalledWith(activeEditorUri);

    expect(mocks.getFileDiff).toHaveBeenCalledWith(activeEditorUri.fsPath);

    expect(mocks.writeText).toHaveBeenCalledTimes(1);

    console.info("✅ Copy File Diff: used the active editor when no menu URI was supplied.");
  });

  it("does not copy an unsaved editor document", async () => {
    const uri = createUri("/Users/leo/Projects/czaza/src/Button.tsx");

    addOpenDocument(uri, true);

    await executeCopyFileDiffCommand(uri);

    expect(mocks.getFileDiff).not.toHaveBeenCalled();
    expect(mocks.writeText).not.toHaveBeenCalled();

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      "CZaza: Save Button.tsx before copying its Git diff.",
    );

    console.info("✅ Copy File Diff: rejected a file with unsaved editor changes.");
  });

  it("allows an open document that has already been saved", async () => {
    const uri = createUri("/Users/leo/Projects/czaza/src/Button.tsx");

    addOpenDocument(uri, false);

    await executeCopyFileDiffCommand(uri);

    expect(mocks.getFileDiff).toHaveBeenCalledWith(uri.fsPath);

    expect(mocks.writeText).toHaveBeenCalledTimes(1);

    console.info("✅ Copy File Diff: accepted an open document with no unsaved changes.");
  });

  it("shows a warning when no file is available", async () => {
    await executeCopyFileDiffCommand();

    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.getFileDiff).not.toHaveBeenCalled();
    expect(mocks.writeText).not.toHaveBeenCalled();

    expect(mocks.showWarningMessage).toHaveBeenCalledWith("CZaza: No file is currently selected.");

    console.info("✅ Copy File Diff: handled the missing-file case correctly.");
  });

  it("rejects a non-local VS Code resource", async () => {
    const uri = createUri("/workspace/src/Button.tsx", "vscode-remote");

    await executeCopyFileDiffCommand(uri);

    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.getFileDiff).not.toHaveBeenCalled();
    expect(mocks.writeText).not.toHaveBeenCalled();

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      "CZaza: Only local files can currently be compared.",
    );

    console.info("✅ Copy File Diff: rejected a non-local VS Code resource.");
  });

  it("rejects a folder instead of treating it as a file", async () => {
    const uri = createUri("/Users/leo/Projects/czaza/src/components");

    mocks.stat.mockResolvedValue({
      type: 2,
      ctime: 0,
      mtime: 0,
      size: 0,
    });

    await executeCopyFileDiffCommand(uri);

    expect(mocks.getFileDiff).not.toHaveBeenCalled();
    expect(mocks.writeText).not.toHaveBeenCalled();

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      "CZaza: Please select a file rather than a folder.",
    );

    console.info("✅ Copy File Diff: rejected a folder correctly.");
  });

  it("does not overwrite the clipboard outside a Git repository", async () => {
    const uri = createUri("/Users/leo/Desktop/Button.tsx");

    mocks.getFileDiff.mockResolvedValue({
      kind: "notGitRepository",
    });

    await executeCopyFileDiffCommand(uri);

    expect(mocks.writeText).not.toHaveBeenCalled();

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      "CZaza: Button.tsx is not inside a Git repository.",
    );

    console.info("✅ Copy File Diff: preserved the clipboard for a non-Git file.");
  });

  it("handles a repository without a HEAD commit", async () => {
    const uri = createUri("/Users/leo/Projects/new-project/Button.tsx");

    mocks.getFileDiff.mockResolvedValue({
      kind: "noHead",
      repositoryRoot: "/Users/leo/Projects/new-project",
      relativePath: "Button.tsx",
    });

    await executeCopyFileDiffCommand(uri);

    expect(mocks.writeText).not.toHaveBeenCalled();

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      "CZaza: Cannot copy a diff because this repository has no HEAD commit yet.",
    );

    console.info("✅ Copy File Diff: handled a repository without its first commit.");
  });

  it("handles an untracked file without overwriting the clipboard", async () => {
    const uri = createUri("/Users/leo/Projects/czaza/src/NewFile.tsx");

    mocks.getFileDiff.mockResolvedValue({
      kind: "untracked",
      repositoryRoot: "/Users/leo/Projects/czaza",
      relativePath: "src/NewFile.tsx",
    });

    await executeCopyFileDiffCommand(uri);

    expect(mocks.writeText).not.toHaveBeenCalled();

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      "CZaza: NewFile.tsx is untracked. Use Copy File instead.",
    );

    console.info("✅ Copy File Diff: handled an untracked file without clearing the clipboard.");
  });

  it("does not overwrite the clipboard when the file has no changes", async () => {
    const uri = createUri("/Users/leo/Projects/czaza/src/Button.tsx");

    mocks.getFileDiff.mockResolvedValue({
      kind: "noChanges",
      repositoryRoot: "/Users/leo/Projects/czaza",
      relativePath: "src/Button.tsx",
    });

    await executeCopyFileDiffCommand(uri);

    expect(mocks.writeText).not.toHaveBeenCalled();

    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      "CZaza: No changes found for Button.tsx compared with HEAD.",
    );

    console.info("✅ Copy File Diff: preserved the clipboard when the file had no changes.");
  });

  it("shows an error when retrieving the Git diff fails", async () => {
    const uri = createUri("/Users/leo/Projects/czaza/src/Button.tsx");

    mocks.getFileDiff.mockRejectedValue(new Error("Git command failed"));

    await executeCopyFileDiffCommand(uri);

    expect(mocks.writeText).not.toHaveBeenCalled();

    expect(mocks.showErrorMessage).toHaveBeenCalledWith(
      "CZaza: Failed to copy the file diff. Git command failed",
    );

    console.info("✅ Copy File Diff: converted a Git failure into a VS Code error message.");
  });

  it("shows an error when writing to the clipboard fails", async () => {
    const uri = createUri("/Users/leo/Projects/czaza/src/Button.tsx");

    mocks.writeText.mockRejectedValue(new Error("Clipboard unavailable"));

    await executeCopyFileDiffCommand(uri);

    expect(mocks.getFileDiff).toHaveBeenCalledTimes(1);

    expect(mocks.showErrorMessage).toHaveBeenCalledWith(
      "CZaza: Failed to copy the file diff. Clipboard unavailable",
    );

    console.info("✅ Copy File Diff: converted a clipboard failure into a VS Code error message.");
  });
});
