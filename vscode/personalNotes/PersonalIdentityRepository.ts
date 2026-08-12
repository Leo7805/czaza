/**
 * Persists the Personal Notes identity index and initializes member Note Stores.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  isPersonalIdentityIndexV1,
  type PersonalIdentityIndexV1,
} from "@shared/models/store/personalIdentity";
import type { WorkspaceNoteIndexV2 } from "@shared/models/store/workspace";

const PERSONAL_NOTES_DIRECTORY = "personal-notes";
const INDEX_FILE_NAME = "index.json";

/** Reads and writes project-level Personal Notes identity data. */
export class PersonalIdentityRepository {
  /**
   * Reads the identity index.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @returns Valid index, or null when it has not been created.
   */
  async loadIndex(
    workspaceRoot: string,
    outputDirectory: string,
  ): Promise<PersonalIdentityIndexV1 | null> {
    const indexPath = getPersonalIdentityIndexPath(workspaceRoot, outputDirectory);

    try {
      const parsed = JSON.parse(await readFile(indexPath, "utf-8")) as unknown;
      if (!isPersonalIdentityIndexV1(parsed)) {
        throw new Error("Personal Notes identity index has an invalid shape.");
      }
      return parsed;
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Atomically replaces the identity index.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param index - Complete next identity index.
   * @returns Promise resolved after replacement.
   */
  async saveIndex(
    workspaceRoot: string,
    outputDirectory: string,
    index: PersonalIdentityIndexV1,
  ): Promise<void> {
    const indexPath = getPersonalIdentityIndexPath(workspaceRoot, outputDirectory);
    await mkdir(path.dirname(indexPath), { recursive: true });
    await writeJsonAtomic(indexPath, index);
  }

  /**
   * Initializes a standard empty Note Store for one member without overwriting data.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param memberId - Stable member directory ID.
   * @param now - ISO timestamp for the empty Store.
   * @returns Promise resolved after Store creation.
   */
  async createMemberStore(
    workspaceRoot: string,
    outputDirectory: string,
    memberId: string,
    now: string,
  ): Promise<void> {
    const storeDirectory = getPersonalMemberStorePath(workspaceRoot, outputDirectory, memberId);
    if (await pathExists(storeDirectory)) {
      throw new Error(`Personal Notes Store already exists: ${memberId}`);
    }

    const index: WorkspaceNoteIndexV2 = {
      schemaVersion: 2,
      updatedAt: now,
      workspaceRoot: normalizePath(path.resolve(workspaceRoot)),
      files: {},
    };

    await mkdir(path.dirname(storeDirectory), { recursive: true });
    await mkdir(storeDirectory, { recursive: false });
    await writeJsonAtomic(path.join(storeDirectory, INDEX_FILE_NAME), index);
  }

  /**
   * Reports whether a member Store directory exists.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param memberId - Stable member directory ID.
   * @returns True when the directory exists.
   */
  async memberStoreExists(
    workspaceRoot: string,
    outputDirectory: string,
    memberId: string,
  ): Promise<boolean> {
    return pathExists(getPersonalMemberStorePath(workspaceRoot, outputDirectory, memberId));
  }
}

/**
 * Resolves the root Personal Notes identity index path.
 *
 * @param workspaceRoot - Absolute CZaza project root.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @returns Absolute identity-index path.
 */
export function getPersonalIdentityIndexPath(
  workspaceRoot: string,
  outputDirectory: string,
): string {
  return path.join(workspaceRoot, outputDirectory, PERSONAL_NOTES_DIRECTORY, INDEX_FILE_NAME);
}

/**
 * Resolves one member's Personal Note Store directory.
 *
 * @param workspaceRoot - Absolute CZaza project root.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param memberId - Stable member directory ID.
 * @returns Absolute member Store directory.
 */
export function getPersonalMemberStorePath(
  workspaceRoot: string,
  outputDirectory: string,
  memberId: string,
): string {
  return path.join(workspaceRoot, outputDirectory, PERSONAL_NOTES_DIRECTORY, memberId);
}

/** Atomically writes formatted JSON. */
async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    await rename(temporaryPath, filePath);
  } catch (error) {
    try { await unlink(temporaryPath); } catch { /* No temporary file to clean up. */ }
    throw error;
  }
}

/** Reports whether a filesystem path exists. */
async function pathExists(targetPath: string): Promise<boolean> {
  try { await stat(targetPath); return true; } catch { return false; }
}

/** Reports whether an error is a missing-file error. */
function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Converts persisted paths to forward slashes. */
function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
