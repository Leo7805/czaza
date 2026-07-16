/**
 * Provides the React-based notes webview for file and directory resources.
 */

import { readFile } from "node:fs/promises";

import * as vscode from "vscode";

import type { WorkspaceNoteStore } from "@vscode/notes";
import {
  getNavigatorNotes,
  type NavigatorNotesResult,
} from "@vscode/services/getNavigatorNotesService";
import {
  getResourceNotes,
  type ResourceNotesResult,
  type ResourceSectionNoteContent,
} from "@vscode/services/getResourceNotesService";
import type { UserNoteTarget } from "@vscode/services/saveUserNoteService";

/**
 * Message posted by the React notes webview.
 */
type NotesWebviewMessage =
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
      /** Saves one file, section, or line user note. */
      type: "saveUserNote";

      /** Note target captured when editing started. */
      target: UserNoteTarget;

      /** Complete user-authored note content. */
      userNote: string;
    }
  | {
      /** Indicates that the user selected a matched section in the webview. */
      type: "selectSection";

      /** Stable identifier of the selected section note. */
      sectionId: string;
    };

type AiActionScope = "fileSection" | "all" | "section" | "line";

/** Mode selected by the VS Code notes View Toolbar. */
export type NotesViewMode = "detail" | "navigator";

/**
 * VS Code provider for the new React notes webview.
 *
 * @example
 * const provider = new NotesViewProvider(context.extensionUri, notes, generateFileNotes, saveUserNote);
 * vscode.window.registerWebviewViewProvider("czaza.notesView", provider);
 */
export class NotesViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private viewMode: NotesViewMode = "detail";
  private currentResourceUri?: vscode.Uri;
  private currentPayload?: ResourceNotesResult;
  private currentNavigatorPayload: NavigatorNotesResult = { kind: "empty" };
  private selectedSectionId?: string;
  private pendingEditTarget?: UserNoteTarget;
  private highlightedEditor?: vscode.TextEditor;
  private requestVersion = 0;
  private readonly generatingResources = new Map<string, AiActionScope>();
  private readonly sectionDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(78, 161, 255, 0.10)",
  });
  private readonly extensionUri: vscode.Uri;
  private readonly notes: WorkspaceNoteStore;
  private readonly generateFileNotes: (uri: vscode.Uri) => Promise<boolean>;
  private readonly generateAllNotes?: (uri: vscode.Uri) => Promise<boolean>;
  private readonly generateLineNote?: (uri: vscode.Uri, lineNumber: number) => Promise<boolean>;
  private readonly generateLineBatchNotes?: (uri: vscode.Uri, lineNumber: number) => Promise<boolean>;
  private readonly generateSectionNote?: (uri: vscode.Uri, sectionId: string) => Promise<boolean>;
  private readonly saveUserNote: (
    uri: vscode.Uri,
    target: UserNoteTarget,
    userNote: string,
  ) => Promise<void>;

  /**
   * Creates a notes webview provider.
   *
   * @param extensionUri - Current extension installation URI.
   * @param notes - Shared workspace note store.
   * @param generateFileNotes - Callback that generates and persists notes for one file.
   * @param saveUserNote - Callback that saves one file, section, or line user note.
   * @param generateAllNotes - Callback that generates and persists all three note levels.
   * @param generateLineNote - Callback that generates and persists the active line note.
   * @param generateLineBatchNotes - Callback that generates nearby line notes in one request.
   * @param generateSectionNote - Callback that regenerates one selected section note.
   *
   * @example
   * const provider = new NotesViewProvider(context.extensionUri, notes, generateFileNotes, saveUserNote);
   */
  constructor(
    extensionUri: vscode.Uri,
    notes: WorkspaceNoteStore,
    generateFileNotes: (uri: vscode.Uri) => Promise<boolean>,
    saveUserNote: (
      uri: vscode.Uri,
      target: UserNoteTarget,
      userNote: string,
    ) => Promise<void>,
    generateAllNotes?: (uri: vscode.Uri) => Promise<boolean>,
    generateLineNote?: (uri: vscode.Uri, lineNumber: number) => Promise<boolean>,
    generateSectionNote?: (uri: vscode.Uri, sectionId: string) => Promise<boolean>,
    generateLineBatchNotes?: (uri: vscode.Uri, lineNumber: number) => Promise<boolean>,
  ) {
    this.extensionUri = extensionUri;
    this.notes = notes;
    this.generateFileNotes = generateFileNotes;
    this.saveUserNote = saveUserNote;
    this.generateAllNotes = generateAllNotes;
    this.generateLineNote = generateLineNote;
    this.generateSectionNote = generateSectionNote;
    this.generateLineBatchNotes = generateLineBatchNotes;
  }

  /**
   * Called by VS Code when the notes webview is first shown.
   *
   * @param webviewView - VS Code webview view instance.
   * @returns Promise that resolves after the HTML shell is loaded.
   *
   * @example
   * await provider.resolveWebviewView(webviewView);
   */
  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };

    webviewView.webview.html = await this.getReactWebviewHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (!isNotesWebviewMessage(message)) {
        return;
      }

      if (message.type === "ready") {
        this.selectedSectionId = selectCurrentSectionId(this.currentPayload, undefined);
        if (this.pendingEditTarget?.level === "section") {
          this.selectedSectionId = this.pendingEditTarget.sectionId;
        }
        void this.postCurrentResourceNotes();
        void this.postCurrentNavigatorNotes();
        this.postViewMode(this.viewMode);
        this.updateSectionHighlight();
        return;
      }

      if (message.type === "generateFileNotes") {
        void this.runNotesGeneration("fileSection");
        return;
      }

      if (message.type === "generateAllNotes") {
        void this.runNotesGeneration("all");
        return;
      }

      if (message.type === "generateLineNote") {
        void this.runLineNoteGeneration(message.lineScope);
        return;
      }

      if (message.type === "generateSectionNote") {
        void this.runSectionNoteGeneration(message.sectionId);
        return;
      }

      if (message.type === "saveUserNote") {
        void this.runUserNoteSave(message.target, message.userNote);
        return;
      }

      this.selectSection(message.sectionId);
    });

    webviewView.onDidDispose(() => {
      this.clearSectionHighlight();

      if (this.view === webviewView) {
        this.view = undefined;
      }
    });
  }

  /**
   * Sends the current View Toolbar mode to the React webview.
   *
   * @param mode - Detail or Navigator mode selected by the extension command.
   */
  postViewMode(mode: NotesViewMode): void {
    this.viewMode = mode;
    void this.view?.webview.postMessage({ type: "notesViewMode", mode });
    if (mode === "navigator") {
      void this.loadNavigatorNotes();
    }
  }

  /**
   * Shows notes for one selected resource.
   *
   * @param uri - File or directory selected in VS Code.
   * @returns Promise that resolves after posting the notes payload when possible.
   *
   * @example
   * await provider.showResourceNotes(uri);
   */
  async showResourceNotes(uri?: vscode.Uri): Promise<void> {
    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;

    if (!targetUri) {
      this.requestVersion += 1;
      this.currentResourceUri = undefined;
      this.currentPayload = undefined;
      this.currentNavigatorPayload = { kind: "empty" };
      this.selectedSectionId = undefined;
      this.clearSectionHighlight();
      await this.postCurrentResourceNotes();
      return;
    }

    await this.loadResourceNotes(targetUri, false, getActiveLine(targetUri));
  }

  /**
   * Opens one file, section, or line note directly in the webview User editor.
   *
   * @param uri - Source document that owns the note.
   * @param target - Existing or newly created note target.
   * @returns Promise that resolves after the target payload is posted when the
   * webview is available.
   *
   * @example
   * await provider.openUserNoteEditor(document.uri, { level: "line", line: 12 });
   */
  async openUserNoteEditor(uri: vscode.Uri, target: UserNoteTarget): Promise<void> {
    await this.loadResourceNotes(uri, false, getActiveLine(uri));
    this.pendingEditTarget = target;

    if (target.level === "section" && this.currentPayload?.kind === "file") {
      this.selectedSectionId = target.sectionId;
    }

    await this.postCurrentResourceNotes();
    this.updateSectionHighlight();
  }

  /**
   * Follows an active file without replacing the current preview for resources
   * outside the configured CZaza root.
   *
   * @param uri - URI of the active VS Code text document.
   * @param activeLine - Optional one-based active editor line.
   * @returns Promise that resolves after the preview has been loaded and posted.
   *
   * @example
   * await provider.showActiveDocumentNotes(editor.document.uri);
   */
  async showActiveDocumentNotes(uri: vscode.Uri, activeLine?: number): Promise<void> {
    if (uri.scheme !== "file") {
      return;
    }

    await this.loadResourceNotes(uri, true, activeLine);
  }

  /**
   * Releases the editor decoration owned by this provider.
   *
   * @example
   * provider.dispose();
   */
  dispose(): void {
    this.clearSectionHighlight();
    this.sectionDecorationType.dispose();
  }

  private async loadResourceNotes(
    uri: vscode.Uri,
    ignoreOutsideRoot: boolean,
    activeLine?: number,
  ): Promise<void> {
    const requestVersion = ++this.requestVersion;
    const payload = await getResourceNotes({
      uri,
      notes: this.notes,
      ...(activeLine ? { activeLine } : {}),
    });

    if (requestVersion !== this.requestVersion) {
      return;
    }

    if (ignoreOutsideRoot && payload.kind === "outsideRoot") {
      this.currentNavigatorPayload = { kind: "outsideRoot" };
      this.clearSectionHighlight();
      return;
    }

    const resourceChanged = this.currentResourceUri?.toString() !== uri.toString();
    this.currentResourceUri = uri;
    this.currentPayload = payload;
    this.selectedSectionId = selectCurrentSectionId(
      payload,
      resourceChanged ? undefined : this.selectedSectionId,
    );
    if (this.viewMode === "navigator") {
      await this.loadNavigatorNotes();
    }
    await this.postCurrentResourceNotes();
    this.updateSectionHighlight();
  }

  private async postCurrentResourceNotes(
    revealAiNotes?: "fileSection" | "all" | "section" | "line",
  ): Promise<void> {
    if (!this.view) {
      return;
    }

    if (!this.currentResourceUri || !this.currentPayload) {
      await this.view.webview.postMessage({
        type: "resourceNotes",
        payload: {
          kind: "empty",
          message: "Select a file or directory to view CZaza notes.",
        },
      });
      return;
    }

    await this.view.webview.postMessage({
      type: "resourceNotes",
      payload:
        this.currentPayload.kind === "file"
          ? {
              ...this.currentPayload,
              isAiActionRunning: this.generatingResources.has(this.currentResourceUri.toString()),
              ...(this.generatingResources.has(this.currentResourceUri.toString())
                ? {
                    aiActionRunningScope: this.generatingResources.get(
                      this.currentResourceUri.toString(),
                    ),
                  }
                : {}),
              ...(revealAiNotes ? { revealAiNotes } : {}),
              ...(this.pendingEditTarget ? { editTarget: this.pendingEditTarget } : {}),
            }
          : this.currentPayload,
    });

    this.pendingEditTarget = undefined;
  }

  private async loadNavigatorNotes(): Promise<void> {
    this.currentNavigatorPayload = await getNavigatorNotes({
      uri: this.currentResourceUri,
      notes: this.notes,
    });
    await this.postCurrentNavigatorNotes();
  }

  private async postCurrentNavigatorNotes(): Promise<void> {
    if (!this.view) {
      return;
    }

    await this.view.webview.postMessage({
      type: "navigatorNotes",
      payload: this.currentNavigatorPayload,
    });
  }

  private async runNotesGeneration(scope: "fileSection" | "all"): Promise<void> {
    const uri = this.currentResourceUri;

    if (!uri || this.currentPayload?.kind !== "file") {
      return;
    }

    const generateNotes = scope === "all" ? this.generateAllNotes : this.generateFileNotes;

    if (!generateNotes) {
      return;
    }

    if (scope === "all") {
      const selectedAction = await vscode.window.showWarningMessage(
        "All Notes generation may take longer and use more AI tokens.",
        { modal: true },
        "Generate All Notes",
      );

      if (selectedAction !== "Generate All Notes") {
        return;
      }
    }

    const resourceKey = uri.toString();

    if (this.generatingResources.has(resourceKey)) {
      return;
    }

    this.generatingResources.set(resourceKey, scope);
    await this.postCurrentResourceNotes();
    let revealAiNotes: "fileSection" | "all" | undefined;

    try {
      const saved = await generateNotes(uri);
      revealAiNotes = saved ? scope : undefined;

      if (saved && this.currentResourceUri?.toString() === resourceKey) {
        await this.loadResourceNotes(uri, false, getActiveLine(uri));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      void vscode.window.showErrorMessage(`Failed to generate CZaza notes: ${message}`);
    } finally {
      this.generatingResources.delete(resourceKey);

      if (this.currentResourceUri?.toString() === resourceKey) {
        await this.postCurrentResourceNotes(revealAiNotes);
      }
    }
  }

  private async runSectionNoteGeneration(sectionId: string): Promise<void> {
    const uri = this.currentResourceUri;

    if (
      !uri ||
      this.currentPayload?.kind !== "file" ||
      !this.generateSectionNote ||
      !this.currentPayload.sectionNotes.some((section) => section.id === sectionId)
    ) {
      return;
    }

    const resourceKey = uri.toString();

    if (this.generatingResources.has(resourceKey)) {
      return;
    }

    this.generatingResources.set(resourceKey, "section");
    await this.postCurrentResourceNotes();
    let revealAiNotes: "section" | undefined;

    try {
      const saved = await this.generateSectionNote(uri, sectionId);
      revealAiNotes = saved ? "section" : undefined;

      if (saved && this.currentResourceUri?.toString() === resourceKey) {
        await this.loadResourceNotes(uri, false, getActiveLine(uri));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      void vscode.window.showErrorMessage(`Failed to generate CZaza notes: ${message}`);
    } finally {
      this.generatingResources.delete(resourceKey);

      if (this.currentResourceUri?.toString() === resourceKey) {
        await this.postCurrentResourceNotes(revealAiNotes);
      }
    }
  }

  private async runLineNoteGeneration(
    scope: "currentLine" | "nearbyLines",
  ): Promise<void> {
    const uri = this.currentResourceUri;
    const lineNumber = this.currentPayload?.kind === "file" ? this.currentPayload.activeLine : undefined;
    const generateLineNotes =
      scope === "nearbyLines" ? this.generateLineBatchNotes : this.generateLineNote;

    if (!uri || !lineNumber || !generateLineNotes) {
      return;
    }

    const resourceKey = uri.toString();

    if (this.generatingResources.has(resourceKey)) {
      return;
    }

    this.generatingResources.set(resourceKey, "line");
    await this.postCurrentResourceNotes();
    let revealAiNotes: "line" | undefined;

    try {
      const saved = await generateLineNotes(uri, lineNumber);
      revealAiNotes = saved ? "line" : undefined;

      if (saved && this.currentResourceUri?.toString() === resourceKey) {
        await this.loadResourceNotes(uri, false, getActiveLine(uri));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      void vscode.window.showErrorMessage(`Failed to generate CZaza notes: ${message}`);
    } finally {
      this.generatingResources.delete(resourceKey);

      if (this.currentResourceUri?.toString() === resourceKey) {
        await this.postCurrentResourceNotes(revealAiNotes);
      }
    }
  }

  private async runUserNoteSave(target: UserNoteTarget, userNote: string): Promise<void> {
    const uri = this.currentResourceUri;

    if (
      !uri ||
      (this.currentPayload?.kind !== "file" && this.currentPayload?.kind !== "directory")
    ) {
      return;
    }

    const resourceKey = uri.toString();

    try {
      await this.saveUserNote(uri, target, userNote);

      if (this.currentResourceUri?.toString() === resourceKey) {
        await this.loadResourceNotes(uri, false, getActiveLine(uri));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      void vscode.window.showErrorMessage(`Failed to save CZaza user note: ${message}`);
    }
  }

  private selectSection(sectionId: string): void {
    if (this.currentPayload?.kind !== "file") {
      return;
    }

    if (!this.currentPayload.sectionNotes.some((section) => section.id === sectionId)) {
      return;
    }

    this.selectedSectionId = sectionId;
    this.updateSectionHighlight();
  }

  private updateSectionHighlight(): void {
    const editor = vscode.window.activeTextEditor;
    const section = getSelectedSection(this.currentPayload, this.selectedSectionId);

    if (
      !this.view ||
      !editor ||
      !this.currentResourceUri ||
      editor.document.uri.toString() !== this.currentResourceUri.toString() ||
      !section
    ) {
      this.clearSectionHighlight();
      return;
    }

    const startLine = Math.max(0, section.startLine - 1);
    const endLine = Math.min(editor.document.lineCount - 1, section.endLine - 1);

    if (startLine > endLine) {
      this.clearSectionHighlight();
      return;
    }

    const endCharacter = editor.document.lineAt(endLine).text.length;
    const range = new vscode.Range(startLine, 0, endLine, endCharacter);

    if (this.highlightedEditor && this.highlightedEditor !== editor) {
      this.highlightedEditor.setDecorations(this.sectionDecorationType, []);
    }

    this.highlightedEditor = editor;
    editor.setDecorations(this.sectionDecorationType, [range]);
  }

  private clearSectionHighlight(): void {
    this.highlightedEditor?.setDecorations(this.sectionDecorationType, []);
    this.highlightedEditor = undefined;
  }

  private async getReactWebviewHtml(webview: vscode.Webview): Promise<string> {
    const webviewRoot = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const indexUri = vscode.Uri.joinPath(webviewRoot, "index.html");
    const rawHtml = await readFile(indexUri.fsPath, "utf-8");

    return rawHtml
      .replace(/(src|href)="\.\/([^"]+)"/g, (_match, attribute: string, assetPath: string) => {
        const assetUri = vscode.Uri.joinPath(webviewRoot, ...assetPath.split("/"));
        return `${attribute}="${webview.asWebviewUri(assetUri).toString()}"`;
      });
  }
}

function isNotesWebviewMessage(message: unknown): message is NotesWebviewMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as {
    type?: unknown;
    sectionId?: unknown;
    lineScope?: unknown;
    target?: unknown;
    userNote?: unknown;
  };

  return (
    candidate.type === "ready" ||
    candidate.type === "generateFileNotes" ||
    candidate.type === "generateAllNotes" ||
    (candidate.type === "generateLineNote" &&
      (candidate.lineScope === "currentLine" || candidate.lineScope === "nearbyLines")) ||
    (candidate.type === "generateSectionNote" && typeof candidate.sectionId === "string") ||
    (candidate.type === "saveUserNote" &&
      isUserNoteTarget(candidate.target) &&
      typeof candidate.userNote === "string") ||
    (candidate.type === "selectSection" && typeof candidate.sectionId === "string")
  );
}

function isUserNoteTarget(value: unknown): value is UserNoteTarget {
  if (!value || typeof value !== "object") {
    return false;
  }

  const target = value as { level?: unknown; sectionId?: unknown; line?: unknown };

  return (
    target.level === "file" ||
    (target.level === "section" && typeof target.sectionId === "string") ||
    (target.level === "line" && Number.isInteger(target.line) && Number(target.line) > 0)
  );
}

function selectCurrentSectionId(
  payload: ResourceNotesResult | undefined,
  selectedSectionId: string | undefined,
): string | undefined {
  if (payload?.kind !== "file") {
    return undefined;
  }

  if (
    selectedSectionId &&
    payload.sectionNotes.some((section) => section.id === selectedSectionId)
  ) {
    return selectedSectionId;
  }

  return payload.sectionNotes[0]?.id;
}

function getSelectedSection(
  payload: ResourceNotesResult | undefined,
  selectedSectionId: string | undefined,
): ResourceSectionNoteContent | undefined {
  if (payload?.kind !== "file") {
    return undefined;
  }

  return payload.sectionNotes.find((section) => section.id === selectedSectionId);
}

function getActiveLine(uri: vscode.Uri): number | undefined {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.uri.toString() !== uri.toString()) {
    return undefined;
  }

  return editor.selection.active.line + 1;
}
