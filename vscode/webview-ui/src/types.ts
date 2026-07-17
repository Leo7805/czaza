/**
 * Shared message and view models for the CZaza React webview.
 */

/**
 * Single child note preview shown in a directory notes view.
 *
 * @example
 * const child: ResourceChildNotePreview = {
 *   kind: "file",
 *   name: "Button.tsx",
 *   relativePath: "src/Button.tsx",
 *   notePreview: "Renders the primary button.",
 * };
 */
export type ResourceChildNotePreview = {
  /** Child resource kind. */
  kind: "file" | "directory";

  /** Display name for the child resource. */
  name: string;

  /** Root-relative path for the child resource. */
  relativePath: string;

  /** Single-line note preview. */
  notePreview: string;
};

/**
 * Complete user and AI content available for one detailed note card.
 *
 * @example
 * const content: ResourceNoteContent = {
 *   userNote: "Review this timeout.\nConfirm the default value.",
 *   aiExplanation: {
 *     summary: "Configures the request timeout.",
 *     detail: "The timeout is applied to each outgoing request.",
 *   },
 * };
 */
export type ResourceNoteContent = {
  /** Complete user-authored note content. */
  userNote?: string;

  /** Complete AI explanation content. */
  aiExplanation?: ResourceAiExplanation;

  /** Current content and source-anchor status for this note. */
  status?: NoteStatus;
};

/** Indicates whether a note still describes the current source code. */
export type NoteContentStatus = "current" | "stale";

/** Indicates whether a note is still attached to the correct code target. */
export type NoteAnchorStatus = "confirmed" | "needsConfirmation" | "orphaned";

/** Shared status information displayed by note cards and lists. */
export type NoteStatus = {
  content: NoteContentStatus;
  anchor: NoteAnchorStatus;
};

/** In-webview notice modal payload sent by the extension host. */
export type WebviewNotice = {
  tone: "info" | "warning" | "error" | "success";
  title: string;
  message: string;
  actions: Array<{
    label: string;
    variant?: "primary" | "secondary";
  }>;
};

/**
 * Complete AI explanation rendered by a detailed note card.
 */
export type ResourceAiExplanation = {
  /** Concise explanation summary. */
  summary: string;

  /** Detailed explanation body. */
  detail: string;

  /** Optional additional observations. */
  aiNotes?: string[];
};

/** AI generation scope currently running for one resource. */
export type ResourceAiActionScope = "fileSection" | "all" | "section" | "line";

/**
 * File, section, or line target accepted by the shared user-note editor.
 *
 * @example
 * const target: UserNoteTarget = { level: "line", line: 42 };
 */
export type UserNoteTarget =
  | { level: "file" }
  | { level: "section"; sectionId: string }
  | { level: "line"; line: number };

/**
 * Section note matched to the active source line.
 *
 * @example
 * const section: ResourceSectionNoteContent = {
 *   id: "section:request:10-20",
 *   title: "Send request",
 *   startLine: 10,
 *   endLine: 20,
 *   aiExplanation: { summary: "Sends the request.", detail: "Builds and sends it." },
 * };
 */
export type ResourceSectionNoteContent = ResourceNoteContent & {
  /** Stable section note identifier. */
  id: string;

  /** Human-readable section title. */
  title: string;

  /** Optional section category. */
  kind?: string;

  /** One-based inclusive start line. */
  startLine: number;

  /** One-based inclusive end line. */
  endLine: number;
};

/**
 * Line note matched to the active source line.
 *
 * @example
 * const line: ResourceLineNoteContent = {
 *   id: "line:42",
 *   line: 42,
 *   userNote: "Important return value.",
 * };
 */
export type ResourceLineNoteContent = ResourceNoteContent & {
  /** Stable line note identifier. */
  id: string;

  /** One-based source line number. */
  line: number;
};

/**
 * Notes payload rendered by the React webview.
 *
 * @example
 * const notes: ResourceNotesViewModel = {
 *   kind: "file",
 *   name: "index.ts",
 *   relativePath: "src/index.ts",
 *   fileNote: { aiExplanation: { summary: "Initializes the extension.", detail: "Registers features." } },
 *   sectionNotes: [],
 * };
 */
export type ResourceNotesViewModel =
  | {
      /** No resource is currently selected. */
      kind: "empty";
      message: string;
    }
  | {
      /** A file outside the CZaza root was selected. */
      kind: "outsideRoot";
    }
  | {
      /** File notes view. */
      kind: "file";
      name: string;
      relativePath: string;
      projectRootName?: string;
      fileNote?: ResourceNoteContent;
      aiAction: "generate" | "regenerate";
      activeLine?: number;
      isAiActionRunning?: boolean;
      /** Whether this resource is currently generating AI notes. */
      aiActionRunningScope?: ResourceAiActionScope;
      revealAiNotes?: "fileSection" | "all" | "section" | "line";
      /** Optional target that should open directly in User Note edit mode. */
      editTarget?: UserNoteTarget;
      sectionNotes: ResourceSectionNoteContent[];
      lineNote?: ResourceLineNoteContent;
    }
  | {
      /** Directory notes view. */
      kind: "directory";
      name: string;
      relativePath: string;
      projectRootName?: string;
      fileNote?: ResourceNoteContent;
      children: ResourceChildNotePreview[];
    };

/** Compact note content rendered by one Navigator list item. */
export type NavigatorNoteContent = ResourceNoteContent & {
  /** One-line preview shown in the list. */
  preview: string;
};

/** File note item rendered by the project-wide Files list. */
export type NavigatorFileItem = NavigatorNoteContent & {
  name: string;
  relativePath: string;
  resourceKind: "file" | "directory";
};

/** Section note item rendered by the current-file Sections list. */
export type NavigatorSectionItem = NavigatorNoteContent & {
  id: string;
  title: string;
  startLine: number;
  endLine: number;
};

/** Line note item rendered by the current-file Lines list. */
export type NavigatorLineItem = NavigatorNoteContent & {
  id: string;
  line: number;
};

/** Complete list data sent to Navigator Mode. */
export type NavigatorNotesViewModel =
  | { kind: "empty" }
  | { kind: "outsideRoot" }
  | {
      kind: "resource";
      projectRootName: string;
      currentFile?: string;
      files: NavigatorFileItem[];
      sections: NavigatorSectionItem[];
      lines: NavigatorLineItem[];
    };

/**
 * Message posted from the extension host to the React webview.
 *
 * @example
 * const message: ExtensionToWebviewMessage = {
 *   type: "resourceNotes",
 *   payload: { kind: "outsideRoot" },
 * };
 */
export type ExtensionToWebviewMessage =
  | {
      /** Message discriminator. */
      type: "resourceNotes";

      /** Notes payload to render. */
      payload: ResourceNotesViewModel;
    }
	  | {
	      /** Navigator list data for the current resource. */
	      type: "navigatorNotes";
	      payload: NavigatorNotesViewModel;
	    }
	  | {
	      /** Shows a CZaza-styled notice modal inside the webview. */
	      type: "notice";
	      notice: WebviewNotice;
	    }
	  | NotesViewModeMessage;

/** Mode selected by the VS Code notes View Toolbar. */
export type NotesViewMode = "detail" | "navigator";

/** Message that synchronizes the mode selected by the VS Code View Toolbar. */
export type NotesViewModeMessage = {
  /** Message discriminator. */
  type: "notesViewMode";

  /** Mode currently selected in the notes view. */
  mode: NotesViewMode;
};

/**
 * Message posted from the React webview to the extension host.
 *
 * @example
 * const message: WebviewToExtensionMessage = { type: "ready" };
 */
export type WebviewToExtensionMessage =
  | {
      /** Indicates that the React webview is ready for its initial payload. */
      type: "ready";
    }
  | {
      /** Requests combined file and section AI note generation. */
      type: "generateFileNotes";
    }
  | {
      /** Requests coordinated file, section, and line AI note generation. */
      type: "generateAllNotes";
    }
  | {
      /** Requests AI note generation for the active source line. */
      type: "generateLineNote";

      /** Whether to analyze only the active line or nearby candidates. */
      lineScope: "currentLine" | "nearbyLines";
    }
  | {
      /** Requests AI note regeneration for one selected section. */
      type: "generateSectionNote";

      /** Stable identifier of the selected section note. */
      sectionId: string;
    }
	  | {
	      /** Saves one complete file, section, or line user note. */
	      type: "saveUserNote";

      /** Note target captured when editing started. */
      target: UserNoteTarget;

	      /** Complete user-authored note content. */
	      userNote: string;
	    }
	  | {
	      /** Marks one stale note as content-current after user review. */
	      type: "clearNoteStaleStatus";

	      /** Note target whose content status should become current. */
	      target: UserNoteTarget;
	    }
	  | {
	      /** Marks a Navigator file-note item as content-current after review. */
	      type: "clearNavigatorFileStaleStatus";

	      /** CZaza-root-relative source path for the file note. */
	      relativePath: string;
	    }
	  | {
	      /** Opens or shows one resource selected from the Navigator Files list. */
	      type: "openNavigatorResource";

      /** CZaza-root-relative resource path. */
      relativePath: string;
    }
  | {
      /** Reveals one section selected from the Navigator Sections list. */
      type: "openNavigatorSection";

      /** Stable identifier of the selected section note. */
      sectionId: string;

      /** One-based inclusive first line. */
      startLine: number;

      /** One-based inclusive last line. */
      endLine: number;
    }
  | {
      /** Reveals one line selected from the Navigator Lines list. */
      type: "openNavigatorLine";

      /** One-based source line number. */
      line: number;
    }
  | {
      /** Indicates that the user selected a matched section. */
      type: "selectSection";

      /** Stable identifier of the selected section note. */
      sectionId: string;
    };
