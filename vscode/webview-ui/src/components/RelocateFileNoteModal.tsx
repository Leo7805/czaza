/**
 * Modal used to manually relocate a file note to a new source path.
 */

import { useEffect, useId, useState } from "react";

export function RelocateFileNoteModal({
  fromRelativePath,
  suggestedRelativePath,
  onCancel,
  onSubmit,
}: {
  fromRelativePath: string;
  suggestedRelativePath?: string;
  onCancel: () => void;
  onSubmit: (toRelativePath: string) => void;
}) {
  const [toRelativePath, setToRelativePath] = useState(fromRelativePath);
  const [error, setError] = useState<string | undefined>();
  const titleId = useId();
  const inputId = useId();
  const trimmedPath = toRelativePath.trim();

  useEffect(() => {
    setToRelativePath(fromRelativePath);
    setError(undefined);
  }, [fromRelativePath]);

  useEffect(() => {
    if (suggestedRelativePath) {
      setToRelativePath(suggestedRelativePath);
      setError(undefined);
    }
  }, [suggestedRelativePath]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  const submit = (): void => {
    if (!trimmedPath) {
      setError("Enter a path relative to the CZaza root.");
      return;
    }

    if (!isSafeRelativePath(trimmedPath)) {
      setError("Use a CZaza-root-relative path without ., .., or an absolute prefix.");
      return;
    }

    setError(undefined);
    onSubmit(trimmedPath.replaceAll("\\", "/"));
  };

  return (
    <div className="relocate-modal" role="presentation" onMouseDown={(event) => event.stopPropagation()}>
      <section
        className="relocate-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="relocate-modal__head">
          <RelocateIcon />
          <h2 className="relocate-modal__title" id={titleId}>
            Relocate File Note
          </h2>
        </div>
        <div className="relocate-modal__body">
          <dl className="relocate-modal__paths">
            <div>
              <dt>Current note path</dt>
              <dd>{fromRelativePath}</dd>
            </div>
          </dl>
          <label className="relocate-modal__label" htmlFor={inputId}>
            New file path
          </label>
          <input
            autoFocus
            className="relocate-modal__input"
            id={inputId}
            placeholder="src/new-name.ts"
            value={toRelativePath}
            onChange={(event) => {
              setToRelativePath(event.target.value);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          <p className="relocate-modal__hint">Enter a path relative to the CZaza root.</p>
          {error ? <p className="relocate-modal__error">{error}</p> : null}
        </div>
        <div className="relocate-modal__actions">
          <button className="relocate-modal__action relocate-modal__action--secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="relocate-modal__action relocate-modal__action--primary"
            type="button"
            disabled={!trimmedPath}
            onClick={submit}
          >
            Relocate
          </button>
        </div>
      </section>
    </div>
  );
}

function RelocateIcon() {
  return (
    <svg className="relocate-modal__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 3.75A1.75 1.75 0 0 1 3.75 2h3.1L8.2 3.35h4.05A1.75 1.75 0 0 1 14 5.1v1.15h-1.3V5.1a.45.45 0 0 0-.45-.45h-4.6L6.3 3.3H3.75a.45.45 0 0 0-.45.45v8.5c0 .25.2.45.45.45h3.8V14h-3.8A1.75 1.75 0 0 1 2 12.25v-8.5Zm8.75 2.95 3 3-3 3-.9-.9 1.45-1.45H7.5v-1.3h3.8L9.85 7.6l.9-.9Z"
      />
    </svg>
  );
}

function isSafeRelativePath(relativePath: string): boolean {
  if (!relativePath || relativePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(relativePath)) {
    return false;
  }

  const segments = relativePath.replaceAll("\\", "/").split("/");

  return segments.every((segment) => segment && segment !== "." && segment !== "..");
}
