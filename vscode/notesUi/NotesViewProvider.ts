/**
 * Provides the React-based notes webview for file and directory resources.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";

import * as vscode from "vscode";

import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { ensureFileNoteResourceAvailability } from "@vscode/services/ensureFileNoteResourceAvailabilityService";
import {
  getNavigatorNotes,
  type NavigatorNotesResult,
} from "@vscode/services/getNavigatorNotesService";
import {
  getResourceNotes,
  type ResourceNotesResult,
  type ResourceSectionNoteContent,
} from "@vscode/services/getResourceNotesService";
import { getStoredNavigatorFileNotes } from "@vscode/services/getStoredNavigatorFileNotesService";
import { clearNoteStaleStatusService } from "@vscode/services/clearNoteStaleStatusService";
import { deleteNavigatorFileNotesService } from "@vscode/services/deleteNavigatorFileNotesService";
import { deleteNavigatorLineNoteService } from "@vscode/services/deleteNavigatorLineNoteService";
import { deleteNavigatorSectionNoteService } from "@vscode/services/deleteNavigatorSectionNoteService";
import { markNavigatorFileNoteOrphanedService } from "@vscode/services/markNavigatorFileNoteOrphanedService";
import { relocateNavigatorFileNoteService } from "@vscode/services/relocateNavigatorFileNoteService";
import {
  AllNotesBatchRequiredError,
  AllNotesLineLimitError,
} from "@vscode/services/generateAllNotesService";
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
      /** Runs one explicitly supported action from a notice modal. */
      type: "runNoticeAction";
      action: "openMaxAnalysisLinesSetting" | "confirmBatchedAllNotes";
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
	      /** Marks one stale note as content-current after user review. */
	      type: "clearNoteStaleStatus";

	      /** Note target captured from the current note card. */
	      target: UserNoteTarget;
	    }
	  | {
	      /** Marks one Navigator file-note item as content-current after review. */
	      type: "clearNavigatorFileStaleStatus";

	      /** CZaza-root-relative source path for the file note. */
	      relativePath: string;
	    }
  | {
      /** Opens the detail notes view for one Navigator file-note item. */
      type: "viewNavigatorFileNotes";

      /** CZaza-root-relative source path for the file note. */
      relativePath: string;

      /** Current anchor status from the Navigator row. */
      anchor: "confirmed" | "needsConfirmation" | "orphaned";
    }
  | {
      /** Relocates one Navigator file-note item to a user-confirmed source path. */
      type: "relocateNavigatorFileNote";

      /** Existing CZaza-root-relative source path. */
      fromRelativePath: string;

      /** New CZaza-root-relative source path. */
      toRelativePath: string;
    }
  | {
      /** Starts active-editor path suggestions for the Navigator relocate modal. */
      type: "startNavigatorFileRelocatePathSync";
    }
  | {
      /** Stops active-editor path suggestions for the Navigator relocate modal. */
      type: "stopNavigatorFileRelocatePathSync";
    }
  | {
      /** Marks one Navigator file-note item as orphaned after confirmation. */
      type: "markNavigatorFileNoteOrphaned";

      /** CZaza-root-relative source path for the file note. */
      relativePath: string;
    }
  | {
      /** Deletes all stored notes for one Navigator file-note item. */
      type: "deleteNavigatorFileNotes";

      /** CZaza-root-relative source path for the notes bundle. */
      relativePath: string;
    }
  | {
      /** Deletes one section note from the current Navigator resource. */
      type: "deleteNavigatorSectionNote";

      /** Stable section note id. */
      sectionId: string;
    }
  | {
      /** Deletes one line note from the current Navigator resource. */
      type: "deleteNavigatorLineNote";

      /** Stable line note id. */
      lineId: string;
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
      /** Indicates that the user selected a matched section in the webview. */
      type: "selectSection";

      /** Stable identifier of the selected section note. */
      sectionId: string;
    };

type AiActionScope = "fileSection" | "all" | "section" | "line";

/** Mode selected by the VS Code notes View Toolbar. */
export type NotesViewMode = "detail" | "navigator";

const NOTES_VIEW_MODE_CONTEXT = "czaza.notesViewMode";

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
  private isNavigatorRelocatePathSyncActive = false;
  private requestVersion = 0;
  private readonly generatingResources = new Map<string, AiActionScope>();
  private readonly sectionDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(78, 161, 255, 0.10)",
  });
  private readonly extensionUri: vscode.Uri;
  private readonly notes: WorkspaceNoteStore;
  private readonly generateFileNotes: (uri: vscode.Uri) => Promise<boolean>;
  private readonly generateAllNotes?: (
    uri: vscode.Uri,
    options?: { allowBatching?: boolean },
  ) => Promise<boolean>;
  private readonly generateLineNote?: (uri: vscode.Uri, lineNumber: number) => Promise<boolean>;
  private readonly generateLineBatchNotes?: (
    uri: vscode.Uri,
    lineNumber: number,
  ) => Promise<boolean>;
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
    saveUserNote: (uri: vscode.Uri, target: UserNoteTarget, userNote: string) => Promise<void>,
    generateAllNotes?: (
      uri: vscode.Uri,
      options?: { allowBatching?: boolean },
    ) => Promise<boolean>,
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

      if (message.type === "runNoticeAction") {
        if (message.action === "openMaxAnalysisLinesSetting") {
          void vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "@id:czaza.ai.maxAnalysisLines",
          );
        } else {
          void this.runNotesGeneration("all", true);
        }
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

	      if (message.type === "clearNoteStaleStatus") {
	        void this.runClearNoteStaleStatus(message.target);
	        return;
	      }

	      if (message.type === "clearNavigatorFileStaleStatus") {
	        void this.runClearNavigatorFileStaleStatus(message.relativePath);
	        return;
	      }

      if (message.type === "viewNavigatorFileNotes") {
        void this.viewNavigatorFileNotes(message.relativePath, message.anchor);
        return;
      }

      if (message.type === "relocateNavigatorFileNote") {
        void this.runRelocateNavigatorFileNote(message.fromRelativePath, message.toRelativePath);
        return;
      }

      if (message.type === "startNavigatorFileRelocatePathSync") {
        this.isNavigatorRelocatePathSyncActive = true;
        return;
      }

      if (message.type === "stopNavigatorFileRelocatePathSync") {
        this.isNavigatorRelocatePathSyncActive = false;
        return;
      }

      if (message.type === "markNavigatorFileNoteOrphaned") {
        void this.runMarkNavigatorFileNoteOrphaned(message.relativePath);
        return;
      }

      if (message.type === "deleteNavigatorFileNotes") {
        void this.runDeleteNavigatorFileNotes(message.relativePath);
        return;
      }

      if (message.type === "deleteNavigatorSectionNote") {
        void this.runDeleteNavigatorSectionNote(message.sectionId);
        return;
      }

      if (message.type === "deleteNavigatorLineNote") {
        void this.runDeleteNavigatorLineNote(message.lineId);
        return;
      }

      if (message.type === "openNavigatorResource") {
        void this.openNavigatorResource(message.relativePath);
        return;
      }

      if (message.type === "openNavigatorSection") {
        void this.openNavigatorSection(message.sectionId, message.startLine, message.endLine);
        return;
      }

      if (message.type === "openNavigatorLine") {
        void this.openNavigatorLine(message.line);
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
    void vscode.commands.executeCommand("setContext", NOTES_VIEW_MODE_CONTEXT, mode);
    void this.view?.webview.postMessage({ type: "notesViewMode", mode });
    if (mode === "navigator") {
      void this.loadNavigatorNotes();
    }
  }

  /** Opens the emoji picker for the most recently focused note editor. */
  openEmojiPicker(): void {
    void this.view?.webview.postMessage({ type: "openEmojiPicker" });
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
    this.postViewMode("detail");

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
    await this.postActiveNavigatorRelocateTargetPath(uri);
  }

  /**
   * Reloads the currently tracked notes payload after the underlying store changes.
   *
   * @param fallbackUri - Optional resource URI used when the provider has not
   * tracked a resource yet.
   * @returns Promise that resolves after the visible payload is refreshed.
   */
  async refreshCurrentNotes(fallbackUri?: vscode.Uri): Promise<void> {
    const targetUri = this.currentResourceUri ?? fallbackUri ?? vscode.window.activeTextEditor?.document.uri;

    if (!targetUri) {
      await this.postCurrentResourceNotes();
      return;
    }

    await this.loadResourceNotes(targetUri, false, getActiveLine(targetUri));
  }

  /**
   * Refreshes notes after a tracked source resource is renamed or moved.
   *
   * @param previousUri - Resource URI before the move.
   * @param nextUri - Resource URI after the move.
   * @returns Promise that resolves after the visible payload is refreshed.
   */
  async refreshAfterResourceMove(previousUri: vscode.Uri, nextUri: vscode.Uri): Promise<void> {
    const targetUri =
      this.currentResourceUri?.toString() === previousUri.toString()
        ? nextUri
        : this.currentResourceUri ?? nextUri;

    await this.loadResourceNotes(targetUri, false, getActiveLine(targetUri));
  }

  /**
   * Refreshes notes after a tracked source resource is deleted.
   *
   * @param deletedUri - Deleted source resource URI.
   * @returns Promise that resolves after the visible payload is refreshed.
   */
  async refreshAfterResourceDelete(deletedUri: vscode.Uri): Promise<void> {
    const targetUri =
      this.currentResourceUri?.toString() === deletedUri.toString()
        ? vscode.Uri.file(path.dirname(deletedUri.fsPath))
        : this.currentResourceUri ?? vscode.Uri.file(path.dirname(deletedUri.fsPath));

    await this.loadResourceNotes(targetUri, false, getActiveLine(targetUri));
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
          : this.currentPayload.kind === "binary" && this.pendingEditTarget?.level === "file"
            ? { ...this.currentPayload, editTarget: this.pendingEditTarget }
            : this.currentPayload,
    });

    this.pendingEditTarget = undefined;
  }

  private async loadNavigatorNotes(): Promise<void> {
    const activeLine =
      this.currentPayload?.kind === "file"
        ? (this.currentPayload.activeLine ??
          (this.currentResourceUri ? getActiveLine(this.currentResourceUri) : undefined))
        : this.currentResourceUri
          ? getActiveLine(this.currentResourceUri)
          : undefined;

    this.currentNavigatorPayload = await getNavigatorNotes({
      uri: this.currentResourceUri,
      notes: this.notes,
      selectedSectionId: this.selectedSectionId,
      activeLine,
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

  private async postNotice(input: {
    tone: "info" | "warning" | "error" | "success";
    title: string;
    message: string;
    actionLabel?: string;
    actions?: Array<{
      label: string;
      variant?: "primary" | "secondary";
      action?: "openMaxAnalysisLinesSetting" | "confirmBatchedAllNotes";
    }>;
  }): Promise<void> {
    await this.view?.webview.postMessage({
      type: "notice",
      notice: {
        tone: input.tone,
        title: input.title,
        message: input.message,
        actions: input.actions ?? [
          {
            label: input.actionLabel ?? "Close",
            variant: "primary",
          },
        ],
      },
    });
  }

  private async openNavigatorResource(relativePath: string): Promise<void> {
    const currentUri = this.currentResourceUri;

    if (!currentUri || !isSafeRelativePath(relativePath)) {
      return;
    }

    try {
      const { rootDirectory } = resolveCzazaRootDirectory(currentUri);
      const settings = getCzazaSettings(currentUri);
      const targetUri = vscode.Uri.file(path.join(rootDirectory, ...relativePath.split("/")));
      const availability = await ensureFileNoteResourceAvailability({
        notes: this.notes,
        workspaceRoot: rootDirectory,
        outputDirectory: settings.outputDirectory,
        relativePath,
        now: new Date().toISOString(),
      });

      if (!availability.available) {
        await this.loadNavigatorNotes();
        await this.postNotice({
          tone: "error",
          title: "Note Target Not Found",
          message: `${relativePath} could not be opened. It may have been renamed, moved, or deleted outside VS Code.`,
        });
        return;
      }

      const resourceKind = await getResourceKind(targetUri);

      if (resourceKind === "directory") {
        await vscode.commands.executeCommand("revealInExplorer", targetUri);
        return;
      }

      try {
        const document = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(document, { preview: false });
        await this.loadResourceNotes(targetUri, false, getActiveLine(targetUri));
      } catch {
        await vscode.commands.executeCommand("revealInExplorer", targetUri);
        await vscode.commands.executeCommand("vscode.open", targetUri, { preview: false });
        await this.loadResourceNotes(targetUri, false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      void vscode.window.showErrorMessage(`Failed to open CZaza navigator resource: ${message}`);
    }
  }

  private async openNavigatorResourceNotes(relativePath: string): Promise<void> {
    const currentUri = this.currentResourceUri;

    if (!currentUri || !isSafeRelativePath(relativePath)) {
      return;
    }

    try {
      const { rootDirectory } = resolveCzazaRootDirectory(currentUri);
      const settings = getCzazaSettings(currentUri);
      const targetUri = vscode.Uri.file(path.join(rootDirectory, ...relativePath.split("/")));
      const availability = await ensureFileNoteResourceAvailability({
        notes: this.notes,
        workspaceRoot: rootDirectory,
        outputDirectory: settings.outputDirectory,
        relativePath,
        now: new Date().toISOString(),
      });

      if (!availability.available) {
        await this.loadNavigatorNotes();
        await this.postNotice({
          tone: "error",
          title: "Note Target Not Found",
          message: `${relativePath} could not be opened. It may have been renamed, moved, or deleted outside VS Code.`,
        });
        return;
      }

      const resourceKind = await getResourceKind(targetUri);

      this.postViewMode("detail");

      if (resourceKind === "directory") {
        await this.loadResourceNotes(targetUri, false);
        return;
      }

      const document = await vscode.workspace.openTextDocument(targetUri);
      await vscode.window.showTextDocument(document, { preview: false });
      await this.loadResourceNotes(targetUri, false, getActiveLine(targetUri));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      void vscode.window.showErrorMessage(`Failed to view CZaza navigator notes: ${message}`);
    }
  }

  private async openNavigatorSection(
    sectionId: string,
    startLine: number,
    endLine: number,
  ): Promise<void> {
    const uri = this.currentResourceUri;

    if (this.currentPayload?.kind !== "file" || !uri || !isValidLineRange(startLine, endLine)) {
      return;
    }

    try {
      const editor = await this.openCurrentResourceEditor(uri);
      const targetLine = Math.min(Math.max(startLine - 1, 0), editor.document.lineCount - 1);
      const position = new vscode.Position(targetLine, 0);
      const range = new vscode.Range(position, position);

      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      this.selectedSectionId = sectionId;
      await this.loadResourceNotes(uri, false, startLine);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      void vscode.window.showErrorMessage(`Failed to reveal CZaza section: ${message}`);
    }
  }

  private async openNavigatorLine(line: number): Promise<void> {
    const uri = this.currentResourceUri;

    if (this.currentPayload?.kind !== "file" || !uri || !isPositiveLine(line)) {
      return;
    }

    try {
      const editor = await this.openCurrentResourceEditor(uri);
      const targetLine = Math.min(Math.max(line - 1, 0), editor.document.lineCount - 1);
      const position = new vscode.Position(targetLine, 0);
      const range = new vscode.Range(position, position);

      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      await this.loadResourceNotes(uri, false, line);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      void vscode.window.showErrorMessage(`Failed to reveal CZaza line: ${message}`);
    }
  }

  private async openCurrentResourceEditor(uri: vscode.Uri): Promise<vscode.TextEditor> {
    return vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()
      ? vscode.window.activeTextEditor
      : await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), {
          preview: false,
        });
  }

  private async runNotesGeneration(
    scope: "fileSection" | "all",
    allowBatching = false,
  ): Promise<void> {
    const uri = this.currentResourceUri;

    if (!uri || this.currentPayload?.kind !== "file") {
      return;
    }

    const generateNotes = scope === "all" ? this.generateAllNotes : this.generateFileNotes;

    if (!generateNotes) {
      return;
    }

    const resourceKey = uri.toString();

    if (this.generatingResources.has(resourceKey)) {
      return;
    }

    this.generatingResources.set(resourceKey, scope);
    await this.postCurrentResourceNotes();
    let revealAiNotes: "fileSection" | "all" | undefined;

    try {
      const saved =
        scope === "all" && allowBatching
          ? await this.generateAllNotes?.(uri, { allowBatching: true })
          : await generateNotes(uri);
      revealAiNotes = saved ? scope : undefined;

      if (saved && this.currentResourceUri?.toString() === resourceKey) {
        await this.loadResourceNotes(uri, false, getActiveLine(uri));
      }
    } catch (error) {
      if (error instanceof AllNotesBatchRequiredError) {
        await this.postNotice({
          tone: "info",
          title: "Batch AI Analysis Required",
          message: `This file contains ${error.sourceLineCount} lines, of which ${error.candidateLineCount} require AI analysis. The selected model and CZaza allow ${error.effectiveOutputLimit.toLocaleString("en-US")} output tokens per request, so CZaza will use ${error.batchCount} sequential batches and merge them after every batch succeeds.`,
          actions: [
            {
              label: "Continue",
              variant: "primary",
              action: "confirmBatchedAllNotes",
            },
            { label: "Cancel", variant: "secondary" },
          ],
        });
      } else if (error instanceof AllNotesLineLimitError) {
        await this.postNotice({
          tone: "warning",
          title: "AI Analysis Line Limit Exceeded",
          message: `This file contains ${error.sourceLineCount} lines, of which ${error.candidateLineCount} require AI analysis. The current limit is ${error.maxCandidateLines}. Increase “CZaza › AI: Max Analysis Lines” in VS Code Settings and try again.`,
          actions: [
            {
              label: "Open Settings",
              variant: "primary",
              action: "openMaxAnalysisLinesSetting",
            },
            { label: "Close", variant: "secondary" },
          ],
        });
      } else {
        const message = error instanceof Error ? error.message : "Unknown error.";
        void vscode.window.showErrorMessage(`Failed to generate CZaza notes: ${message}`);
      }
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

  private async runLineNoteGeneration(scope: "currentLine" | "nearbyLines"): Promise<void> {
    const uri = this.currentResourceUri;
    const lineNumber =
      this.currentPayload?.kind === "file" ? this.currentPayload.activeLine : undefined;
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
      (this.currentPayload?.kind !== "file" &&
        this.currentPayload?.kind !== "binary" &&
        this.currentPayload?.kind !== "directory")
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

  private async runClearNoteStaleStatus(target: UserNoteTarget): Promise<void> {
	    const uri = this.currentResourceUri;

	    if (
	      !uri ||
      (this.currentPayload?.kind !== "file" &&
        this.currentPayload?.kind !== "binary" &&
        this.currentPayload?.kind !== "directory")
	    ) {
	      return;
	    }

	    const resourceKey = uri.toString();

	    try {
	      const changed = await clearNoteStaleStatusService({ uri, notes: this.notes, target });

	      if (changed && this.currentResourceUri?.toString() === resourceKey) {
	        await this.loadResourceNotes(uri, false, getActiveLine(uri));
	      }
	    } catch (error) {
	      const message = error instanceof Error ? error.message : "Unknown error.";
	      void vscode.window.showErrorMessage(`Failed to clear CZaza stale status: ${message}`);
	    }
  }

  private async runClearNavigatorFileStaleStatus(relativePath: string): Promise<void> {
    const currentUri = this.currentResourceUri;

    if (!currentUri || !isSafeRelativePath(relativePath)) {
      return;
    }

    try {
      const { rootDirectory } = resolveCzazaRootDirectory(currentUri);
      const targetUri = vscode.Uri.file(path.join(rootDirectory, ...relativePath.split("/")));
      const changed = await clearNoteStaleStatusService({
        uri: targetUri,
        notes: this.notes,
        target: { level: "file" },
      });

      if (changed) {
        await this.loadNavigatorNotes();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      void vscode.window.showErrorMessage(`Failed to clear CZaza navigator stale status: ${message}`);
    }
  }

  private async viewNavigatorFileNotes(
    relativePath: string,
    anchor: "confirmed" | "needsConfirmation" | "orphaned",
  ): Promise<void> {
    const currentUri = this.currentResourceUri;

    if (!currentUri || !isSafeRelativePath(relativePath)) {
      return;
    }

    if (anchor !== "orphaned") {
      await this.openNavigatorResourceNotes(relativePath);
      return;
    }

    try {
      const { rootDirectory } = resolveCzazaRootDirectory(currentUri);
      const targetUri = vscode.Uri.file(path.join(rootDirectory, ...relativePath.split("/")));
      const payload = await getStoredNavigatorFileNotes({
        currentUri,
        notes: this.notes,
        relativePath,
      });

      this.currentResourceUri = targetUri;
      this.currentPayload = payload;
      this.selectedSectionId = selectCurrentSectionId(payload, undefined);
      this.clearSectionHighlight();
      this.postViewMode("detail");
      await this.postCurrentResourceNotes();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      await this.postNotice({
        tone: "error",
        title: "View Notes Failed",
        message,
      });
    }
  }

  private async runRelocateNavigatorFileNote(
    fromRelativePath: string,
    toRelativePath: string,
  ): Promise<void> {
    const currentUri = this.currentResourceUri;

    if (!currentUri) {
      return;
    }

    try {
      const result = await relocateNavigatorFileNoteService({
        currentUri,
        notes: this.notes,
        fromRelativePath,
        toRelativePath,
      });

      await this.loadNavigatorNotes();
      await this.view?.webview.postMessage({
        type: "navigatorFileNoteRelocated",
        fromRelativePath: result.previousRelativePath,
        toRelativePath: result.nextRelativePath,
      });

      const document = await vscode.workspace.openTextDocument(result.targetUri);
      await vscode.window.showTextDocument(document, { preview: false });
      await this.loadResourceNotes(result.targetUri, false, getActiveLine(result.targetUri));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      await this.postNotice({
        tone: "error",
        title: "Relocate Failed",
        message,
      });
    }
  }

  private async runMarkNavigatorFileNoteOrphaned(relativePath: string): Promise<void> {
    const currentUri = this.currentResourceUri;

    if (!currentUri || !isSafeRelativePath(relativePath)) {
      return;
    }

    try {
      const changed = await markNavigatorFileNoteOrphanedService({
        currentUri,
        notes: this.notes,
        relativePath,
      });

      if (changed) {
        await this.loadNavigatorNotes();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      await this.postNotice({
        tone: "error",
        title: "Mark Orphaned Failed",
        message,
      });
    }
  }

  private async runDeleteNavigatorFileNotes(relativePath: string): Promise<void> {
    const currentUri = this.currentResourceUri;

    if (!currentUri || !isSafeRelativePath(relativePath)) {
      return;
    }

    try {
      const changed = await deleteNavigatorFileNotesService({
        currentUri,
        notes: this.notes,
        relativePath,
      });

      if (changed) {
        await this.refreshCurrentNotes(currentUri);
        if (this.viewMode !== "navigator") {
          await this.loadNavigatorNotes();
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      await this.postNotice({
        tone: "error",
        title: "Delete Notes Failed",
        message,
      });
    }
  }

  private async runDeleteNavigatorSectionNote(sectionId: string): Promise<void> {
    const currentUri = this.currentResourceUri;

    if (!currentUri || !sectionId) {
      return;
    }

    try {
      await deleteNavigatorSectionNoteService({
        currentUri,
        notes: this.notes,
        sectionId,
      });
      await this.refreshCurrentNotes(currentUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      await this.postNotice({
        tone: "error",
        title: "Delete Section Failed",
        message,
      });
    }
  }

  private async runDeleteNavigatorLineNote(lineId: string): Promise<void> {
    const currentUri = this.currentResourceUri;

    if (!currentUri || !lineId) {
      return;
    }

    try {
      await deleteNavigatorLineNoteService({
        currentUri,
        notes: this.notes,
        lineId,
      });
      await this.refreshCurrentNotes(currentUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      await this.postNotice({
        tone: "error",
        title: "Delete Line Failed",
        message,
      });
    }
  }

  private async postActiveNavigatorRelocateTargetPath(uri?: vscode.Uri): Promise<void> {
    if (!this.isNavigatorRelocatePathSyncActive || !this.view) {
      return;
    }

    const activeUri = uri ?? vscode.window.activeTextEditor?.document.uri;

    if (!activeUri || activeUri.scheme !== "file") {
      return;
    }

    try {
      const { rootDirectory } = resolveCzazaRootDirectory(activeUri);
      const relativePath = getCzazaRelativePath(activeUri, rootDirectory);

      await this.view.webview.postMessage({
        type: "navigatorRelocateTargetPath",
        relativePath,
      });
    } catch {
      // Active files outside CZaza root are not valid relocation targets.
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

    return rawHtml.replace(
      /(src|href)="\.\/([^"]+)"/g,
      (_match, attribute: string, assetPath: string) => {
        const assetUri = vscode.Uri.joinPath(webviewRoot, ...assetPath.split("/"));
        return `${attribute}="${webview.asWebviewUri(assetUri).toString()}"`;
      },
    );
  }
}

function isNotesWebviewMessage(message: unknown): message is NotesWebviewMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as {
    type?: unknown;
    relativePath?: unknown;
    sectionId?: unknown;
    startLine?: unknown;
    endLine?: unknown;
    line?: unknown;
    lineId?: unknown;
    lineScope?: unknown;
    target?: unknown;
    userNote?: unknown;
    fromRelativePath?: unknown;
    toRelativePath?: unknown;
    anchor?: unknown;
    action?: unknown;
  };

  return (
    candidate.type === "ready" ||
    candidate.type === "generateFileNotes" ||
    candidate.type === "generateAllNotes" ||
    (candidate.type === "runNoticeAction" &&
      (candidate.action === "openMaxAnalysisLinesSetting" ||
        candidate.action === "confirmBatchedAllNotes")) ||
    (candidate.type === "generateLineNote" &&
      (candidate.lineScope === "currentLine" || candidate.lineScope === "nearbyLines")) ||
    (candidate.type === "generateSectionNote" && typeof candidate.sectionId === "string") ||
	    (candidate.type === "saveUserNote" &&
	      isUserNoteTarget(candidate.target) &&
	      typeof candidate.userNote === "string") ||
	    (candidate.type === "clearNoteStaleStatus" && isUserNoteTarget(candidate.target)) ||
	    (candidate.type === "clearNavigatorFileStaleStatus" && typeof candidate.relativePath === "string") ||
    (candidate.type === "viewNavigatorFileNotes" &&
      typeof candidate.relativePath === "string" &&
      isNoteAnchorStatus(candidate.anchor)) ||
    (candidate.type === "relocateNavigatorFileNote" &&
      typeof candidate.fromRelativePath === "string" &&
      typeof candidate.toRelativePath === "string") ||
    candidate.type === "startNavigatorFileRelocatePathSync" ||
    candidate.type === "stopNavigatorFileRelocatePathSync" ||
    (candidate.type === "markNavigatorFileNoteOrphaned" && typeof candidate.relativePath === "string") ||
    (candidate.type === "deleteNavigatorFileNotes" && typeof candidate.relativePath === "string") ||
    (candidate.type === "deleteNavigatorSectionNote" && typeof candidate.sectionId === "string") ||
    (candidate.type === "deleteNavigatorLineNote" && typeof candidate.lineId === "string") ||
	    (candidate.type === "openNavigatorResource" && typeof candidate.relativePath === "string") ||
    (candidate.type === "openNavigatorSection" &&
      typeof candidate.sectionId === "string" &&
      Number.isInteger(candidate.startLine) &&
      Number.isInteger(candidate.endLine) &&
      isValidLineRange(Number(candidate.startLine), Number(candidate.endLine))) ||
    (candidate.type === "openNavigatorLine" &&
      Number.isInteger(candidate.line) &&
      isPositiveLine(Number(candidate.line))) ||
    (candidate.type === "selectSection" && typeof candidate.sectionId === "string")
  );
}

function isNoteAnchorStatus(value: unknown): value is "confirmed" | "needsConfirmation" | "orphaned" {
  return value === "confirmed" || value === "needsConfirmation" || value === "orphaned";
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

async function getResourceKind(uri: vscode.Uri): Promise<"file" | "directory"> {
  const stat = await vscode.workspace.fs.stat(uri);
  return stat.type & vscode.FileType.Directory ? "directory" : "file";
}

function isSafeRelativePath(relativePath: string): boolean {
  if (!relativePath || path.isAbsolute(relativePath)) {
    return false;
  }

  const segments = relativePath.split("/");

  return segments.every((segment) => segment && segment !== "." && segment !== "..");
}

function isValidLineRange(startLine: number, endLine: number): boolean {
  return Number.isInteger(startLine) && Number.isInteger(endLine) && startLine > 0 && endLine >= startLine;
}

function isPositiveLine(line: number): boolean {
  return Number.isInteger(line) && line > 0;
}
