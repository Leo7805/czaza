/**
 * Stores the selected Team or Personal Notes scope for each CZaza project root.
 */

import path from "node:path";
import type * as vscode from "vscode";

import type { NoteStoreLocation } from "@vscode/notes";
import type { PersonalIdentityService } from "./PersonalIdentityService";

const NOTE_SCOPE_BINDINGS_KEY = "czaza.personalNotes.scopeBindings";

/** User-selectable Note Store scope. */
export type PersonalNoteScope = "team" | "personal";

/** Owns local scope selection and resolves it to a physical Note Store. */
export class PersonalNoteScopeService {
  private readonly workspaceState: vscode.Memento;
  private readonly identities: PersonalIdentityService;

  /** Creates the scope service from local state and identity infrastructure. */
  constructor(workspaceState: vscode.Memento, identities: PersonalIdentityService) {
    this.workspaceState = workspaceState;
    this.identities = identities;
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

  /** Resolves the current scope to a Team or Personal Store location. */
  async resolveLocation(
    workspaceRoot: string,
    outputDirectory: string,
  ): Promise<NoteStoreLocation> {
    if (this.getScope(workspaceRoot) === "team") return { kind: "team" };
    const identity = await this.identities.getCurrentIdentity(workspaceRoot, outputDirectory);
    if (!identity) {
      await this.setScope(workspaceRoot, "team");
      return { kind: "team" };
    }
    return { kind: "personal", memberId: identity.memberId };
  }
}

/** Normalizes project roots used as local state keys. */
function normalizeRoot(workspaceRoot: string): string {
  return path.resolve(workspaceRoot).split(path.sep).join("/");
}
