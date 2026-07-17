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
  id: "clearStale" | "relocate" | "delete";
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
