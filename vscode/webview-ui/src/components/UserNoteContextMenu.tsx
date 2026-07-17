/**
 * Renders the contextual actions available for one note card.
 */

import type { CSSProperties } from "react";

/** Coordinates used to position the contextual menu inside the WebView. */
export type UserNoteContextMenuPosition = {
  /** Horizontal viewport coordinate. */
  x: number;
  /** Vertical viewport coordinate. */
  y: number;
};

/** Props for the User Note contextual menu. */
export type UserNoteContextMenuProps = {
  /** Menu position in viewport coordinates. */
  position: UserNoteContextMenuPosition;
  /** Whether the current note has content to copy or clear. */
  hasContent: boolean;
  /** Copies the current note text. */
  onCopy: () => void;
  /** Whether the Edit Note action should be shown. */
  showEdit?: boolean;
  /** Whether the Edit Note action is disabled. */
  editDisabled?: boolean;
  /** Opens the existing User Note editor. */
  onEdit?: () => void;
  /** Whether the Clear Note action should be shown. */
  showClear?: boolean;
  /** Whether the Clear Note action is disabled. */
  clearDisabled?: boolean;
  /** Clears the User Note while preserving its node. */
  onClear?: () => void;
  /** Optional status actions shown above normal note actions. */
  statusItems?: UserNoteContextMenuItem[];
};

/** Additional contextual action rendered in the menu. */
export type UserNoteContextMenuItem = {
  /** Stable action id used for icon and style selection. */
  id: "clearStale" | "relocate";
  /** Visible menu label. */
  label: string;
  /** Whether the action is unavailable. */
  disabled?: boolean;
  /** Runs the action. */
  onSelect?: () => void;
};

/**
 * Displays note actions shared by User and AI Note cards.
 *
 * @param props - Context menu actions and position.
 * @returns React element for the contextual menu.
 *
 * @example
 * <UserNoteContextMenu
 *   position={{ x: 80, y: 120 }}
 *   hasContent
 *   onCopy={copyNote}
 *   onEdit={editNote}
 *   onClear={clearNote}
 * />
 */
export function UserNoteContextMenu({
  position,
  hasContent,
  onCopy,
  showEdit = true,
  editDisabled = false,
  onEdit,
  showClear = true,
  clearDisabled = false,
  onClear,
  statusItems = [],
}: UserNoteContextMenuProps) {
  const hasStatusItems = statusItems.length > 0;
  const style = getMenuPosition(position, statusItems.length);

  return (
    <div
      className="user-note-context-menu"
      role="menu"
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {hasStatusItems ? (
        <>
          {statusItems.map((item) => (
            <ContextMenuButton
              disabled={item.disabled}
              icon={item.id}
              key={item.id}
              label={item.label}
              onClick={item.onSelect}
            />
          ))}
          <div className="user-note-context-menu__separator" role="separator" />
        </>
      ) : null}
      <ContextMenuButton icon="copy" label="Copy Note" disabled={!hasContent} onClick={onCopy} />
      {showEdit ? (
        <ContextMenuButton
          icon="edit"
          label="Edit Note"
          disabled={editDisabled}
          onClick={onEdit}
        />
      ) : null}
      {showClear ? (
        <ContextMenuButton
          icon="clear"
          label="Clear Note"
          disabled={clearDisabled || !hasContent}
          onClick={onClear}
        />
      ) : null}
    </div>
  );
}

function ContextMenuButton({
  icon,
  label,
  disabled = false,
  onClick,
}: {
  icon: UserNoteContextMenuItem["id"] | "copy" | "edit" | "clear";
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`user-note-context-menu__item user-note-context-menu__item--${icon}`}
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => onClick?.()}
    >
      <NoteActionIcon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function NoteActionIcon({
  name,
}: {
  name: UserNoteContextMenuItem["id"] | "copy" | "edit" | "clear";
}) {
  if (name === "copy") {
    return (
      <svg className="user-note-context-menu__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="currentColor" d="M4 4.5V2h8v2h2v9.5H6v-2H4V4.5Zm3 7.5h5V6H7v6ZM5 5v7h1V5h6V3H5v2Z" />
      </svg>
    );
  }

  if (name === "edit") {
    return (
      <svg className="user-note-context-menu__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="currentColor" d="M11.6 1.7a1.3 1.3 0 0 1 1.8 0l.9.9a1.3 1.3 0 0 1 0 1.8l-7.7 7.7-3.1.8.8-3.1 7.3-8.1ZM4.4 9.5l-.3 1.1 1.1-.3 6-6-.9-.9-5.9 6.1Z" />
      </svg>
    );
  }

  if (name === "clearStale") {
    return (
      <svg className="user-note-context-menu__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 2.25a5.75 5.75 0 0 1 5.6 4.45l1.15-.95v3.5h-3.5l1.25-1.05A4.55 4.55 0 0 0 4.65 5.6l-.85-.85A5.73 5.73 0 0 1 8 2.25Zm3.25 4.55-3.8 3.8-2.1-2.1.85-.85 1.25 1.25 2.95-2.95.85.85ZM2.4 9.3l-1.15.95v-3.5h3.5L3.5 7.8a4.55 4.55 0 0 0 7.85 2.6l.85.85A5.75 5.75 0 0 1 2.4 9.3Z"
        />
      </svg>
    );
  }

  if (name === "relocate") {
    return (
      <svg className="user-note-context-menu__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="currentColor" d="M2 4.5h7v-2L13 6l-4 3.5v-2H2v-3Zm12 7H7v2l-4-3.5L7 6.5v2h7v3Z" />
      </svg>
    );
  }

  return (
    <svg className="user-note-context-menu__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M3 4h10v1H3V4Zm2 2h6l-.5 7h-5L5 6Zm1-4h4l.7 1H5.3L6 2Z" />
    </svg>
  );
}

function getMenuPosition(position: UserNoteContextMenuPosition, statusItemCount: number): CSSProperties {
  const menuWidth = 230;
  const menuHeight = 104 + statusItemCount * 30 + (statusItemCount ? 7 : 0);

  return {
    left: Math.max(6, Math.min(position.x, window.innerWidth - menuWidth - 6)),
    top: Math.max(6, Math.min(position.y, window.innerHeight - menuHeight - 6)),
  };
}
