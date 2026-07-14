/**
 * Provides the React-based notes webview for file and directory resources.
 */

import { readFile } from "node:fs/promises";

import * as vscode from "vscode";

import type { WorkspaceNoteStore } from "@vscode/notes";
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

/**
 * VS Code provider for the new React notes webview.
 *
 * @example
 * const provider = new NotesViewProvider(context.extensionUri, notes, generateFileNotes, saveUserNote);
 * vscode.window.registerWebviewViewProvider("czaza.notesView", provider);
 */
export class NotesViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private currentResourceUri?: vscode.Uri;
  private currentPayload?: ResourceNotesResult;
  private selectedSectionId?: string;
  private highlightedEditor?: vscode.TextEditor;
  private requestVersion = 0;
  private readonly generatingResources = new Set<string>();
  private readonly sectionDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(78, 161, 255, 0.10)",
  });
  private readonly extensionUri: vscode.Uri;
  private readonly notes: WorkspaceNoteStore;
  private readonly generateFileNotes: (uri: vscode.Uri) => Promise<boolean>;
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
  ) {
    this.extensionUri = extensionUri;
    this.notes = notes;
    this.generateFileNotes = generateFileNotes;
    this.saveUserNote = saveUserNote;
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
        void this.postCurrentResourceNotes();
        this.updateSectionHighlight();
        return;
      }

      if (message.type === "generateFileNotes") {
        void this.runFileNotesGeneration();
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
      this.selectedSectionId = undefined;
      this.clearSectionHighlight();
      await this.postCurrentResourceNotes();
      return;
    }

    await this.loadResourceNotes(targetUri, false, getActiveLine(targetUri));
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
    await this.postCurrentResourceNotes();
    this.updateSectionHighlight();
  }

  private async postCurrentResourceNotes(revealAiNotes = false): Promise<void> {
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
              ...(revealAiNotes ? { revealAiNotes: true } : {}),
            }
          : this.currentPayload,
    });
  }

  private async runFileNotesGeneration(): Promise<void> {
    const uri = this.currentResourceUri;

    if (!uri || this.currentPayload?.kind !== "file") {
      return;
    }

    const resourceKey = uri.toString();

    if (this.generatingResources.has(resourceKey)) {
      return;
    }

    this.generatingResources.add(resourceKey);
    await this.postCurrentResourceNotes();
    let revealAiNotes = false;

    try {
      const saved = await this.generateFileNotes(uri);
      revealAiNotes = saved;

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
    target?: unknown;
    userNote?: unknown;
  };

  return (
    candidate.type === "ready" ||
    candidate.type === "generateFileNotes" ||
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
