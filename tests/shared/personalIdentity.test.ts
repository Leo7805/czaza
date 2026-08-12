/**
 * Tests Personal Notes identity models and deterministic identity derivation.
 */

import { describe, expect, it } from "vitest";

import { isPersonalIdentityIndexV1 } from "@shared/models/store/personalIdentity";
import {
  createDisplayNameSlug,
  createEmailIdentityHash,
  createPersonalMemberId,
  normalizeEmail,
} from "@vscode/personalNotes/gitIdentityService";

describe("Personal identity helpers", () => {
  it("normalizes email before creating a stable hash", () => {
    expect(createEmailIdentityHash(" Leo@Example.com ")).toBe(
      createEmailIdentityHash("leo@example.com"),
    );
    expect(normalizeEmail(" Leo@Example.com ")).toBe("leo@example.com");
  });

  it("creates a readable member ID with an email hash prefix", () => {
    const hash = createEmailIdentityHash("leo@example.com");
    expect(createDisplayNameSlug("Léo Zhang")).toBe("leo-zhang");
    expect(createPersonalMemberId("Léo Zhang", hash)).toBe(`leo-zhang-${hash.slice(0, 8)}`);
  });

  it("validates identity-index keys against their member IDs", () => {
    const hash = createEmailIdentityHash("leo@example.com");
    const memberId = createPersonalMemberId("Leo", hash);
    expect(isPersonalIdentityIndexV1({
      schemaVersion: 1,
      updatedAt: "2026-08-13T00:00:00.000Z",
      members: { [memberId]: { memberId, displayName: "Leo", identityHash: hash } },
    })).toBe(true);
    expect(isPersonalIdentityIndexV1({
      schemaVersion: 1,
      updatedAt: "",
      members: { wrong: { memberId, displayName: "Leo", identityHash: hash } },
    })).toBe(false);
  });
});
