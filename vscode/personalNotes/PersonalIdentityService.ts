/**
 * Coordinates Personal Notes identity matching, creation, and workspace binding.
 */

import path from "node:path";
import type * as vscode from "vscode";

import type {
  PersonalIdentityIndexV1,
  PersonalIdentityMember,
} from "@shared/models/store/personalIdentity";
import {
  createEmailIdentityHash,
  createPersonalMemberId,
  type PersonalIdentityDetails,
} from "./gitIdentityService";
import {
  getPersonalMemberStorePath,
  PersonalIdentityRepository,
} from "./PersonalIdentityRepository";

const WORKSPACE_BINDINGS_KEY = "czaza.personalNotes.identityBindings";

/** Resolved Personal Notes identity and its standard Store path. */
export type ResolvedPersonalIdentity = PersonalIdentityMember & {
  /** Absolute directory containing this member's standard Note Store. */
  storeDirectory: string;
};

/** Owns Personal Notes identities and local workspace selections. */
export class PersonalIdentityService {
  private readonly workspaceState: vscode.Memento;
  private readonly repository: PersonalIdentityRepository;

  /**
   * Creates the identity service.
   *
   * @param workspaceState - VS Code state used for local project bindings.
   * @param repository - Persistence adapter for identities and member Stores.
   */
  constructor(
    workspaceState: vscode.Memento,
    repository = new PersonalIdentityRepository(),
  ) {
    this.workspaceState = workspaceState;
    this.repository = repository;
  }

  /**
   * Lists repository identities.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @returns Members ordered by display name.
   */
  async listMembers(
    workspaceRoot: string,
    outputDirectory: string,
  ): Promise<PersonalIdentityMember[]> {
    const index = await this.repository.loadIndex(workspaceRoot, outputDirectory);
    return Object.values(index?.members ?? {}).sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }

  /**
   * Finds an existing member by normalized-email hash.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param email - Email used only for identity hashing.
   * @returns Matching member, when present.
   */
  async findByEmail(
    workspaceRoot: string,
    outputDirectory: string,
    email: string,
  ): Promise<PersonalIdentityMember | undefined> {
    const identityHash = createEmailIdentityHash(email);
    return (await this.listMembers(workspaceRoot, outputDirectory)).find(
      (member) => member.identityHash === identityHash,
    );
  }

  /**
   * Creates a new identity and its empty standard Note Store.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param details - Confirmed display name and email.
   * @returns Newly created identity.
   */
  async createIdentity(
    workspaceRoot: string,
    outputDirectory: string,
    details: PersonalIdentityDetails,
  ): Promise<PersonalIdentityMember> {
    const currentIndex = await this.repository.loadIndex(workspaceRoot, outputDirectory);
    const identityHash = createEmailIdentityHash(details.email);
    const existing = Object.values(currentIndex?.members ?? {}).find(
      (member) => member.identityHash === identityHash,
    );

    if (existing) {
      throw new Error(`A Personal Notes identity already uses this email hash: ${existing.displayName}`);
    }

    const memberId = await this.createAvailableMemberId(
      workspaceRoot,
      outputDirectory,
      details.displayName,
      identityHash,
      currentIndex,
    );
    const now = new Date().toISOString();
    const member: PersonalIdentityMember = {
      memberId,
      displayName: details.displayName.trim(),
      identityHash,
    };

    await this.repository.createMemberStore(workspaceRoot, outputDirectory, memberId, now);
    await this.repository.saveIndex(workspaceRoot, outputDirectory, {
      schemaVersion: 1,
      updatedAt: now,
      members: { ...(currentIndex?.members ?? {}), [memberId]: member },
    });

    return member;
  }

  /**
   * Saves one confirmed identity as the current local project identity.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param memberId - Confirmed repository member ID.
   * @returns Promise resolved after the local binding is saved.
   */
  async bindCurrentIdentity(workspaceRoot: string, memberId: string): Promise<void> {
    const bindings = this.workspaceState.get<Record<string, string>>(WORKSPACE_BINDINGS_KEY, {});
    await this.workspaceState.update(WORKSPACE_BINDINGS_KEY, {
      ...bindings,
      [normalizeRoot(workspaceRoot)]: memberId,
    });
  }

  /**
   * Resolves the current valid local identity.
   *
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @returns Bound identity, or undefined when the binding or Store is invalid.
   */
  async getCurrentIdentity(
    workspaceRoot: string,
    outputDirectory: string,
  ): Promise<ResolvedPersonalIdentity | undefined> {
    const bindings = this.workspaceState.get<Record<string, string>>(WORKSPACE_BINDINGS_KEY, {});
    const memberId = bindings[normalizeRoot(workspaceRoot)];
    if (!memberId) return undefined;

    const member = (await this.listMembers(workspaceRoot, outputDirectory)).find(
      (candidate) => candidate.memberId === memberId,
    );
    if (!member || !(await this.repository.memberStoreExists(workspaceRoot, outputDirectory, memberId))) {
      return undefined;
    }

    return {
      ...member,
      storeDirectory: getPersonalMemberStorePath(workspaceRoot, outputDirectory, memberId),
    };
  }

  /** Finds a collision-free member ID by extending the email-hash suffix. */
  private async createAvailableMemberId(
    workspaceRoot: string,
    outputDirectory: string,
    displayName: string,
    identityHash: string,
    index: PersonalIdentityIndexV1 | null,
  ): Promise<string> {
    for (let length = 8; length <= identityHash.length; length += 2) {
      const candidate = createPersonalMemberId(displayName, identityHash, length);
      if (!index?.members[candidate] &&
        !(await this.repository.memberStoreExists(workspaceRoot, outputDirectory, candidate))) {
        return candidate;
      }
    }
    throw new Error("Unable to create a unique Personal Notes member ID.");
  }
}

/** Normalizes a project root for a stable local binding key. */
function normalizeRoot(workspaceRoot: string): string {
  return path.resolve(workspaceRoot).split(path.sep).join("/");
}
