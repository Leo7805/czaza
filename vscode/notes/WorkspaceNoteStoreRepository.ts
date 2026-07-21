/**
 * Reads and writes the new workspace note index and per-file note JSON files.
 */

import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type { WorkspaceNoteFileIndexEntry, WorkspaceNoteIndexV1 } from "@shared/models/store/workspace";
import {
  decodeSourceFileDocument,
  encodeSourceFileDocument,
} from "@shared/services/sourceFileDocumentCodec";
import { createSourceHash } from "@shared/utils/hashUtils";

const NOTES_DIR_NAME = "notes";
const FILES_DIR_NAME = "files";
const INDEX_FILE_NAME = "index.json";
const PATH_HASH_PREFIX_LENGTH = 12;
const RANDOM_SUFFIX_LENGTH = 8;

/**
 * Creates the random id portion of a new note file name.
 *
 * @example
 * const randomId = createNoteFileRandomId();
 */
export type CreateNoteFileRandomId = () => string;

/**
 * Repository for the new workspace note index and per-file note files.
 *
 * This class only performs filesystem IO and JSON validation. It does not call
 * AI services, update UI state, or inspect VS Code documents.
 *
 * @example
 * const repository = new WorkspaceNoteStoreRepository();
 * const index = await repository.loadIndex("/workspace/project", ".czaza");
 */
export class WorkspaceNoteStoreRepository {
  private readonly createNoteFileRandomId: CreateNoteFileRandomId;

  /**
   * Creates a workspace note store repository.
   *
   * @param createNoteFileRandomId - Optional random id generator used for new note files.
   *
   * @example
   * const repository = new WorkspaceNoteStoreRepository(() => "fixedid1");
   */
  constructor(createNoteFileRandomId: CreateNoteFileRandomId = createDefaultNoteFileRandomId) {
    this.createNoteFileRandomId = createNoteFileRandomId;
  }

  /**
   * Reads the workspace note index from disk.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @returns Parsed index, or null when the file is missing or invalid.
   *
   * @example
   * const index = await repository.loadIndex("/workspace/project", ".czaza");
   */
  async loadIndex(
    workspaceRoot: string,
    outputDirectory: string,
  ): Promise<WorkspaceNoteIndexV1 | null> {
    try {
      const raw = await readFile(getWorkspaceNoteIndexPath(workspaceRoot, outputDirectory), "utf-8");
      const parsed = JSON.parse(raw) as unknown;

      return isWorkspaceNoteIndexV1(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Writes the workspace note index to disk.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param index - Workspace note index to persist.
   * @returns Promise that resolves after the index file is written.
   *
   * @example
   * await repository.saveIndex("/workspace/project", ".czaza", index);
   */
  async saveIndex(
    workspaceRoot: string,
    outputDirectory: string,
    index: WorkspaceNoteIndexV1,
  ): Promise<void> {
    const indexPath = getWorkspaceNoteIndexPath(workspaceRoot, outputDirectory);

    await mkdir(path.dirname(indexPath), { recursive: true });
    await writeJsonFile(indexPath, index);
  }

  /**
   * Reads one stored source-file entry by workspace-relative path.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @returns Stored source-file entry, or undefined when missing or invalid.
   *
   * @example
   * const file = await repository.getSourceFile("/workspace/project", ".czaza", "src/index.ts");
   */
  async getSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
  ): Promise<StoredSourceFile | undefined> {
    const entry = (await this.loadIndex(workspaceRoot, outputDirectory))?.files[relativeFilePath];

    if (!entry) {
      return undefined;
    }

    try {
      const raw = await readFile(
        getWorkspaceNoteFilePath(workspaceRoot, outputDirectory, entry.noteFile),
        "utf-8",
      );
      const parsed = JSON.parse(raw) as unknown;

      return decodeSourceFileDocument(parsed);
    } catch {
      return undefined;
    }
  }

  /**
   * Saves one stored source-file entry and updates the workspace note index.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sourceFile - Stored source-file entry to persist.
   * @param now - ISO 8601 timestamp used as the index updatedAt value.
   * @returns Promise that resolves after the note file and index are written.
   *
   * @example
   * await repository.saveSourceFile("/workspace/project", ".czaza", "src/index.ts", sourceFile, new Date().toISOString());
   */
  async saveSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceFile: StoredSourceFile,
    now: string,
  ): Promise<void> {
    const existing = await this.loadIndex(workspaceRoot, outputDirectory);
    const existingEntry = existing?.files[relativeFilePath];
    const noteFile = existingEntry?.noteFile ?? createWorkspaceNoteFileName(
      relativeFilePath,
      this.createNoteFileRandomId(),
    );
    const nextEntry = createFileIndexEntry(noteFile, sourceFile, now);
    const nextIndex: WorkspaceNoteIndexV1 = {
      schemaVersion: 1,
      updatedAt: now,
      workspaceRoot: normalizePath(path.resolve(workspaceRoot)),
      files: {
        ...(existing?.files ?? {}),
        [relativeFilePath]: nextEntry,
      },
    };

    await writeStoredSourceFile(workspaceRoot, outputDirectory, noteFile, sourceFile);
    await this.saveIndex(workspaceRoot, outputDirectory, nextIndex);
  }

  /**
   * Deletes one stored source-file note JSON.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param noteFile - Note file path relative to the notes directory.
   * @returns Promise that resolves after the note file is removed or found missing.
   */
  async deleteSourceFileNoteFile(
    workspaceRoot: string,
    outputDirectory: string,
    noteFile: string,
  ): Promise<void> {
    try {
      await unlink(getWorkspaceNoteFilePath(workspaceRoot, outputDirectory, noteFile));
    } catch {
      // Missing note JSON is acceptable when deleting an index entry.
    }
  }
}

/**
 * Returns the absolute path to the workspace note index file.
 *
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @returns Absolute index file path.
 *
 * @example
 * const indexPath = getWorkspaceNoteIndexPath("/workspace/project", ".czaza");
 */
export function getWorkspaceNoteIndexPath(workspaceRoot: string, outputDirectory: string): string {
  return path.join(workspaceRoot, outputDirectory, NOTES_DIR_NAME, INDEX_FILE_NAME);
}

/**
 * Returns the absolute path to a per-file note JSON.
 *
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param noteFile - Note file path relative to the notes directory.
 * @returns Absolute note file path.
 *
 * @example
 * const filePath = getWorkspaceNoteFilePath("/workspace/project", ".czaza", "files/abc123.json");
 */
export function getWorkspaceNoteFilePath(
  workspaceRoot: string,
  outputDirectory: string,
  noteFile: string,
): string {
  return path.join(workspaceRoot, outputDirectory, NOTES_DIR_NAME, ...noteFile.split("/"));
}

/**
 * Creates the per-file note path for a source file.
 *
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param randomId - Random id used to avoid collisions when source paths are reused.
 * @returns Note file path relative to the configured notes directory.
 *
 * @example
 * const noteFile = createWorkspaceNoteFileName("src/index.ts", "fixedid1");
 */
export function createWorkspaceNoteFileName(relativeFilePath: string, randomId: string): string {
  const pathHashPrefix = createSourceHash(normalizePath(relativeFilePath))
    .replace(/^sha256:/, "")
    .slice(0, PATH_HASH_PREFIX_LENGTH);
  const randomSuffix = sanitizeNoteFileRandomId(randomId).slice(0, RANDOM_SUFFIX_LENGTH);

  return `${FILES_DIR_NAME}/${pathHashPrefix}-${randomSuffix}.json`;
}

/**
 * Validates a parsed JSON value as a WorkspaceNoteIndexV1 object.
 *
 * @param value - Parsed JSON value.
 * @returns True when the value has the expected top-level index shape.
 *
 * @example
 * const valid = isWorkspaceNoteIndexV1({ schemaVersion: 1, updatedAt: "", files: {} });
 */
export function isWorkspaceNoteIndexV1(value: unknown): value is WorkspaceNoteIndexV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<WorkspaceNoteIndexV1>;

  return (
    record.schemaVersion === 1 &&
    typeof record.updatedAt === "string" &&
    isOptionalString(record.workspaceRoot) &&
    !!record.files &&
    typeof record.files === "object" &&
    !Array.isArray(record.files) &&
    Object.values(record.files).every(isWorkspaceNoteFileIndexEntry)
  );
}

/**
 * Creates an index entry for one stored source-file note JSON.
 *
 * @param noteFile - Note file path relative to the configured notes directory.
 * @param sourceFile - Stored source-file entry.
 * @param now - ISO 8601 timestamp used as the entry updatedAt value.
 * @returns File index entry.
 *
 * @example
 * const entry = createFileIndexEntry("files/abc123.json", sourceFile, "2026-07-13T00:00:00.000Z");
 */
function createFileIndexEntry(
  noteFile: string,
  sourceFile: StoredSourceFile,
  now: string,
): WorkspaceNoteFileIndexEntry {
  return {
    noteFile,
    sourceHash: sourceFile.source.sourceHash,
    ...(sourceFile.source.programmingLanguage
      ? { programmingLanguage: sourceFile.source.programmingLanguage }
      : {}),
    updatedAt: now,
  };
}

/**
 * Writes one stored source-file note JSON.
 *
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param noteFile - Note file path relative to the notes directory.
 * @param sourceFile - Stored source-file entry to write.
 * @returns Promise that resolves after the note file is written.
 *
 * @example
 * await writeStoredSourceFile("/workspace/project", ".czaza", "files/abc123.json", sourceFile);
 */
async function writeStoredSourceFile(
  workspaceRoot: string,
  outputDirectory: string,
  noteFile: string,
  sourceFile: StoredSourceFile,
): Promise<void> {
  const notePath = getWorkspaceNoteFilePath(workspaceRoot, outputDirectory, noteFile);

  await mkdir(path.dirname(notePath), { recursive: true });
  await writeJsonFile(notePath, encodeSourceFileDocument(sourceFile));
}

/**
 * Writes an object as formatted JSON with a trailing newline.
 *
 * @param filePath - Absolute path to write.
 * @param value - JSON-serializable value.
 * @returns Promise that resolves after the file is written.
 *
 * @example
 * await writeJsonFile("/tmp/example.json", { ok: true });
 */
async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

/**
 * Validates one workspace note file index entry.
 *
 * @param value - Parsed JSON value.
 * @returns True when the value has the expected file index entry shape.
 *
 * @example
 * const valid = isWorkspaceNoteFileIndexEntry({ noteFile: "files/a.json", sourceHash: "sha256:a", updatedAt: "" });
 */
function isWorkspaceNoteFileIndexEntry(value: unknown): value is WorkspaceNoteFileIndexEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<WorkspaceNoteFileIndexEntry>;

  return (
    typeof record.noteFile === "string" &&
    typeof record.sourceHash === "string" &&
    typeof record.updatedAt === "string" &&
    isOptionalString(record.programmingLanguage)
  );
}

/**
 * Normalizes a path to use forward slashes in persisted JSON.
 *
 * @param filePath - File path to normalize.
 * @returns Path with forward slashes.
 *
 * @example
 * const normalized = normalizePath("src\\index.ts");
 */
function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

/**
 * Creates a default random id for a new note file name.
 *
 * @returns Random id without UUID separators.
 *
 * @example
 * const id = createDefaultNoteFileRandomId();
 */
function createDefaultNoteFileRandomId(): string {
  return randomUUID().replace(/-/g, "");
}

/**
 * Keeps only filename-safe lowercase alphanumeric random id characters.
 *
 * @param randomId - Raw random id.
 * @returns Sanitized random id.
 *
 * @example
 * const id = sanitizeNoteFileRandomId("ABC-123");
 */
function sanitizeNoteFileRandomId(randomId: string): string {
  const sanitized = randomId.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (sanitized.length < RANDOM_SUFFIX_LENGTH) {
    throw new Error("Note file random id is too short.");
  }

  return sanitized;
}

/**
 * Checks whether a value is undefined or a string.
 *
 * @param value - Unknown value.
 * @returns True when the value is undefined or a string.
 *
 * @example
 * const valid = isOptionalString(undefined);
 */
function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}
