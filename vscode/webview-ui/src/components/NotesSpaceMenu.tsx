/**
 * CZaza-styled Notes space menu with a dynamic Personal identity submenu.
 */

import { useEffect, useState } from "react";
import type { PersonalIdentityListItem, NotesSpaceMenuState } from "../types";
import { isPersonalIdentitySelected } from "./notesSpaceMenuSelection";

/** Renders Project, Team, and Personal Notes choices. */
export function NotesSpaceMenu({
  state,
  onProject,
  onTeam,
  onPersonal,
  onCreateIdentity,
  onClose,
}: {
  state: NotesSpaceMenuState;
  onProject: () => void;
  onTeam: () => void;
  onPersonal: (member: PersonalIdentityListItem) => void;
  onCreateIdentity: () => void;
  onClose: () => void;
}) {
  const [personalOpen, setPersonalOpen] = useState(false);

  useEffect(() => {
    const close = (): void => onClose();
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="notes-space-menu" role="menu" onMouseDown={(event) => event.stopPropagation()}>
      <div className="notes-space-menu__title">Notes</div>
      <MenuButton label="Open Project Notes" onClick={onProject} />
      <div className="notes-space-menu__separator" />
      <div className="notes-space-menu__title">Note Scope</div>
      <MenuButton label="Team" checked={state.scope === "team"} onClick={onTeam} />
      <MenuButton
        label="Personal"
        checked={state.scope === "personal"}
        suffix="›"
        onClick={() => setPersonalOpen((open) => !open)}
      />
      {personalOpen ? (
        <div className="notes-space-menu__submenu" role="menu">
          <div className="notes-space-menu__title">Personal Identity</div>
          {state.members.map((member) => (
            <MenuButton
              key={member.memberId}
              label={member.displayName}
              detail={member.memberId}
              checked={isPersonalIdentitySelected(state, member.memberId)}
              onClick={() => onPersonal(member)}
            />
          ))}
          {state.members.length ? <div className="notes-space-menu__separator" /> : null}
          <MenuButton label="＋ Create Identity" onClick={onCreateIdentity} />
        </div>
      ) : null}
    </div>
  );
}

/** Renders one consistent menu row. */
function MenuButton({
  label,
  detail,
  checked,
  suffix,
  onClick,
}: {
  label: string;
  detail?: string;
  checked?: boolean;
  suffix?: string;
  onClick: () => void;
}) {
  return (
    <button className="notes-space-menu__item" role="menuitem" type="button" onClick={onClick}>
      <span className="notes-space-menu__check">{checked ? "✓" : ""}</span>
      <span className="notes-space-menu__label">
        {label}
        {detail ? <small>{detail}</small> : null}
      </span>
      <span className="notes-space-menu__suffix">{suffix}</span>
    </button>
  );
}
