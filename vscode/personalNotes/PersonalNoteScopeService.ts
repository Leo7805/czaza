/**
 * Stores the selected Team or Personal Notes scope for each CZaza project root.
 */

import path from "node:path";
import type * as vscode from "vscode";

import type { NoteStoreLocation } from "@vscode/notes";
import { ActiveNotesSelectionRepository } from "@vscode/agentNotes/ActiveNotesSelectionRepository";
import type { AiResponseLanguage } from "@vscode/config/aiCatalog";
import type { PersonalIdentityService } from "./PersonalIdentityService";

const NOTE_SCOPE_BINDINGS_KEY = "czaza.personalNotes.scopeBindings";

/** User-selectable Note Store scope. */
export type PersonalNoteScope = "team" | "personal";

/** Owns local scope selection and resolves it to a physical Note Store. */
export class PersonalNoteScopeService {
  private readonly workspaceState: vscode.Memento;
  private readonly identities: PersonalIdentityService;
  private readonly activeNotes: ActiveNotesSelectionRepository;
  private readonly getResponseLanguage: () => AiResponseLanguage;

  /**
   * Creates the scope service from local state and identity infrastructure.
   *
   * @param workspaceState - VS Code state that stores the selected scope.
   * @param identities - Service that resolves a selected Personal identity.
   * @param activeNotes - Local bridge used by the standalone Agent Notes CLI.
   * @param getResponseLanguage - Reads the validated AI Notes language.
   */
  constructor(
    workspaceState: vscode.Memento,
    identities: PersonalIdentityService,
    activeNotes = new ActiveNotesSelectionRepository(),
    getResponseLanguage: () => AiResponseLanguage = () => "en",
  ) {
    this.workspaceState = workspaceState;
    this.identities = identities;
    this.activeNotes = activeNotes;
    this.getResponseLanguage = getResponseLanguage;
  }

  /** Returns the selected scope, defaulting to Team. */
  getScope(workspaceRoot: string): PersonalNoteScope {
    const bindings = this.workspaceState.get<Record<string, PersonalNoteScope>>(
      NOTE_SCOPE_BINDINGS_KEY,
      {},
    );
    return bindings[normalizeRoot(workspaceRoot)] === "personal" ? "personal" : "team";
  }

  /** Saves the selected scope for one project root. */
  async setScope(workspaceRoot: string, scope: PersonalNoteScope): Promise<void> {
    const bindings = this.workspaceState.get<Record<string, PersonalNoteScope>>(
      NOTE_SCOPE_BINDINGS_KEY,
      {},
    );
    await this.workspaceState.update(NOTE_SCOPE_BINDINGS_KEY, {
      ...bindings,
      [normalizeRoot(workspaceRoot)]: scope,
    });
  }

  /**
   * Resolves and publishes the Notes space currently displayed by CZaza.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @returns Current Team or Personal Note Store location.
   */
  async resolveLocation(
    workspaceRoot: string,
    outputDirectory: string,
  ): Promise<NoteStoreLocation> {
    if (this.getScope(workspaceRoot) === "team") {
      const location: NoteStoreLocation = { kind: "team" };
      await this.publishActiveSelection(workspaceRoot, outputDirectory, location);
      return location;
    }
    const identity = await this.identities.getCurrentIdentity(workspaceRoot, outputDirectory);
    if (!identity) {
      await this.setScope(workspaceRoot, "team");
      const location: NoteStoreLocation = { kind: "team" };
      await this.publishActiveSelection(workspaceRoot, outputDirectory, location);
      return location;
    }
    const location: NoteStoreLocation = { kind: "personal", memberId: identity.memberId };
    await this.publishActiveSelection(workspaceRoot, outputDirectory, location);
    return location;
  }

  /** Publishes one resolved Notes location with the current AI response language. */
  private async publishActiveSelection(
    workspaceRoot: string,
    outputDirectory: string,
    location: NoteStoreLocation,
  ): Promise<void> {
    await this.activeNotes.save(
      workspaceRoot,
      outputDirectory,
      location,
      this.getResponseLanguage(),
    );
  }
}

/** Normalizes project roots used as local state keys. */
function normalizeRoot(workspaceRoot: string): string {
  return path.resolve(workspaceRoot).split(path.sep).join("/");
}
