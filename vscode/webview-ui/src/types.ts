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
      fileNote?: ResourceNoteContent;
      aiAction: "generate" | "regenerate";
      activeLine?: number;
      isAiActionRunning?: boolean;
      revealAiNotes?: boolean;
      sectionNotes: ResourceSectionNoteContent[];
      lineNote?: ResourceLineNoteContent;
    }
  | {
      /** Directory notes view. */
      kind: "directory";
      name: string;
      relativePath: string;
      fileNote?: ResourceNoteContent;
      children: ResourceChildNotePreview[];
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
export type ExtensionToWebviewMessage = {
  /** Message discriminator. */
  type: "resourceNotes";

  /** Notes payload to render. */
  payload: ResourceNotesViewModel;
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
      /** Saves one complete file, section, or line user note. */
      type: "saveUserNote";

      /** Note target captured when editing started. */
      target: UserNoteTarget;

      /** Complete user-authored note content. */
      userNote: string;
    }
  | {
      /** Indicates that the user selected a matched section. */
      type: "selectSection";

      /** Stable identifier of the selected section note. */
      sectionId: string;
    };
