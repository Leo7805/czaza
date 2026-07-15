/**
 * Shared card component for notes sections.
 */

import {
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import type { ResourceAiExplanation } from "../types";
import {
  UserNoteContextMenu,
  type UserNoteContextMenuPosition,
} from "./UserNoteContextMenu";

type NoteContextMenuState = {
  position: UserNoteContextMenuPosition;
  mode: "user" | "ai";
};

/**
 * Visual note card variants used by the notes panel.
 */
export type NoteCardVariant = "file" | "section" | "line" | "child";

/**
 * Renders a notes card with User and AI tabs.
 *
 * @param props - Component props.
 * @param props.title - Card title.
 * @param props.variant - Visual card variant.
 * @param props.userNote - Optional complete user note.
 * @param props.aiExplanation - Optional complete AI explanation.
 * @param props.showTabs - Whether to show the User and AI tab toggle.
 * @param props.defaultTab - Initial active tab when tabs are shown.
 * @param props.activeTab - Optional externally controlled active tab.
 * @param props.onTabChange - Optional callback for externally controlled tab changes.
 * @param props.editKey - Stable target key used to cancel editing when context changes.
 * @param props.onSaveUserNote - Optional callback that enables User Note editing.
 * @param props.emptyText - Text shown when the active tab has no content.
 * @param props.headerAccessory - Optional control rendered beside the card title.
 * @param props.aiActionLabel - Label for the optional AI generation button.
 * @param props.isAiActionRunning - Whether the AI action is currently running.
 * @param props.isAiActionDisabled - Whether another AI action is running.
 * @param props.onGenerateAi - Optional callback for the AI generation button.
 * @param props.aiAction - Optional custom AI action control.
 * @param props.startInEditMode - Whether the User Note editor opens immediately.
 * @param props.children - Optional custom body rendered below the card header.
 * @returns React element for one notes card.
 *
 * @example
 * <NoteCard
 *   title="File Notes"
 *   variant="file"
 *   userNote="Important file."
 *   showTabs={false}
 *   emptyText="No file note yet."
 * />
 */
export function NoteCard({
  title,
  variant,
  userNote,
  aiExplanation,
  showTabs = true,
  defaultTab = "user",
  activeTab,
  onTabChange,
  editKey,
  onSaveUserNote,
  emptyText,
  headerAccessory,
  aiActionLabel,
  isAiActionRunning = false,
  isAiActionDisabled = false,
  onGenerateAi,
  aiAction,
  startInEditMode = false,
  children,
}: {
  title: string;
  variant: NoteCardVariant;
  userNote?: string;
  aiExplanation?: ResourceAiExplanation;
  showTabs?: boolean;
  defaultTab?: "user" | "ai";
  activeTab?: "user" | "ai";
  onTabChange?: (tab: "user" | "ai") => void;
  editKey?: string;
  onSaveUserNote?: (userNote: string) => void;
  emptyText: string;
  headerAccessory?: ReactNode;
  aiActionLabel?: "Generate" | "Regenerate";
  isAiActionRunning?: boolean;
  isAiActionDisabled?: boolean;
  onGenerateAi?: () => void;
  aiAction?: ReactNode;
  startInEditMode?: boolean;
  children?: ReactNode;
}) {
  const [internalActiveTab, setInternalActiveTab] = useState<"user" | "ai">(defaultTab);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [contextMenuState, setContextMenuState] = useState<NoteContextMenuState | null>(null);
  const selectedTab = activeTab ?? internalActiveTab;
  const selectTab = onTabChange ?? setInternalActiveTab;
  const hasUserContent = Boolean(userNote?.trim());
  const hasAiContent = Boolean(formatAiNoteForClipboard(aiExplanation).trim());
  const hasActiveContent = selectedTab === "user" ? hasUserContent : hasAiContent;
  const isEmpty = !hasActiveContent && !children;
  const cardClass = [
    "notes-card",
    `notes-card--${variant}`,
    `notes-card--${selectedTab}`,
    isEmpty ? "notes-card--empty" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    setIsEditing(startInEditMode && selectedTab === "user");
    setDraft(startInEditMode && selectedTab === "user" ? userNote ?? "" : "");
    setContextMenuState(null);
  }, [editKey, selectedTab, startInEditMode, userNote]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const closeMenu = (): void => setContextMenuState(null);
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenuState]);

  const startEditing = (): void => {
    setDraft(userNote ?? "");
    setIsEditing(true);
  };

  const cancelEditing = (): void => {
    setIsEditing(false);
    setDraft("");
  };

  const saveEditing = (): void => {
    onSaveUserNote?.(draft);
    setIsEditing(false);
  };

  const copyUserNote = (): void => {
    setContextMenuState(null);
    void navigator.clipboard?.writeText(userNote ?? "");
  };

  const copyAiNote = (): void => {
    setContextMenuState(null);
    void navigator.clipboard?.writeText(formatAiNoteForClipboard(aiExplanation));
  };

  const clearUserNote = (): void => {
    setContextMenuState(null);
    onSaveUserNote?.("");
  };

  const editUserNote = (): void => {
    setContextMenuState(null);
    startEditing();
  };

  const handleCardContextMenu = (event: MouseEvent<HTMLElement>): void => {
    const isUserNote = selectedTab === "user";

    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, select, input, textarea, a")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenuState({
      position: { x: event.clientX, y: event.clientY },
      mode: isUserNote ? "user" : "ai",
    });
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveEditing();
    }
  };

  return (
    <section className={cardClass} onContextMenu={handleCardContextMenu}>
      <div className="notes-card__head">
        <div className="notes-card__title-group">
          <h2 className="notes-card__title">{title}</h2>
          {headerAccessory}
        </div>
        {showTabs ? <TabControl activeTab={selectedTab} onChange={selectTab} /> : null}
      </div>
      {children ?? (
        selectedTab === "user" ? (
          <UserNoteContent
            userNote={userNote}
            emptyText={emptyText}
            canEdit={Boolean(editKey && onSaveUserNote)}
            isEditing={isEditing}
            draft={draft}
            onDraftChange={setDraft}
            onStartEditing={startEditing}
            onCancel={cancelEditing}
            onSave={saveEditing}
            onEditorKeyDown={handleEditorKeyDown}
          />
        ) : (
          <AiExplanationContent
            explanation={aiExplanation}
            emptyText={emptyText}
            actionLabel={aiActionLabel}
            isActionRunning={isAiActionRunning}
            isActionDisabled={isAiActionDisabled}
            onGenerate={onGenerateAi}
            action={aiAction}
          />
        )
      )}
      {contextMenuState ? (
        <UserNoteContextMenu
          position={contextMenuState.position}
          hasContent={contextMenuState.mode === "user" ? hasUserContent : hasAiContent}
          onCopy={contextMenuState.mode === "user" ? copyUserNote : copyAiNote}
          showEdit={contextMenuState.mode === "user"}
          editDisabled={!onSaveUserNote || !editKey}
          onEdit={contextMenuState.mode === "user" ? editUserNote : undefined}
          showClear={contextMenuState.mode === "user"}
          clearDisabled={!onSaveUserNote || !editKey}
          onClear={contextMenuState.mode === "user" ? clearUserNote : undefined}
        />
      ) : null}
    </section>
  );
}

function UserNoteContent({
  userNote,
  emptyText,
  canEdit,
  isEditing,
  draft,
  onDraftChange,
  onStartEditing,
  onCancel,
  onSave,
  onEditorKeyDown,
}: {
  userNote?: string;
  emptyText: string;
  canEdit: boolean;
  isEditing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onStartEditing: () => void;
  onCancel: () => void;
  onSave: () => void;
  onEditorKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  if (isEditing) {
    return (
      <div className="user-note-editor">
        <textarea
          className="user-note-editor__input"
          aria-label="User note"
          autoFocus
          spellCheck={false}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onEditorKeyDown}
        />
        <div className="user-note-editor__actions">
          <button className="user-note-editor__save" type="button" onClick={onSave}>
            Save
          </button>
          <button className="user-note-editor__cancel" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="user-note-view">
      <p className={userNote ? "notes-content" : "notes-muted"}>{userNote ?? emptyText}</p>
      {canEdit ? (
        <button
          className="user-note-edit-button"
          type="button"
          title="Edit user note"
          aria-label="Edit user note"
          onClick={onStartEditing}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M11.6 1.7a1.3 1.3 0 0 1 1.8 0l.9.9a1.3 1.3 0 0 1 0 1.8l-7.7 7.7-3.1.8.8-3.1 7.3-8.1Zm-.8 2.4-5.6 6.2-.3 1.1 1.1-.3 6-6-.2-.2-1-1Zm1.8-1.4-.8.8 1 1 .8-.8-.9-.9-.1-.1Z"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

function AiExplanationContent({
  explanation,
  emptyText,
  actionLabel,
  isActionRunning,
  isActionDisabled,
  onGenerate,
  action,
}: {
  explanation?: ResourceAiExplanation;
  emptyText: string;
  actionLabel?: "Generate" | "Regenerate";
  isActionRunning: boolean;
  isActionDisabled: boolean;
  onGenerate?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="ai-note-content">
      {explanation ? (
        <>
          <p className="ai-note-content__summary">{explanation.summary}</p>
          {explanation.detail ? (
            <p className="ai-note-content__detail">{explanation.detail}</p>
          ) : null}
          {explanation.aiNotes && explanation.aiNotes.length > 0 ? (
            <ul className="ai-note-content__notes">
              {explanation.aiNotes.map((note, index) => (
                <li key={`${index}:${note}`}>{note}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="notes-muted">{emptyText}</p>
      )}
      {action ?? (actionLabel && onGenerate ? (
        <button
          className="ai-note-content__action"
          type="button"
          disabled={isActionRunning || isActionDisabled}
          onClick={onGenerate}
        >
          {isActionRunning
            ? actionLabel === "Generate"
              ? "Generating..."
              : "Regenerating..."
            : actionLabel}
        </button>
      ) : null)}
    </div>
  );
}

function formatAiNoteForClipboard(explanation?: ResourceAiExplanation): string {
  if (!explanation) {
    return "";
  }

  return [explanation.summary, explanation.detail, ...(explanation.aiNotes ?? [])]
    .filter(Boolean)
    .join("\n\n");
}

function TabControl({
  activeTab,
  onChange,
}: {
  activeTab: "user" | "ai";
  onChange: (tab: "user" | "ai") => void;
}) {
  return (
    <div className="notes-tabs" role="tablist" aria-label="Note source">
      <button
        className={activeTab === "user" ? "notes-tab notes-tab--active" : "notes-tab"}
        type="button"
        onClick={() => onChange("user")}
      >
        User
      </button>
      <button
        className={activeTab === "ai" ? "notes-tab notes-tab--active" : "notes-tab"}
        type="button"
        onClick={() => onChange("ai")}
      >
        AI
      </button>
    </div>
  );
}
