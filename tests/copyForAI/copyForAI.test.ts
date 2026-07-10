/**
 * Tests the Copy for AI feature, including:
 *
 * - Copying a local file to the macOS clipboard.
 * - Executing the VS Code Copy File command.
 * - Handling invalid files and unsupported environments.
 * - Registering the Copy File command with VS Code.
 *
 * System commands and VS Code APIs are mocked so these tests do not
 * modify the real clipboard or require a VS Code Extension Host.
 */

import type * as vscodeTypes from "vscode";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Shared mocks must be created with vi.hoisted because vi.mock calls
 * are moved above normal variable declarations by Vitest.
 */
const mocks = vi.hoisted(() => ({
  activeTextEditor: undefined as
    | {
        document: {
          uri: unknown;
        };
      }
    | undefined,

  execFile: vi.fn(),
  stat: vi.fn(),
  registerCommand: vi.fn(),

  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
}));

/**
 * Prevents the tests from running the real macOS `osascript` command.
 */
vi.mock("node:child_process", () => ({
  execFile: mocks.execFile,
}));

/**
 * Provides the minimum VS Code API surface required by the Copy for AI
 * implementation.
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
    fs: {
      stat: mocks.stat,
    },
  },

  commands: {
    registerCommand: mocks.registerCommand,
  },
}));

import { executeCopyFileCommand } from "@vscode/copyForAI/copyFileCommand";
import { copyFileToClipboard } from "@vscode/copyForAI/copyFileToClipboard";
import { registerCopyForAICommands } from "@vscode/copyForAI/registerCopyForAICommands";
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
 * Makes process.platform report macOS during a test.
 */
function mockMacOS(): void {
  vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
}

describe("Copy for AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.activeTextEditor = undefined;

    /**
     * Simulates a successful child_process.execFile call.
     *
     * promisify(execFile) expects the final argument to be a callback.
     */
    mocks.execFile.mockImplementation(
      (
        _command: string,
        _args: string[],
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, "", "");
      },
    );

    /**
     * Files are returned by default unless a test explicitly changes
     * the mocked stat result.
     */
    mocks.stat.mockResolvedValue({
      type: 1,
      ctime: 0,
      mtime: 0,
      size: 100,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("copyFileToClipboard()", () => {
    it("passes the file path safely to macOS osascript", async () => {
      const filePath = "/Users/gene/My Project/Button's styles.tsx";

      await copyFileToClipboard(filePath);

      expect(mocks.execFile).toHaveBeenCalledTimes(1);

      const [command, args] = mocks.execFile.mock.calls[0] as [string, string[]];

      expect(command).toBe("osascript");
      expect(args[0]).toBe("-e");
      expect(args[1]).toContain("set the clipboard to POSIX file");
      expect(args[2]).toBe(filePath);

      console.info("✅ copyFileToClipboard: passed the complete file path to osascript safely.");
    });
  });

  describe("executeCopyFileCommand()", () => {
    it("copies a selected local file and shows a success message", async () => {
      mockMacOS();

      const uri = createUri("/Users/gene/project/src/Button.tsx");

      await executeCopyFileCommand(uri);

      expect(mocks.stat).toHaveBeenCalledWith(uri);
      expect(mocks.execFile).toHaveBeenCalledTimes(1);

      expect(mocks.showInformationMessage).toHaveBeenCalledWith("Copied Button.tsx as a file.");

      console.info("✅ Copy File command: copied an Explorer or editor file successfully.");
    });

    it("uses the active editor file when no URI is supplied", async () => {
      mockMacOS();

      const activeEditorUri = createUri("/Users/gene/project/src/Sidebar.tsx");

      mocks.activeTextEditor = {
        document: {
          uri: activeEditorUri,
        },
      };

      await executeCopyFileCommand();

      expect(mocks.stat).toHaveBeenCalledWith(activeEditorUri);

      expect(mocks.showInformationMessage).toHaveBeenCalledWith("Copied Sidebar.tsx as a file.");

      console.info(
        "✅ Copy File command: used the active editor file when no menu URI was provided.",
      );
    });

    it("rejects folders instead of copying them", async () => {
      mockMacOS();

      const folderUri = createUri("/Users/gene/project/src/components");

      mocks.stat.mockResolvedValue({
        type: 2,
        ctime: 0,
        mtime: 0,
        size: 0,
      });

      await executeCopyFileCommand(folderUri);

      expect(mocks.execFile).not.toHaveBeenCalled();

      expect(mocks.showWarningMessage).toHaveBeenCalledWith(
        "CZaza: Please select a file rather than a folder.",
      );

      console.info("✅ Copy File command: rejected a folder correctly.");
    });

    it("rejects non-local resources", async () => {
      mockMacOS();

      const remoteUri = createUri("/workspace/src/Button.tsx", "vscode-remote");

      await executeCopyFileCommand(remoteUri);

      expect(mocks.stat).not.toHaveBeenCalled();
      expect(mocks.execFile).not.toHaveBeenCalled();

      expect(mocks.showWarningMessage).toHaveBeenCalledWith(
        "CZaza: Only local files can currently be copied.",
      );

      console.info("✅ Copy File command: rejected a non-local VS Code resource.");
    });

    it("shows a warning when no file is available", async () => {
      mockMacOS();

      mocks.activeTextEditor = undefined;

      await executeCopyFileCommand();

      expect(mocks.stat).not.toHaveBeenCalled();
      expect(mocks.execFile).not.toHaveBeenCalled();

      expect(mocks.showWarningMessage).toHaveBeenCalledWith(
        "CZaza: No file is currently selected.",
      );

      console.info("✅ Copy File command: handled the missing-file case correctly.");
    });

    it("shows a warning on unsupported operating systems", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("win32");

      const uri = createUri("C:\\project\\src\\Button.tsx");

      await executeCopyFileCommand(uri);

      expect(mocks.stat).not.toHaveBeenCalled();
      expect(mocks.execFile).not.toHaveBeenCalled();

      expect(mocks.showWarningMessage).toHaveBeenCalledWith(
        "CZaza: Copy File currently supports macOS only.",
      );

      console.info("✅ Copy File command: rejected an unsupported operating system.");
    });

    it("shows an error when osascript fails", async () => {
      mockMacOS();

      mocks.execFile.mockImplementation(
        (
          _command: string,
          _args: string[],
          callback: (error: Error | null, stdout: string, stderr: string) => void,
        ) => {
          callback(new Error("osascript failed"), "", "");
        },
      );

      const uri = createUri("/Users/gene/project/src/Button.tsx");

      await executeCopyFileCommand(uri);

      expect(mocks.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("osascript failed"),
      );

      console.info(
        "✅ Copy File command: converted an osascript failure into a VS Code error message.",
      );
    });
  });

  describe("registerCopyForAICommands()", () => {
    it("registers the Copy File command and stores its disposable", () => {
      const copyFileDisposable = {
        dispose: vi.fn(),
      };

      const copyFileDiffDisposable = {
        dispose: vi.fn(),
      };

      mocks.registerCommand
        .mockReturnValueOnce(copyFileDisposable)
        .mockReturnValueOnce(copyFileDiffDisposable);

      const context = {
        subscriptions: [],
      } as unknown as vscodeTypes.ExtensionContext;

      registerCopyForAICommands(context);

      expect(mocks.registerCommand).toHaveBeenCalledTimes(2);

      expect(mocks.registerCommand).toHaveBeenCalledWith(
        "czaza.copyForAI.copyFile",
        executeCopyFileCommand,
      );

      expect(mocks.registerCommand).toHaveBeenCalledWith(
        "czaza.copyForAI.copyFileDiff",
        executeCopyFileDiffCommand,
      );

      expect(context.subscriptions).toContain(copyFileDisposable);
      expect(context.subscriptions).toContain(copyFileDiffDisposable);

      console.info(
        "✅ Command registration: registered czaza.copyForAI.copyFile and added its disposable.",
      );
    });
  });
});
