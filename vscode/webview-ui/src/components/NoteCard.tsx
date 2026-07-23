/**
 * Shared card component for notes sections.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type ReactNode,
} from "react";

import type {
  ExtensionToWebviewMessage,
  NoteStatus,
  ResourceAiExplanation,
  UserNoteTarget,
} from "../types";
import {
  replaceEditorSelection,
  type EditorSelection,
} from "../editorTextUtils";
import {
  EmojiPickerPopover,
  type EmojiPickerPosition,
} from "./EmojiPickerPopover";
import { NoteStatusBadges, type NoteStatusBadgeScope } from "./NoteStatusBadges";
import { Tooltip } from "./Tooltip";
import {
  UserNoteContextMenu,
  type UserNoteContextMenuItem,
  type UserNoteContextMenuPosition,
} from "./UserNoteContextMenu";

type NoteContextMenuState = {
  position: UserNoteContextMenuPosition;
  mode: "user" | "ai";
};

let lastActiveNoteEditor: HTMLTextAreaElement | null = null;

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
 * @param props.status - Optional content and source-anchor status.
 * @param props.statusTarget - Optional note target used by status actions.
 * @param props.onClearStaleStatus - Optional callback for marking stale content reviewed.
 * @param props.showTabs - Whether to show the User and AI tab toggle.
 * @param props.defaultTab - Initial active tab when tabs are shown.
 * @param props.activeTab - Optional externally controlled active tab.
 * @param props.onTabChange - Optional callback for externally controlled tab changes.
 * @param props.editKey - Stable target key used to cancel editing when context changes.
 * @param props.onSaveUserNote - Optional callback that enables User Note editing.
 * @param props.emptyText - Text shown when the active tab has no content.
 * @param props.headerAccessory - Optional control rendered beside the card title.
 * @param props.titleTooltip - Optional tooltip shown from the card title.
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
  status,
  statusTarget,
  onClearStaleStatus,
  onRelocate,
  showTabs = true,
  defaultTab = "user",
  activeTab,
  onTabChange,
  editKey,
  onSaveUserNote,
  emptyText,
  headerAccessory,
  titleTooltip,
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
  status?: NoteStatus;
  statusTarget?: UserNoteTarget;
  onClearStaleStatus?: (target: UserNoteTarget) => void;
  onRelocate?: () => void;
  showTabs?: boolean;
  defaultTab?: "user" | "ai";
  activeTab?: "user" | "ai";
  onTabChange?: (tab: "user" | "ai") => void;
  editKey?: string;
  onSaveUserNote?: (userNote: string) => void;
  emptyText: string;
  headerAccessory?: ReactNode;
  titleTooltip?: ReactNode;
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
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<EmojiPickerPosition | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editorSelectionRef = useRef<EditorSelection>({ start: 0, end: 0 });
  const pendingEditorSelectionRef = useRef<EditorSelection | null>(null);
  const selectedTab = activeTab ?? internalActiveTab;
  const selectTab = onTabChange ?? setInternalActiveTab;
  const hasUserContent = Boolean(userNote?.trim());
  const hasAiContent = Boolean(formatAiNoteForClipboard(aiExplanation).trim());
  const hasActiveContent = selectedTab === "user" ? hasUserContent : hasAiContent;
  const visibleStatus = getVisibleNoteStatus(status, selectedTab, hasUserContent, hasAiContent);
  const statusScope = getNoteStatusBadgeScope(variant);
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
    setEmojiPickerPosition(null);
  }, [editKey, selectedTab, startInEditMode, userNote]);

  useEffect(() => {
    const mountedEditor = editorRef.current;
    const openFromContextMenu = (event: MessageEvent): void => {
      const message = event.data as ExtensionToWebviewMessage;
      if (message.type !== "openEmojiPicker" || lastActiveNoteEditor !== editorRef.current) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const rect = editor.getBoundingClientRect();
      setEmojiPickerPosition(getEmojiPickerPosition(rect.left + 8, rect.top + 8));
    };

    window.addEventListener("message", openFromContextMenu);
    return () => {
      window.removeEventListener("message", openFromContextMenu);
      if (lastActiveNoteEditor === mountedEditor) {
        lastActiveNoteEditor = null;
      }
    };
  }, [isEditing]);

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

  useEffect(() => {
    if (!emojiPickerPosition) {
      return;
    }

    const closePickerOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setEmojiPickerPosition(null);
      requestAnimationFrame(() => editorRef.current?.focus());
    };

    window.addEventListener("keydown", closePickerOnEscape, true);
    return () => window.removeEventListener("keydown", closePickerOnEscape, true);
  }, [emojiPickerPosition]);

  useLayoutEffect(() => {
    const pendingSelection = pendingEditorSelectionRef.current;
    const editor = editorRef.current;
    if (!pendingSelection || !editor) {
      return;
    }

    pendingEditorSelectionRef.current = null;
    editor.focus();
    editor.setSelectionRange(pendingSelection.start, pendingSelection.end);
    editorSelectionRef.current = pendingSelection;
  }, [draft]);

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

  const rememberEditorSelection = (editor: HTMLTextAreaElement): void => {
    lastActiveNoteEditor = editor;
    editorSelectionRef.current = {
      start: editor.selectionStart,
      end: editor.selectionEnd,
    };
  };

  const closeEmojiPicker = useCallback((): void => {
    setEmojiPickerPosition(null);
  }, []);

  const insertEmoji = useCallback((emoji: string): void => {
    const { start, end } = editorSelectionRef.current;
    const nextCaret = start + emoji.length;
    const nextSelection = { start: nextCaret, end: nextCaret };

    pendingEditorSelectionRef.current = nextSelection;
    editorSelectionRef.current = nextSelection;
    setDraft((previous) => replaceEditorSelection(previous, { start, end }, emoji));
    setEmojiPickerPosition(null);
  }, []);

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

  const clearStale = (): void => {
    if (!statusTarget) {
      return;
    }

    setContextMenuState(null);
    onClearStaleStatus?.(statusTarget);
  };

  const relocate = (): void => {
    setContextMenuState(null);
    onRelocate?.();
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
    rememberEditorSelection(event.currentTarget);

    if (event.key === "Escape" && emojiPickerPosition) {
      event.preventDefault();
      event.stopPropagation();
      setEmojiPickerPosition(null);
      return;
    }

    if (event.code === "Space" && event.ctrlKey && event.metaKey) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setEmojiPickerPosition(getEmojiPickerPosition(rect.left + 8, rect.top + 8));
      return;
    }

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
          {titleTooltip ? (
            <Tooltip content={titleTooltip}>
              <h2 className="notes-card__title">{title}</h2>
            </Tooltip>
          ) : (
            <h2 className="notes-card__title">{title}</h2>
          )}
          {headerAccessory}
        </div>
        <NoteStatusBadges status={visibleStatus} scope={statusScope} />
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
            editorRef={editorRef}
            onEditorActivate={rememberEditorSelection}
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
          statusItems={getStatusMenuItems(
            visibleStatus,
            Boolean(statusTarget && onClearStaleStatus),
            clearStale,
            statusScope,
            onRelocate ? relocate : undefined,
          )}
        />
      ) : null}
      {emojiPickerPosition ? (
        <EmojiPickerPopover
          position={emojiPickerPosition}
          onSelect={insertEmoji}
          onClose={closeEmojiPicker}
        />
      ) : null}
    </section>
  );
}

/**
 * Keeps content freshness status scoped to the active User/AI tab.
 *
 * Anchor status still belongs to the resource target, so it remains visible even
 * when the active tab has no content.
 */
export function getVisibleNoteStatus(
  status: NoteStatus | undefined,
  selectedTab: "user" | "ai",
  hasUserContent: boolean,
  hasAiContent: boolean,
): NoteStatus | undefined {
  if (!status || status.content !== "stale") {
    return status;
  }

  const hasSelectedContent = selectedTab === "user" ? hasUserContent : hasAiContent;

  return hasSelectedContent ? status : { ...status, content: "current" };
}

function getStatusMenuItems(
  status: NoteStatus | undefined,
  canClearStaleStatus: boolean,
  onClearStaleStatus: () => void,
  scope: NoteStatusBadgeScope,
  onRelocate?: () => void,
): UserNoteContextMenuItem[] {
  const items: UserNoteContextMenuItem[] = [];

  if (status?.content === "stale") {
    items.push({
      id: "clearStale",
      label: getClearContentStaleMenuLabel(scope),
      disabled: !canClearStaleStatus,
      onSelect: canClearStaleStatus ? onClearStaleStatus : undefined,
    });
  }

  if (onRelocate && (scope === "file" || scope === "section" || scope === "line")) {
    items.push({
      id: "relocate",
      label: getRelocateMenuLabel(scope),
      onSelect: onRelocate,
    });
  }

  return items;
}

function getNoteStatusBadgeScope(variant: NoteCardVariant): NoteStatusBadgeScope {
  if (variant === "file" || variant === "section" || variant === "line") {
    return variant;
  }

  return "default";
}

function getClearContentStaleMenuLabel(scope: NoteStatusBadgeScope): string {
  if (scope === "file") {
    return "Clear Content Stale: Mark File Note Reviewed";
  }

  if (scope === "section") {
    return "Clear Content Stale: Mark Section Note Reviewed";
  }

  if (scope === "line") {
    return "Clear Content Stale: Mark Line Note Reviewed";
  }

  return "Clear Stale Status: Content Reviewed";
}

function getRelocateMenuLabel(scope: NoteStatusBadgeScope): string {
  if (scope === "section") {
    return "Relocate Section Note...";
  }

  if (scope === "line") {
    return "Relocate Line Note...";
  }

  if (scope === "file") {
    return "Relocate File Note...";
  }

  return "Resolve Anchor: Relocate...";
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
  editorRef,
  onEditorActivate,
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
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onEditorActivate: (editor: HTMLTextAreaElement) => void;
}) {
  if (isEditing) {
    return (
      <div className="user-note-editor">
        <textarea
          ref={editorRef}
          className="user-note-editor__input"
          aria-label="User note"
          autoFocus
          spellCheck={false}
          value={draft}
          data-vscode-context={JSON.stringify({ webviewSection: "noteEditor" })}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onEditorKeyDown}
          onFocus={(event) => onEditorActivate(event.currentTarget)}
          onSelect={(event) => onEditorActivate(event.currentTarget)}
          onContextMenu={(event) => onEditorActivate(event.currentTarget)}
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

function getEmojiPickerPosition(x: number, y: number): EmojiPickerPosition {
  const margin = 8;
  const pickerWidth = Math.min(352, window.innerWidth - margin * 2);
  const pickerHeight = Math.min(435, window.innerHeight - margin * 2);

  return {
    x: Math.max(margin, Math.min(x, window.innerWidth - pickerWidth - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - pickerHeight - margin)),
  };
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
