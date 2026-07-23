/** Modal for relocating Section and Line Notes within the current text file. */

import { useEffect, useId, useState } from "react";

import type { NoteRelocateSuggestion, NoteRelocateTarget } from "../types";

export function RelocateNoteModal({
  target,
  suggestion,
  onCancel,
  onSubmit,
}: {
  target: NoteRelocateTarget;
  suggestion?: NoteRelocateSuggestion;
  onCancel: () => void;
  onSubmit: (
    target:
      | { level: "section"; sectionId: string; startLine: number; endLine: number }
      | { level: "line"; lineId: string; line: number },
  ) => void;
}) {
  const [followingEditor, setFollowingEditor] = useState(true);
  const [startLine, setStartLine] = useState(
    target.level === "section" ? String(target.startLine) : "",
  );
  const [endLine, setEndLine] = useState(
    target.level === "section" ? String(target.endLine) : "",
  );
  const [line, setLine] = useState(target.level === "line" ? String(target.line) : "");
  const [error, setError] = useState<string>();
  const titleId = useId();

  useEffect(() => {
    setFollowingEditor(true);
    setError(undefined);
    if (target.level === "section") {
      setStartLine(String(target.startLine));
      setEndLine(String(target.endLine));
    } else {
      setLine(String(target.line));
    }
  }, [target]);

  useEffect(() => {
    if (!followingEditor || !suggestion || suggestion.level !== target.level) {
      return;
    }

    if (suggestion.level === "section") {
      setStartLine(String(suggestion.startLine));
      setEndLine(String(suggestion.endLine));
    } else {
      setLine(String(suggestion.line));
    }
    setError(undefined);
  }, [followingEditor, suggestion, target.level]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  const useEditorTarget = (): void => {
    setFollowingEditor(true);
    setError(undefined);
    if (suggestion?.level === "section" && target.level === "section") {
      setStartLine(String(suggestion.startLine));
      setEndLine(String(suggestion.endLine));
    } else if (suggestion?.level === "line" && target.level === "line") {
      setLine(String(suggestion.line));
    }
  };

  const submit = (): void => {
    if (target.level === "section") {
      const parsedStart = parsePositiveLine(startLine);
      const parsedEnd = parsePositiveLine(endLine);
      if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) {
        setError("Enter a valid range whose end line is not before its start line.");
        return;
      }
      onSubmit({ ...target, startLine: parsedStart, endLine: parsedEnd });
      return;
    }

    const parsedLine = parsePositiveLine(line);
    if (!parsedLine) {
      setError("Enter a positive source line number.");
      return;
    }
    onSubmit({ ...target, line: parsedLine });
  };

  const setManualValue = (setter: (value: string) => void, value: string): void => {
    setFollowingEditor(false);
    setError(undefined);
    setter(value);
  };

  return (
    <div className="relocate-modal" role="presentation" onMouseDown={(event) => event.stopPropagation()}>
      <section className="relocate-modal__dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="relocate-modal__head">
          <h2 className="relocate-modal__title" id={titleId}>
            Relocate {target.level === "section" ? "Section" : "Line"} Note
          </h2>
        </div>
        <div className="relocate-modal__body">
          <dl className="relocate-modal__paths">
            <div>
              <dt>Current location</dt>
              <dd>
                {target.level === "section"
                  ? `L${target.startLine}–L${target.endLine}`
                  : `L${target.line}`}
              </dd>
            </div>
          </dl>
          {target.level === "section" ? (
            <div className="relocate-modal__range-inputs">
              <LineInput autoFocus label="Start line" value={startLine} onChange={(value) => setManualValue(setStartLine, value)} />
              <LineInput label="End line" value={endLine} onChange={(value) => setManualValue(setEndLine, value)} />
            </div>
          ) : (
            <LineInput autoFocus label="New line" value={line} onChange={(value) => setManualValue(setLine, value)} />
          )}
          <p className="relocate-modal__hint">
            {followingEditor
              ? `Following the current editor ${target.level === "section" ? "selection" : "cursor"}.`
              : "Using a manually entered location."}
          </p>
          {target.level === "line" && suggestion?.level === "line" && suggestion.preview ? (
            <pre className="relocate-modal__preview">{suggestion.preview}</pre>
          ) : null}
          {error ? <p className="relocate-modal__error">{error}</p> : null}
        </div>
        <div className="relocate-modal__actions">
          <button className="relocate-modal__action relocate-modal__action--secondary" type="button" onClick={useEditorTarget}>
            Use Current {target.level === "section" ? "Selection" : "Cursor"}
          </button>
          <button className="relocate-modal__action relocate-modal__action--secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="relocate-modal__action relocate-modal__action--primary" type="button" onClick={submit}>
            Relocate
          </button>
        </div>
      </section>
    </div>
  );
}

function LineInput({
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <label className="relocate-modal__label" htmlFor={id}>
      {label}
      <input
        autoFocus={autoFocus}
        className="relocate-modal__input"
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function parsePositiveLine(value: string): number | undefined {
  const normalized = value.trim().replace(/^L/i, "");
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
