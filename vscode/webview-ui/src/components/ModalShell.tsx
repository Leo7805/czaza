/**
 * Shared CZaza-styled modal shell for webview dialogs.
 */

import { useEffect, type ReactNode } from "react";

/** Renders a modal backdrop, dialog surface, title, body, and footer. */
export function ModalShell({
  title,
  children,
  actions,
  onDismiss,
  className = "",
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!onDismiss) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onDismiss]);

  return (
    <div className={`modal-shell ${className}`} role="presentation" onMouseDown={onDismiss}>
      <section
        className="modal-shell__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal-shell__title">{title}</h2>
        <div className="modal-shell__body">{children}</div>
        {actions ? <div className="modal-shell__actions">{actions}</div> : null}
      </section>
    </div>
  );
}
