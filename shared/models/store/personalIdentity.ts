/**
 * Persistent models for the project-level Personal Notes identity index.
 */

/** One Personal Notes identity shared through the project repository. */
export type PersonalIdentityMember = {
  /** Stable directory identifier derived from the display name and email hash. */
  memberId: string;
  /** Human-readable name shown during identity confirmation. */
  displayName: string;
  /** Full SHA-256 of the normalized email; the email itself is never persisted. */
  identityHash: string;
};

/** Root identity index stored at `.czaza/notes/personal/index.json`. */
export type PersonalIdentityIndexV1 = {
  /** Version of the Personal Notes identity index. */
  schemaVersion: 1;
  /** ISO timestamp for the last identity-index update. */
  updatedAt: string;
  /** Identities keyed by their stable member ID. */
  members: Record<string, PersonalIdentityMember>;
};

/**
 * Validates a parsed Personal Notes identity index.
 *
 * @param value - Parsed JSON value.
 * @returns True when the complete identity index is valid.
 */
export function isPersonalIdentityIndexV1(value: unknown): value is PersonalIdentityIndexV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const index = value as Partial<PersonalIdentityIndexV1>;

  return (
    index.schemaVersion === 1 &&
    typeof index.updatedAt === "string" &&
    !!index.members &&
    typeof index.members === "object" &&
    !Array.isArray(index.members) &&
    Object.entries(index.members).every(([memberId, member]) =>
      isPersonalIdentityMember(memberId, member),
    )
  );
}

/**
 * Validates one member and its identity-index key.
 *
 * @param memberId - Member ID used as the index key.
 * @param value - Candidate member value.
 * @returns True when the member is valid and agrees with its key.
 */
function isPersonalIdentityMember(memberId: string, value: unknown): value is PersonalIdentityMember {
  if (!value || typeof value !== "object") {
    return false;
  }

  const member = value as Partial<PersonalIdentityMember>;

  return (
    member.memberId === memberId &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(memberId) &&
    typeof member.displayName === "string" &&
    member.displayName.trim().length > 0 &&
    typeof member.identityHash === "string" &&
    /^[a-f0-9]{64}$/.test(member.identityHash)
  );
}
