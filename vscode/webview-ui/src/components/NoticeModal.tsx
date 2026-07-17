/**
 * Reusable in-webview modal for CZaza notices and confirmations.
 */

import { useEffect } from "react";

/** Visual tone for a notice modal. */
export type NoticeModalTone = "info" | "warning" | "error" | "success";

/** One footer action rendered by a notice modal. */
export type NoticeModalAction = {
  /** Visible button label. */
  label: string;
  /** Button visual style. */
  variant?: "primary" | "secondary";
  /** Runs when the button is clicked. */
  onClick: () => void;
  /** Whether the action is unavailable. */
  disabled?: boolean;
};

/**
 * Renders a small modal that matches the notes panel styling.
 */
export function NoticeModal({
  tone = "info",
  title,
  message,
  actions,
  onDismiss,
}: {
  tone?: NoticeModalTone;
  title: string;
  message: string;
  actions: NoticeModalAction[];
  onDismiss?: () => void;
}) {
  useEffect(() => {
    if (!onDismiss) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onDismiss]);

  return (
    <div
      className={`notice-modal notice-modal--${tone}`}
      role="presentation"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <section
        className="notice-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-modal-title"
      >
        <div className="notice-modal__head">
          <NoticeIcon tone={tone} />
          <h2 className="notice-modal__title" id="notice-modal-title">
            {title}
          </h2>
        </div>
        <p className="notice-modal__message">{message}</p>
        <div className="notice-modal__actions">
          {actions.map((action) => (
            <button
              className={
                action.variant === "secondary"
                  ? "notice-modal__action notice-modal__action--secondary"
                  : "notice-modal__action notice-modal__action--primary"
              }
              disabled={action.disabled}
              key={action.label}
              type="button"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function NoticeIcon({ tone }: { tone: NoticeModalTone }) {
  if (tone === "warning") {
    return (
      <svg className="notice-modal__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1.5 15 14H1L8 1.5Zm0 2.55L3.15 12.75h9.7L8 4.05ZM7.35 6h1.3v3.6h-1.3V6Zm0 4.65h1.3V12h-1.3v-1.35Z"
        />
      </svg>
    );
  }

  if (tone === "error") {
    return (
      <svg className="notice-modal__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 1.25a5.25 5.25 0 1 0 0 10.5 5.25 5.25 0 0 0 0-10.5ZM5.25 6.15l.9-.9L8 7.1l1.85-1.85.9.9L8.9 8l1.85 1.85-.9.9L8 8.9l-1.85 1.85-.9-.9L7.1 8 5.25 6.15Z"
        />
      </svg>
    );
  }

  if (tone === "success") {
    return (
      <svg className="notice-modal__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm3.35 4.65-.9-.9-3.1 3.1-1.3-1.3-.9.9 2.2 2.2 4-4Z"
        />
      </svg>
    );
  }

  return (
    <svg className="notice-modal__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm-.65 5.4V12h1.3V6.9h-1.3Zm0-2.5v1.35h1.3V4.4h-1.3Z"
      />
    </svg>
  );
}
