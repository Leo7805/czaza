/**
 * Unit tests for reading file and directory note previews.
 */

import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type * as vscodeTypes from "vscode";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";

import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
  configuredRootDirectory: "",
  outputDirectory: ".caca",
  stat: vi.fn(),
  readDirectory: vi.fn(),
  cannotOpenText: false,
}));

vi.mock("vscode", () => ({
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },

  Uri: {
    file: (fsPath: string) => ({
      scheme: "file",
      fsPath,
      path: fsPath,
      toString: () => `file://${fsPath}`,
    }),
  },

  workspace: {
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },

    fs: {
      stat: mocks.stat,
      readDirectory: mocks.readDirectory,
    },

    openTextDocument: vi.fn().mockImplementation(async (uri: vscodeTypes.Uri) => {
      if (mocks.cannotOpenText) {
        throw new Error("File seems to be binary and cannot be opened as text");
      }

      return { uri, languageId: "typescript", getText: () => "" };
    }),

    getConfiguration: () => ({
      get: <T>(key: string, defaultValue: T): T => {
        if (key === "rootDirectory") {
          return mocks.configuredRootDirectory as T;
        }

        if (key === "outputDirectory") {
          return mocks.outputDirectory as T;
        }

        return defaultValue;
      },
    }),

    getWorkspaceFolder: (uri: vscodeTypes.Uri) =>
      mocks.workspaceFolders.find((folder) => {
        const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
        return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
      }),
  },
}));

import { getResourceNotes } from "@vscode/services/getResourceNotesService";

const createdAt = "2026-01-01T00:00:00.000Z";
const randomId = "abcdef123456";

describe("getResourceNotes()", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.workspaceFolders.length = 0;
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".caca";
    mocks.cannotOpenText = false;

    mocks.stat.mockImplementation((uri: vscodeTypes.Uri) => ({
      type: uri.fsPath.endsWith(".ts") || uri.fsPath.endsWith(".png") ? 1 : 2,
      size: 4096,
      mtime: 2,
      ctime: 1,
    }));
    mocks.readDirectory.mockResolvedValue([]);
  });

  it("returns complete user and AI file note content", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const relativeFilePath = "src/index.ts";
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    await saveSourceFile(notes, workspaceRoot, relativeFilePath, {
      userNote: "User note first line.\nSecond line preserved.",
      aiSummary: "AI summary should not win.",
    });

    const result = await getResourceNotes({
      uri: createUri(path.join(workspaceRoot, relativeFilePath)),
      notes,
    });

    expect(result).toEqual({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      projectRootName: path.basename(workspaceRoot),
      fileNote: {
        userNote: "User note first line.\nSecond line preserved.",
        aiExplanation: {
          summary: "AI summary should not win.",
          detail: "",
          aiNotes: [],
        },
        status: {
          content: "current",
          anchor: "confirmed",
        },
      },
      aiAction: "regenerate",
      sectionNotes: [],
    });
  });

  it("returns a binary payload without text-only note capabilities", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const relativeFilePath = "assets/image.png";
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.cannotOpenText = true;
    await saveSourceFile(notes, workspaceRoot, relativeFilePath, { userNote: "Image asset." });

    const result = await getResourceNotes({
      uri: createUri(path.join(workspaceRoot, relativeFilePath)),
      notes,
    });

    expect(result).toEqual({
      kind: "binary",
      name: "image.png",
      relativePath: relativeFilePath,
      projectRootName: path.basename(workspaceRoot),
      fileNote: expect.objectContaining({ userNote: "Image asset." }),
    });
  });

  it("returns a file without fileNote when the file has no file note content", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const relativeFilePath = "src/empty.ts";
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    await notes.cache.saveSourceFile(
      workspaceRoot,
      mocks.outputDirectory,
      relativeFilePath,
      createStoredSourceFile(),
      createdAt,
    );

    const result = await getResourceNotes({
      uri: createUri(path.join(workspaceRoot, relativeFilePath)),
      notes,
    });

    expect(result).toEqual({
      kind: "file",
      name: "empty.ts",
      relativePath: "src/empty.ts",
      projectRootName: path.basename(workspaceRoot),
      aiAction: "generate",
      sectionNotes: [],
    });
  });

  it("ignores line AI notes when choosing the file and section generation action", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const relativeFilePath = "src/line-only.ts";
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));
    const sourceFile = createStoredSourceFile();

    sourceFile.lineNotes = [createLineNote("line:1", 1, undefined, "Line AI summary.")];
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    await notes.cache.saveSourceFile(
      workspaceRoot,
      mocks.outputDirectory,
      relativeFilePath,
      sourceFile,
      createdAt,
    );

    const result = await getResourceNotes({
      uri: createUri(path.join(workspaceRoot, relativeFilePath)),
      notes,
      activeLine: 1,
    });

    expect(result).toMatchObject({
      kind: "file",
      aiAction: "generate",
      activeLine: 1,
    });
  });

  it("selects distinct section ranges and the first line note for the active line", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const relativeFilePath = "src/overlap.ts";
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));
    const sourceFile = createStoredSourceFile();

    sourceFile.sectionNotes = [
      createSectionNote("outer", "Outer", 1, 20),
      createSectionNote("duplicate", "Duplicate range", 1, 20),
      createSectionNote("first-same-start", "First same start", 5, 10),
      createSectionNote("second-same-start", "Second same start", 5, 12),
    ];
    sourceFile.lineNotes = [
      createLineNote("line:first", 7, "First line note."),
      createLineNote("line:duplicate", 7, "Duplicate line note."),
    ];

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    await notes.cache.saveSourceFile(
      workspaceRoot,
      mocks.outputDirectory,
      relativeFilePath,
      sourceFile,
      createdAt,
    );

    const result = await getResourceNotes({
      uri: createUri(path.join(workspaceRoot, relativeFilePath)),
      notes,
      activeLine: 7,
    });

    expect(result).toEqual({
      kind: "file",
      name: "overlap.ts",
      relativePath: "src/overlap.ts",
      projectRootName: path.basename(workspaceRoot),
      aiAction: "regenerate",
      activeLine: 7,
      sectionNotes: [
        {
          id: "outer",
          title: "Outer",
          startLine: 1,
          endLine: 20,
          aiExplanation: {
            summary: "Outer AI summary.",
            detail: "",
          },
          status: {
            content: "current",
            anchor: "confirmed",
          },
        },
        {
          id: "first-same-start",
          title: "First same start",
          startLine: 5,
          endLine: 10,
          aiExplanation: {
            summary: "First same start AI summary.",
            detail: "",
          },
          status: {
            content: "current",
            anchor: "confirmed",
          },
        },
        {
          id: "second-same-start",
          title: "Second same start",
          startLine: 5,
          endLine: 12,
          aiExplanation: {
            summary: "Second same start AI summary.",
            detail: "",
          },
          status: {
            content: "current",
            anchor: "confirmed",
          },
        },
      ],
      lineNote: {
        id: "line:first",
        line: 7,
        userNote: "First line note.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
      },
    });
  });

  it("returns directory notes and first-level child note previews", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const directoryPath = path.join(workspaceRoot, "src");
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));

    await mkdir(directoryPath, { recursive: true });
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.stat.mockImplementation((uri: vscodeTypes.Uri) => ({
      type: uri.fsPath.endsWith(".ts") ? 1 : 2,
    }));
    mocks.readDirectory.mockResolvedValue([
      ["Button.ts", 1],
      ["forms", 2],
      ["NoNotes.ts", 1],
    ]);

    await saveSourceFile(notes, workspaceRoot, "src", {
      userNote: "Directory user note.\nSecond directory note line.",
    });
    await saveSourceFile(notes, workspaceRoot, "src/Button.ts", {
      aiSummary: "Button summary.\nSecond line ignored.",
    });
    await saveSourceFile(notes, workspaceRoot, "src/forms", {
      aiNotes: ["Forms AI note first line.\nSecond line ignored."],
    });
    await notes.cache.saveSourceFile(
      workspaceRoot,
      mocks.outputDirectory,
      "src/NoNotes.ts",
      createStoredSourceFile(),
      createdAt,
    );

    const result = await getResourceNotes({
      uri: createUri(directoryPath),
      notes,
    });

    expect(result).toEqual({
      kind: "directory",
      name: "src",
      relativePath: "src",
      projectRootName: path.basename(workspaceRoot),
      fileNote: {
        userNote: "Directory user note.\nSecond directory note line.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
      },
      children: [
        {
          kind: "file",
          name: "Button.ts",
          relativePath: "src/Button.ts",
          notePreview: "Button summary.",
        },
        {
          kind: "directory",
          name: "forms",
          relativePath: "src/forms",
          notePreview: "Forms AI note first line.",
        },
      ],
    });
  });

  it("does not include notes from nested files when the first-level child has no note", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const directoryPath = path.join(workspaceRoot, "src");
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));

    await mkdir(directoryPath, { recursive: true });
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.readDirectory.mockResolvedValue([["nested", 2]]);
    await saveSourceFile(notes, workspaceRoot, "src/nested/Deep.ts", {
      userNote: "Nested note should not appear.",
    });

    const result = await getResourceNotes({
      uri: createUri(directoryPath),
      notes,
    });

    expect(result).toEqual({
      kind: "directory",
      name: "src",
      relativePath: "src",
      projectRootName: path.basename(workspaceRoot),
      children: [],
    });
  });

  it("returns outsideRoot for resources outside the configured CZaza root", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const configuredRoot = path.join(workspaceRoot, "packages", "app");
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));

    await mkdir(configuredRoot, { recursive: true });
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.configuredRootDirectory = "packages/app";

    const result = await getResourceNotes({
      uri: createUri(path.join(workspaceRoot, "src", "outside.ts")),
      notes,
    });

    expect(result).toEqual({ kind: "outsideRoot" });
  });
});

/**
 * Saves a source file fixture with an optional file note.
 *
 * @param notes - Note store used to write the fixture.
 * @param workspaceRoot - Absolute workspace root path.
 * @param relativeFilePath - Root-relative source path.
 * @param fileNote - Optional file note content.
 * @returns Promise that resolves after saving.
 *
 * @example
 * await saveSourceFile(notes, root, "src/index.ts", { userNote: "Important." });
 */
async function saveSourceFile(
  notes: WorkspaceNoteStore,
  workspaceRoot: string,
  relativeFilePath: string,
  fileNote: {
    userNote?: string;
    aiSummary?: string;
    aiNotes?: string[];
  },
): Promise<void> {
  await notes.cache.saveSourceFile(
    workspaceRoot,
    mocks.outputDirectory,
    relativeFilePath,
    createStoredSourceFile(fileNote),
    createdAt,
  );
}

/**
 * Creates a temporary workspace root for service tests.
 *
 * @returns Temporary workspace root path.
 *
 * @example
 * const root = await createTempWorkspaceRoot();
 */
async function createTempWorkspaceRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "czaza-resource-notes-"));
}

/**
 * Creates a mock VS Code workspace folder.
 *
 * @param workspaceRoot - Absolute workspace root path.
 * @returns Mock workspace folder.
 *
 * @example
 * const folder = createWorkspaceFolder("/workspace/project");
 */
function createWorkspaceFolder(workspaceRoot: string): MockWorkspaceFolder {
  return {
    uri: createUri(workspaceRoot),
    name: path.basename(workspaceRoot),
    index: mocks.workspaceFolders.length,
  };
}

/**
 * Creates the minimum URI shape required by the service tests.
 *
 * @param fsPath - Local file-system path represented by the URI.
 * @returns Mock VS Code file URI.
 *
 * @example
 * const uri = createUri("/workspace/project/src/index.ts");
 */
function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    path: fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}

/**
 * Creates a stored source file fixture.
 *
 * @param fileNote - Optional file note content.
 * @returns Stored source file fixture.
 *
 * @example
 * const sourceFile = createStoredSourceFile({ userNote: "Important." });
 */
function createStoredSourceFile(fileNote?: {
  userNote?: string;
  aiSummary?: string;
  aiNotes?: string[];
}): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:source",
      programmingLanguage: "typescript",
    },
    ...(fileNote
      ? {
          fileNote: {
            id: "file",
            userNote: fileNote.userNote,
            aiExplanation:
              fileNote.aiSummary || fileNote.aiNotes
                ? {
                    summary: fileNote.aiSummary ?? "",
                    detail: "",
                    aiNotes: fileNote.aiNotes ?? [],
                  }
                : undefined,
            status: {
              content: "current",
              anchor: "confirmed",
            },
            createdBy: "ai" as const,
            createdAt,
            updatedAt: createdAt,
          },
        }
      : {}),
    sectionNotes: [],
    lineNotes: [],
  };
}

/**
 * Creates a stored section note fixture.
 *
 * @param id - Stable section identifier.
 * @param title - Section title and AI summary prefix.
 * @param startLine - One-based section start line.
 * @param endLine - One-based section end line.
 * @returns Stored section note fixture.
 */
function createSectionNote(id: string, title: string, startLine: number, endLine: number) {
  return {
    id,
    title,
    range: { startLine, endLine },
    anchorHash: `sha256:${id}`,
    aiExplanation: {
      summary: `${title} AI summary.`,
      detail: "",
    },
    status: {
      content: "current" as const,
      anchor: "confirmed" as const,
    },
    createdBy: "ai" as const,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Creates a stored line note fixture.
 *
 * @param id - Stable line note identifier.
 * @param line - One-based source line.
 * @param userNote - Optional user note content.
 * @param aiSummary - Optional AI summary content.
 * @returns Stored line note fixture.
 */
function createLineNote(id: string, line: number, userNote?: string, aiSummary?: string) {
  return {
    id,
    line,
    anchorText: `line ${line}`,
    ...(userNote ? { userNote } : {}),
    ...(aiSummary
      ? { aiExplanation: { summary: aiSummary, detail: `${aiSummary} detail.` } }
      : {}),
    status: {
      content: "current" as const,
      anchor: "confirmed" as const,
    },
    createdBy: "user" as const,
    createdAt,
    updatedAt: createdAt,
  };
}
