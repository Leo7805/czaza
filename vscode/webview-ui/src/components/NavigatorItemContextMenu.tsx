/**
 * Shared context menu for Navigator list items.
 */

import { useEffect, type CSSProperties } from "react";

/** Coordinates used to position the Navigator item context menu. */
export type NavigatorItemContextMenuPosition = {
  x: number;
  y: number;
};

/** One action rendered by the Navigator item context menu. */
export type NavigatorItemContextMenuItem = {
  id: "viewNotes" | "clearStale" | "relocate" | "markOrphaned" | "delete";
  label: string;
  disabled?: boolean;
  onSelect?: () => void;
};

/** Renders a VS Code-style context menu for Navigator list rows. */
export function NavigatorItemContextMenu({
  position,
  items,
  onClose,
}: {
  position: NavigatorItemContextMenuPosition;
  items: NavigatorItemContextMenuItem[];
  onClose: () => void;
}) {
  const style = getMenuPosition(position, items.length);

  useEffect(() => {
    const close = (): void => onClose();
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      className="navigator-context-menu"
      role="menu"
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {items.map((item) => (
        <button
          className={`navigator-context-menu__item navigator-context-menu__item--${item.id}`}
          disabled={item.disabled}
          key={item.id}
          role="menuitem"
          type="button"
          onClick={() => {
            item.onSelect?.();
            onClose();
          }}
        >
          <NavigatorContextMenuIcon name={item.id} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function NavigatorContextMenuIcon({ name }: { name: NavigatorItemContextMenuItem["id"] }) {
  if (name === "viewNotes") {
    return (
      <svg className="navigator-context-menu__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M3 2.25A1.75 1.75 0 0 1 4.75.5h6.5A1.75 1.75 0 0 1 13 2.25v11.5a.75.75 0 0 1-1.1.66L8 12.35l-3.9 2.06a.75.75 0 0 1-1.1-.66V2.25Zm1.75-.45a.45.45 0 0 0-.45.45v10.7l3.35-1.77a.75.75 0 0 1 .7 0l3.35 1.77V2.25a.45.45 0 0 0-.45-.45h-6.5Zm1.25 3h4v1.2H6V4.8Zm0 2.4h4v1.2H6V7.2Z"
        />
      </svg>
    );
  }

  if (name === "clearStale") {
    return (
      <svg className="navigator-context-menu__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 2.25a5.75 5.75 0 0 1 5.6 4.45l1.15-.95v3.5h-3.5l1.25-1.05A4.55 4.55 0 0 0 4.65 5.6l-.85-.85A5.73 5.73 0 0 1 8 2.25Zm3.25 4.55-3.8 3.8-2.1-2.1.85-.85 1.25 1.25 2.95-2.95.85.85ZM2.4 9.3l-1.15.95v-3.5h3.5L3.5 7.8a4.55 4.55 0 0 0 7.85 2.6l.85.85A5.75 5.75 0 0 1 2.4 9.3Z"
        />
      </svg>
    );
  }

  if (name === "relocate") {
    return (
      <svg className="navigator-context-menu__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M2 4.5h7v-2L13 6l-4 3.5v-2H2v-3Zm12 7H7v2l-4-3.5L7 6.5v2h7v3Z"
        />
      </svg>
    );
  }

  if (name === "markOrphaned") {
    return (
      <svg className="navigator-context-menu__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M4.4 5.15 2.95 6.6a3.05 3.05 0 0 0 4.3 4.3l1.45-1.45-.9-.9-1.45 1.45a1.77 1.77 0 0 1-2.5-2.5L5.3 6.05l-.9-.9Zm2.05 5.7 3.8-5.7 1.05.7-3.8 5.7-1.05-.7Zm1.35-4.4 1.45-1.45a1.77 1.77 0 0 1 2.5 2.5l-1.45 1.45.9.9 1.45-1.45a3.05 3.05 0 1 0-4.3-4.3L6.9 5.55l.9.9Z"
        />
      </svg>
    );
  }

  return (
    <svg className="navigator-context-menu__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M3 4h10v1H3V4Zm2 2h6l-.5 7h-5L5 6Zm1-4h4l.7 1H5.3L6 2Z" />
    </svg>
  );
}

function getMenuPosition(position: NavigatorItemContextMenuPosition, itemCount: number): CSSProperties {
  const menuWidth = 230;
  const menuHeight = 8 + itemCount * 30;
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;

  return {
    left: Math.max(6, Math.min(position.x, viewportWidth - menuWidth - 6)),
    top: Math.max(6, Math.min(position.y, viewportHeight - menuHeight - 6)),
  };
}
