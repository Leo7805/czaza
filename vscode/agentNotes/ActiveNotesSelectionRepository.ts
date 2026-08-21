/**
 * Shares the Notes space currently displayed by VS Code with the standalone Agent Notes CLI.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { NoteStoreLocation } from "@vscode/notes";
import {
  isSupportedResponseLanguage,
  type AiResponseLanguage,
} from "@vscode/config/aiCatalog";

/** Local snapshot of the one Notes space currently displayed for a project. */
export type ActiveNotesSelection = {
  workspaceRoot: string;
  outputDirectory: string;
  location: NoteStoreLocation;
  responseLanguage: AiResponseLanguage;
  updatedAt: string;
};

/** Persists active Notes selection outside the project so it is never committed with Notes. */
export class ActiveNotesSelectionRepository {
  private readonly stateDirectory: string;

  /**
   * Creates the repository with an optional test-friendly state directory.
   *
   * @param stateDirectory - Directory that stores per-workspace selection snapshots.
   */
  constructor(stateDirectory = path.join(os.homedir(), ".czaza", "runtime", "active-notes")) {
    this.stateDirectory = stateDirectory;
  }

  /**
   * Atomically records the Notes space currently displayed by CZaza.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param location - Resolved Team or Personal Notes location.
   * @param responseLanguage - Validated language selected for AI-generated Notes.
   * @returns Promise resolved after the local snapshot is replaced.
   */
  async save(
    workspaceRoot: string,
    outputDirectory: string,
    location: NoteStoreLocation,
    responseLanguage: AiResponseLanguage = "en",
  ): Promise<void> {
    const selection: ActiveNotesSelection = {
      workspaceRoot: path.resolve(workspaceRoot),
      outputDirectory,
      location,
      responseLanguage,
      updatedAt: new Date().toISOString(),
    };
    const target = this.getPath(workspaceRoot);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(this.stateDirectory, { recursive: true });
    await writeFile(temporary, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }

  /**
   * Reads the current Notes selection for one project.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @returns Valid selection, or undefined when CZaza has not displayed Notes yet.
   */
  async load(workspaceRoot: string): Promise<ActiveNotesSelection | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.getPath(workspaceRoot), "utf8")) as unknown;
      if (!isActiveNotesSelection(parsed, workspaceRoot)) return undefined;
      const responseLanguage = parsed.responseLanguage ?? "";
      return {
        ...parsed,
        responseLanguage: isSupportedResponseLanguage(responseLanguage)
          ? responseLanguage
          : "en",
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Returns the stable state-file path for one normalized workspace root.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @returns Absolute local state-file path.
   */
  private getPath(workspaceRoot: string): string {
    const normalized = path.resolve(workspaceRoot).split(path.sep).join("/");
    const key = createHash("sha256").update(normalized).digest("hex");
    return path.join(this.stateDirectory, `${key}.json`);
  }
}

/**
 * Validates local state before exposing it to the CLI.
 *
 * @param value - Parsed local JSON value.
 * @param workspaceRoot - Workspace root requested by the caller.
 * @returns Whether the value is a valid selection for that root.
 */
function isActiveNotesSelection(
  value: unknown,
  workspaceRoot: string,
): value is Omit<ActiveNotesSelection, "responseLanguage"> & {
  responseLanguage?: string;
} {
  if (!value || typeof value !== "object") return false;
  const selection = value as Partial<ActiveNotesSelection>;
  const location = selection.location;
  return path.resolve(selection.workspaceRoot ?? "") === path.resolve(workspaceRoot)
    && typeof selection.outputDirectory === "string"
    && typeof selection.updatedAt === "string"
    && Boolean(location)
    && (location?.kind === "team"
      || (location?.kind === "personal" && typeof location.memberId === "string"));
}
