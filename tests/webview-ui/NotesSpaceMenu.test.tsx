/**
 * Tests the custom Notes space menu and Personal identity form.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NotesSpaceMenu } from "@webview/components/NotesSpaceMenu";
import { isPersonalIdentitySelected } from "@webview/components/notesSpaceMenuSelection";
import { PersonalIdentityModal } from "@webview/components/PersonalIdentityModal";

describe("NotesSpaceMenu", () => {
  it("renders Project, Team, and Personal entries with the current scope", () => {
    const html = renderToStaticMarkup(createElement(NotesSpaceMenu, {
      state: {
        scope: "personal",
        currentMemberId: "leo-12345678",
        members: [{ memberId: "leo-12345678", displayName: "Leo" }],
      },
      onProject: vi.fn(),
      onTeam: vi.fn(),
      onPersonal: vi.fn(),
      onCreateIdentity: vi.fn(),
      onClose: vi.fn(),
    }));
    expect(html).toContain("Open Project Notes");
    expect(html).toContain("Note Scope");
    expect(html).toContain("Team");
    expect(html).toContain("Personal");
  });

  it("renders the custom identity form with Git defaults", () => {
    const html = renderToStaticMarkup(createElement(PersonalIdentityModal, {
      defaultName: "Leo",
      defaultEmail: "leo@example.com",
      onCancel: vi.fn(),
      onSubmit: vi.fn(),
    }));
    expect(html).toContain("Create Personal Identity");
    expect(html).toContain('value="Leo"');
    expect(html).toContain('value="leo@example.com"');
    expect(html).toContain("It is not stored");
  });

  it("does not select a remembered Personal identity while Team is active", () => {
    const memberId = "leo-12345678";

    expect(isPersonalIdentitySelected({
      scope: "team",
      currentMemberId: memberId,
      members: [{ memberId, displayName: "Leo" }],
    }, memberId)).toBe(false);
    expect(isPersonalIdentitySelected({
      scope: "personal",
      currentMemberId: memberId,
      members: [{ memberId, displayName: "Leo" }],
    }, memberId)).toBe(true);
  });
});
