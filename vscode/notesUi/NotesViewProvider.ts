/**
 * Provides the React-based notes webview for file and directory resources.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";

import * as vscode from "vscode";

import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { getNotesTypographyStyle } from "@vscode/config/notesTypography";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { getWorkspaceNoteIndexPath } from "@vscode/notes/WorkspaceNoteStoreRepository";
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
import { NotesEditorHighlightController } from "@vscode/notesUi/highlights/NotesEditorHighlightController";
import {
  NotesRuntimeStateRefreshController,
  type NotesRuntimeRefreshContext,
} from "@vscode/notesUi/runtimeState/NotesRuntimeStateRefreshController";
import { compareSectionsForAutomaticSelection } from "@vscode/services/sectionSelection/sectionComparators";
import { getStoredNavigatorFileNotes } from "@vscode/services/getStoredNavigatorFileNotesService";
import { clearNoteStaleStatusService } from "@vscode/services/clearNoteStaleStatusService";
import { deleteNavigatorFileNotesService } from "@vscode/services/deleteNavigatorFileNotesService";
import { deleteNavigatorLineNoteService } from "@vscode/services/deleteNavigatorLineNoteService";
import { deleteNavigatorSectionNoteService } from "@vscode/services/deleteNavigatorSectionNoteService";
import { markNavigatorFileNoteOrphanedService } from "@vscode/services/markNavigatorFileNoteOrphanedService";
import { evaluateCzazaResourceAccess } from "@vscode/services/resourceAccess";
import {
  AllNotesBatchRequiredError,
  AllNotesBatchTimeoutError,
  AllNotesInvalidResponseError,
  AllNotesLineLimitError,
  AllNotesTaskTimeoutError,
  type AllNotesProgress,
} from "@vscode/services/generateAllNotesService";
import type { UserNoteTarget } from "@vscode/services/saveUserNoteService";
import {
  relocateFileNoteService,
  relocateLineNoteService,
  relocateSectionNoteService,
} from "@vscode/services/noteRelocation";
import {
  applyRuntimeStateToNavigatorNotes,
  applyRuntimeStateToResourceNotes,
  confirmRuntimeNoteStaleStatusService,
  RuntimeNoteStateDetectionController,
  type RuntimeNoteState,
  type RuntimeNoteStateRegistry,
} from "@vscode/services/runtimeState";

/**
 * Message posted by the React notes webview.
 */
type NotesWebviewMessage =
  | {
      /** Indicates that the React webview is ready for its initial payload. */
      type: "ready";
    }
  | {
      /** Reports the Navigator list selected by the user. */
      type: "navigatorTabChanged";
      tab: "files" | "sections" | "lines";
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
      /** Clears stale content from the currently visible Navigator items. */
      type: "clearVisibleNavigatorStaleContent";
      targets: Array<
        | { level: "file"; relativePath: string }
        | { level: "section"; sectionId: string }
        | { level: "line"; line: number }
      >;
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
      /** Relocates one File Note inside the unified relocation session. */
      type: "relocateFileNote";
      fromRelativePath: string;
      toRelativePath: string;
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
      /** Opens a Section/Line Note relocation session. */
      type: "startNoteRelocate";
      target:
        | { level: "section"; sectionId: string; startLine: number; endLine: number }
        | { level: "line"; lineId: string; line: number };
    }
  | {
      /** Stops the active Section/Line Note relocation session. */
      type: "stopNoteRelocate";
    }
  | {
      /** Confirms a new Section Note source range. */
      type: "relocateSectionNote";
      sectionId: string;
      startLine: number;
      endLine: number;
    }
  | {
      /** Confirms a new Line Note source line. */
      type: "relocateLineNote";
      lineId: string;
      line: number;
    }
  | {
      /** Indicates that the user selected a matched section in the webview. */
      type: "selectSection";

      /** Stable identifier of the selected section note. */
      sectionId: string;
    };

type AiActionScope = "fileSection" | "all" | "section" | "line";
type NoteRelocateSession = {
  uri: vscode.Uri;
  target:
    | { level: "file"; fromRelativePath: string; managedNotesRelativePath?: string }
    | { level: "section"; sectionId: string; startLine: number; endLine: number }
    | { level: "line"; lineId: string; line: number };
};

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
  private isSectionSelectionManual = false;
  private pendingEditTarget?: UserNoteTarget;
  private noteRelocateSession?: NoteRelocateSession;
  private requestVersion = 0;
  private readonly generatingResources = new Map<string, AiActionScope>();
  private readonly allNotesProgress = new Map<string, AllNotesProgress>();
  private readonly highlightController = new NotesEditorHighlightController();
  private readonly notesTypographyConfigurationListener: vscode.Disposable;
  private readonly runtimeStateRefreshController?: NotesRuntimeStateRefreshController;
  private readonly runtimeStateDetectionController?: RuntimeNoteStateDetectionController;
  private readonly extensionUri: vscode.Uri;
  private readonly notes: WorkspaceNoteStore;
  private readonly runtimeNoteStateRegistry?: RuntimeNoteStateRegistry;
  private readonly generateFileNotes: (uri: vscode.Uri) => Promise<boolean>;
  private readonly generateAllNotes?: (
    uri: vscode.Uri,
    options?: {
      allowBatching?: boolean;
      onProgress?: (progress: AllNotesProgress) => void | Promise<void>;
    },
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
   * @param runtimeNoteStateRegistry - Optional session-only status overlay registry.
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
      options?: {
        allowBatching?: boolean;
        onProgress?: (progress: AllNotesProgress) => void | Promise<void>;
      },
    ) => Promise<boolean>,
    generateLineNote?: (uri: vscode.Uri, lineNumber: number) => Promise<boolean>,
    generateSectionNote?: (uri: vscode.Uri, sectionId: string) => Promise<boolean>,
    generateLineBatchNotes?: (uri: vscode.Uri, lineNumber: number) => Promise<boolean>,
    runtimeNoteStateRegistry?: RuntimeNoteStateRegistry,
  ) {
    this.extensionUri = extensionUri;
    this.notes = notes;
    this.generateFileNotes = generateFileNotes;
    this.saveUserNote = saveUserNote;
    this.generateAllNotes = generateAllNotes;
    this.generateLineNote = generateLineNote;
    this.generateSectionNote = generateSectionNote;
    this.generateLineBatchNotes = generateLineBatchNotes;
    this.runtimeNoteStateRegistry = runtimeNoteStateRegistry;
    this.runtimeStateDetectionController = runtimeNoteStateRegistry
      ? new RuntimeNoteStateDetectionController(notes, runtimeNoteStateRegistry)
      : undefined;
    this.notesTypographyConfigurationListener = vscode.workspace.onDidChangeConfiguration?.(
      (event) => {
        if (
          this.view &&
          (event.affectsConfiguration("czaza.notes.fontFamily") ||
            event.affectsConfiguration("czaza.notes.fontSize"))
        ) {
          void this.getReactWebviewHtml(this.view.webview).then((html) => {
            if (this.view) {
              this.view.webview.html = html;
            }
          });
        }
      },
    ) ?? { dispose() {} };
    this.runtimeStateRefreshController = runtimeNoteStateRegistry
      ? new NotesRuntimeStateRefreshController({
          registry: runtimeNoteStateRegistry,
          getContext: () => this.getRuntimeRefreshContext(),
          detectCurrentResource: async () => {
            if (this.currentResourceUri) {
              await this.runtimeStateDetectionController?.detectResourceNotes(
                this.currentResourceUri,
              );
            }
          },
          detectAllFileNotes: async () => {
            if (this.currentResourceUri) {
              await this.runtimeStateDetectionController?.detectAllFileNotes(
                this.currentResourceUri,
              );
            }
          },
          reloadCurrentResource: () => this.refreshCurrentNotes(),
          overlayMissingState: (state) => this.overlayMissingRuntimeState(state),
          refreshNavigator: () => this.loadNavigatorNotes(),
        })
      : undefined;
  }

  /**
   * Re-detects and reloads the visible resource after external Note Store changes.
   *
   * @returns Promise resolved after the current Notes UI is synchronized.
   */
  async refreshAfterExternalNoteStoreChange(): Promise<void> {
    await this.runtimeStateRefreshController?.refreshAfterNoteStoreChange();
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
        if (this.pendingEditTarget?.level === "section") {
          this.selectedSectionId = this.pendingEditTarget.sectionId;
          this.isSectionSelectionManual = true;
        } else if (!getSelectedSection(this.currentPayload, this.selectedSectionId)) {
          this.selectedSectionId = selectAutomaticSectionId(this.currentPayload);
          this.isSectionSelectionManual = false;
        }
        void this.postCurrentResourceNotes();
        void this.postCurrentNavigatorNotes();
        this.postViewMode(this.viewMode);
        this.updateEditorHighlights();
        return;
      }

      if (
        message.type !== "stopNoteRelocate" &&
        message.type !== "selectSection" &&
        !(message.type === "runNoticeAction" &&
          message.action === "openMaxAnalysisLinesSetting") &&
        !this.canOperateOnCurrentResource()
      ) {
        return;
      }

      if (message.type === "generateFileNotes") {
        void this.runNotesGeneration("fileSection");
        return;
      }

      if (message.type === "navigatorTabChanged") {
        void this.runtimeStateRefreshController?.refreshNavigatorList(message.tab);
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

      if (message.type === "clearVisibleNavigatorStaleContent") {
        void this.runClearVisibleNavigatorStaleContent(message.targets);
        return;
      }

      if (message.type === "viewNavigatorFileNotes") {
        void this.viewNavigatorFileNotes(message.relativePath, message.anchor);
        return;
      }

      if (message.type === "relocateFileNote") {
        void this.runRelocateFileNote(message.fromRelativePath, message.toRelativePath);
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

      if (message.type === "startNoteRelocate") {
        void this.startNoteRelocate(message.target);
        return;
      }

      if (message.type === "stopNoteRelocate") {
        this.noteRelocateSession = undefined;
        return;
      }

      if (message.type === "relocateSectionNote") {
        void this.runRelocateSectionNote(
          message.sectionId,
          message.startLine,
          message.endLine,
        );
        return;
      }

      if (message.type === "relocateLineNote") {
        void this.runRelocateLineNote(message.lineId, message.line);
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
      this.highlightController.clear();
      this.noteRelocateSession = undefined;

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
      this.isSectionSelectionManual = false;
      this.highlightController.clear();
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
      this.isSectionSelectionManual = true;
    }

    await this.postCurrentResourceNotes();
    this.updateEditorHighlights();
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
    await this.syncRelocateTargetFromEditor(vscode.window.activeTextEditor);
  }

  /** Sends live cursor/selection suggestions while a Section/Line relocate modal is open. */
  async syncRelocateTargetFromEditor(editor: vscode.TextEditor | undefined): Promise<void> {
    const session = this.noteRelocateSession;

    if (!session || !this.view || !editor) {
      return;
    }

    if (session.target.level === "file") {
      try {
        const { rootDirectory } = resolveCzazaRootDirectory(session.uri);
        const relativePath = getCzazaRelativePath(editor.document.uri, rootDirectory);
        await this.view.webview.postMessage({
          type: "noteRelocateSuggestion",
          suggestion: { level: "file", relativePath },
        });
      } catch {
        // Active files outside the source note's CZaza root are not valid targets.
      }
      return;
    }

    if (editor.document.uri.toString() !== session.uri.toString()) {
      return;
    }

    if (session.target.level === "line") {
      const line = editor.selection.active.line + 1;
      await this.view.webview.postMessage({
        type: "noteRelocateSuggestion",
        suggestion: {
          level: "line",
          line,
          preview: editor.document.lineAt(line - 1).text,
        },
      });
      return;
    }

    const { startLine, endLine } = getSelectedEditorLineRange(editor.selection);
    await this.view.webview.postMessage({
      type: "noteRelocateSuggestion",
      suggestion: {
        level: "section",
        startLine,
        endLine,
      },
    });
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
    const targetUri = this.currentResourceUri
      ? remapResourceUri(this.currentResourceUri, previousUri, nextUri)
      : nextUri;

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
      this.currentResourceUri &&
      isSameOrDescendantResource(this.currentResourceUri, deletedUri)
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
    this.highlightController.clear();
    this.noteRelocateSession = undefined;
    this.notesTypographyConfigurationListener.dispose();
    this.runtimeStateRefreshController?.dispose();
    this.highlightController.dispose();
  }

  private async loadResourceNotes(
    uri: vscode.Uri,
    _ignoreOutsideRoot: boolean,
    activeLine?: number,
  ): Promise<void> {
    const requestVersion = ++this.requestVersion;
    const access = evaluateCzazaResourceAccess(uri);

    if (!access.allowed) {
      await this.showOutsideRootResource(uri);
      return;
    }

    const payload = await getResourceNotes({
      uri,
      notes: this.notes,
      ...(activeLine ? { activeLine } : {}),
    });

    if (requestVersion !== this.requestVersion) {
      return;
    }

    if (payload.kind === "outsideRoot") {
      await this.showOutsideRootResource(uri);
      return;
    }

    const visiblePayload = applyRuntimeStateToResourceNotes(
      payload,
      this.runtimeNoteStateRegistry?.getState({
        workspaceRoot: access.root.rootDirectory,
        outputDirectory: access.settings.outputDirectory,
        relativePath: access.relativePath,
      }),
    );
    const resourceChanged = this.currentResourceUri?.toString() !== uri.toString();
    if (
      resourceChanged &&
      this.noteRelocateSession &&
      this.noteRelocateSession.target.level !== "file"
    ) {
      this.noteRelocateSession = undefined;
      await this.view?.webview.postMessage({ type: "closeNoteRelocate" });
    }
    this.currentResourceUri = uri;
    this.currentPayload = visiblePayload;
    if (resourceChanged) {
      this.isSectionSelectionManual = false;
    }

    const manualSelectionStillApplies =
      this.isSectionSelectionManual &&
      Boolean(getSelectedSection(visiblePayload, this.selectedSectionId));

    if (!manualSelectionStillApplies) {
      this.isSectionSelectionManual = false;
      this.selectedSectionId = selectAutomaticSectionId(visiblePayload);
    }
    if (this.viewMode === "navigator") {
      await this.loadNavigatorNotes();
    }
    await this.postCurrentResourceNotes();
    this.updateEditorHighlights();
  }

  /**
   * Resolves the current resource coordinates for Runtime State refresh routing.
   *
   * @returns Current refresh context, or undefined outside a CZaza resource.
   */
  private getRuntimeRefreshContext(): NotesRuntimeRefreshContext | undefined {
    if (!this.currentResourceUri || !this.currentPayload) {
      return undefined;
    }

    const access = evaluateCzazaResourceAccess(this.currentResourceUri);

    if (!access.allowed) {
      return undefined;
    }

    return {
      coordinates: {
        workspaceRoot: path.resolve(access.root.rootDirectory),
        outputDirectory: access.settings.outputDirectory,
        relativePath: access.relativePath,
      },
      payloadKind: this.currentPayload.kind === "file" ? "file" : "other",
      viewMode: this.viewMode,
    };
  }

  /**
   * Applies missing Runtime State to the existing payload without reopening the source.
   *
   * @param state - Missing state for the currently visible resource.
   * @returns Promise resolved after the existing Detail payload is reposted.
   */
  private async overlayMissingRuntimeState(state: RuntimeNoteState): Promise<void> {
    const context = this.getRuntimeRefreshContext();

    if (
      !context ||
      context.payloadKind !== "file" ||
      context.coordinates.workspaceRoot !== state.workspaceRoot ||
      context.coordinates.outputDirectory !== state.outputDirectory ||
      context.coordinates.relativePath !== state.relativePath ||
      !this.currentPayload
    ) {
      return;
    }

    this.currentPayload = applyRuntimeStateToResourceNotes(this.currentPayload, state);
    await this.postCurrentResourceNotes();
    this.updateEditorHighlights();
  }

  /**
   * Replaces stale editable state when the selected resource fails the shared access Gate.
   *
   * @param uri - Rejected resource that should become the current non-editable context.
   * @returns Promise resolved after both Notes payloads are refreshed.
   */
  private async showOutsideRootResource(uri: vscode.Uri): Promise<void> {
    this.currentResourceUri = uri;
    this.currentPayload = { kind: "outsideRoot" };
    this.currentNavigatorPayload = { kind: "outsideRoot" };
    this.pendingEditTarget = undefined;
    this.selectedSectionId = undefined;
    this.isSectionSelectionManual = false;
    this.noteRelocateSession = undefined;
    this.highlightController.clear();
    await this.view?.webview.postMessage({ type: "closeNoteRelocate" });
    await this.postCurrentResourceNotes();
    await this.postCurrentNavigatorNotes();
  }

  /**
   * Checks whether the current webview resource may execute resource-bound actions.
   *
   * @returns True when the current resource passes the shared access Gate.
   */
  private canOperateOnCurrentResource(): boolean {
    return Boolean(
      this.currentResourceUri &&
        evaluateCzazaResourceAccess(this.currentResourceUri).allowed,
    );
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
                    ...(this.allNotesProgress.get(this.currentResourceUri.toString())
                      ? {
                          aiBatchProgress: this.allNotesProgress.get(
                            this.currentResourceUri.toString(),
                          ),
                        }
                      : {}),
                  }
                : {}),
              ...(revealAiNotes ? { revealAiNotes } : {}),
              ...(this.pendingEditTarget ? { editTarget: this.pendingEditTarget } : {}),
              ...(this.selectedSectionId
                ? { selectedSectionId: this.selectedSectionId }
                : {}),
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

    const payload = await getNavigatorNotes({
      uri: this.currentResourceUri,
      notes: this.notes,
      selectedSectionId: this.selectedSectionId,
      activeLine,
    });
    const access = this.currentResourceUri
      ? evaluateCzazaResourceAccess(this.currentResourceUri)
      : undefined;
    this.currentNavigatorPayload =
      access?.allowed && this.runtimeNoteStateRegistry
        ? applyRuntimeStateToNavigatorNotes(
            payload,
            this.runtimeNoteStateRegistry.listStates({
              workspaceRoot: access.root.rootDirectory,
              outputDirectory: access.settings.outputDirectory,
            }),
          )
        : payload;
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
      await this.postNotice({
        tone: "error",
        title: "Could Not Open Resource",
        message: getErrorMessage(error),
      });
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
      await this.postNotice({
        tone: "error",
        title: "Could Not Open Notes",
        message: getErrorMessage(error),
      });
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
      this.isSectionSelectionManual = true;
      await this.loadResourceNotes(uri, false, startLine);
    } catch (error) {
      await this.postNotice({
        tone: "error",
        title: "Could Not Open Section",
        message: getErrorMessage(error),
      });
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
      await this.postNotice({
        tone: "error",
        title: "Could Not Open Line",
        message: getErrorMessage(error),
      });
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
        scope === "all"
          ? await this.generateAllNotes?.(uri, {
              ...(allowBatching ? { allowBatching: true } : {}),
              onProgress: async (progress) => {
                this.allNotesProgress.set(resourceKey, progress);
                if (this.currentResourceUri?.toString() === resourceKey) {
                  await this.postCurrentResourceNotes();
                }
              },
            })
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
          message: `This file contains ${error.sourceLineCount} lines, of which ${error.candidateLineCount} require AI analysis. CZaza will use ${error.batchCount} sequential batches and merge them after every batch succeeds.`,
          actions: [
            {
              label: "Continue",
              variant: "primary",
              action: "confirmBatchedAllNotes",
            },
            { label: "Cancel", variant: "secondary" },
          ],
        });
      } else if (error instanceof AllNotesInvalidResponseError) {
        await this.postNotice({
          tone: "error",
          title: "AI Response Could Not Be Recovered",
          message: error.message,
        });
      } else if (
        error instanceof AllNotesBatchTimeoutError ||
        error instanceof AllNotesTaskTimeoutError
      ) {
        await this.postNotice({
          tone: "error",
          title: "AI Analysis Timed Out",
          message: error.message,
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
        await this.postNotice({
          tone: "error",
          title: "Could Not Generate Notes",
          message: getErrorMessage(error),
        });
      }
    } finally {
      this.generatingResources.delete(resourceKey);
      this.allNotesProgress.delete(resourceKey);

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
      await this.postNotice({
        tone: "error",
        title: "Could Not Generate Section Note",
        message: getErrorMessage(error),
      });
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
      await this.postNotice({
        tone: "error",
        title: "Could Not Generate Line Notes",
        message: getErrorMessage(error),
      });
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
    } catch (error) {
      await this.postNotice({
        tone: "error",
        title: "Could Not Save User Note",
        message: getErrorMessage(error),
      });
      return;
    }

    if (this.currentResourceUri?.toString() !== resourceKey) {
      return;
    }

    try {
      await this.loadResourceNotes(uri, false, getActiveLine(uri));
    } catch (error) {
      await this.postNotice({
        tone: "error",
        title: "User Note Saved, but View Refresh Failed",
        message: getErrorMessage(error),
      });
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
        const changed = await this.clearStaleStatusForResource(uri, target);

	      if (
          changed &&
          this.currentResourceUri?.toString() === resourceKey
        ) {
	        await this.loadResourceNotes(uri, false, getActiveLine(uri));
	      }
	    } catch (error) {
        await this.postNotice({
          tone: "error",
          ...getClearStaleErrorNotice(error),
        });
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
      const changed = await this.clearStaleStatusForResource(
        targetUri,
        { level: "file" },
      );

      if (changed) {
        await this.loadNavigatorNotes();
      }
    } catch (error) {
      await this.postNotice({
        tone: "error",
        ...getClearStaleErrorNotice(error),
      });
    }
  }

  /**
   * Clears stale content only for Navigator rows visible after filtering.
   *
   * @param targets - Visible stale file, section, or line note targets.
   */
  private async runClearVisibleNavigatorStaleContent(
    targets: Array<
      | { level: "file"; relativePath: string }
      | { level: "section"; sectionId: string }
      | { level: "line"; line: number }
    >,
  ): Promise<void> {
    const currentUri = this.currentResourceUri;

    if (!currentUri || targets.length === 0) {
      return;
    }

    try {
      const { rootDirectory } = resolveCzazaRootDirectory(currentUri);
      let changed = false;

      for (const target of targets) {
        if (target.level === "file") {
          if (!isSafeRelativePath(target.relativePath)) {
            continue;
          }

          const targetUri = vscode.Uri.file(
            path.join(rootDirectory, ...target.relativePath.split("/")),
          );
          changed =
            (await this.clearStaleStatusForResource(
              targetUri,
              { level: "file" },
            )) || changed;
          continue;
        }

        changed =
          (await this.clearStaleStatusForResource(
            currentUri,
            target,
          )) || changed;
      }

      if (changed) {
        await this.loadNavigatorNotes();
        await this.loadResourceNotes(currentUri, false, getActiveLine(currentUri));
      }
    } catch (error) {
      await this.postNotice({
        tone: "error",
        ...getClearStaleErrorNotice(error),
      });
    }
  }

  /**
   * Confirms Runtime stale content or falls back to legacy persistent stale handling.
   *
   * @param uri - Source resource that owns the selected Note.
   * @param target - File, Section, or Line target selected by the user.
   * @returns True when persistent Notes changed or an outdated Runtime state was refreshed.
   */
  private async clearStaleStatusForResource(
    uri: vscode.Uri,
    target: UserNoteTarget,
  ): Promise<boolean> {
    if (!this.runtimeNoteStateRegistry) {
      return clearNoteStaleStatusService({ uri, notes: this.notes, target });
    }

    const result = await confirmRuntimeNoteStaleStatusService({
      uri,
      notes: this.notes,
      registry: this.runtimeNoteStateRegistry,
      target,
    });

    if (result.kind === "notRuntime") {
      return clearNoteStaleStatusService({ uri, notes: this.notes, target });
    }

    return result.kind === "confirmed" || result.kind === "outdated";
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
      this.selectedSectionId = selectAutomaticSectionId(payload);
      this.isSectionSelectionManual = false;
      this.highlightController.clear();
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

  private async startNoteRelocate(
    target: NoteRelocateSession["target"],
  ): Promise<void> {
    const uri = this.currentResourceUri;

    if (
      !uri ||
      !this.view ||
      (target.level !== "file" && this.currentPayload?.kind !== "file")
    ) {
      return;
    }

    const sessionTarget =
      target.level === "file"
        ? {
            ...target,
            managedNotesRelativePath: this.getManagedNotesRelativePath(uri),
          }
        : target;
    this.noteRelocateSession = { uri, target: sessionTarget };
    await this.view.webview.postMessage({
      type: "openNoteRelocate",
      target: sessionTarget,
    });
    await this.syncRelocateTargetFromEditor(
      target.level === "file" ? vscode.window.activeTextEditor : this.getCurrentResourceEditor(),
    );
  }

  private getManagedNotesRelativePath(uri: vscode.Uri): string | undefined {
    try {
      const { rootDirectory } = resolveCzazaRootDirectory(uri);
      const settings = getCzazaSettings(uri);
      const notesDirectory = path.dirname(
        getWorkspaceNoteIndexPath(rootDirectory, settings.outputDirectory),
      );
      return path.relative(rootDirectory, notesDirectory).split(path.sep).join("/");
    } catch {
      return undefined;
    }
  }

  /**
   * Relocates or confirms one File Note path and recalculates its Runtime State.
   *
   * @param fromRelativePath - Currently stored File Note path.
   * @param toRelativePath - User-confirmed target path.
   * @returns Promise resolved after Notes UI and Runtime State are refreshed.
   */
  private async runRelocateFileNote(
    fromRelativePath: string,
    toRelativePath: string,
  ): Promise<void> {
    const session = this.noteRelocateSession;

    if (
      !session ||
      session.target.level !== "file" ||
      session.target.fromRelativePath !== fromRelativePath
    ) {
      return;
    }

    try {
      const result = await relocateFileNoteService({
        currentUri: session.uri,
        notes: this.notes,
        fromRelativePath,
        toRelativePath,
      });
      this.noteRelocateSession = undefined;
      await this.runtimeStateDetectionController?.detectResourceNotes(result.targetUri);
      await this.loadNavigatorNotes();
      await this.view?.webview.postMessage({ type: "noteRelocated" });

      const document = await vscode.workspace.openTextDocument(result.targetUri);
      await vscode.window.showTextDocument(document, { preview: false });
      await this.loadResourceNotes(result.targetUri, false, getActiveLine(result.targetUri));
    } catch (error) {
      await this.postNotice({
        tone: "error",
        title: "Relocate File Note Failed",
        message: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  }

  private async runRelocateSectionNote(
    sectionId: string,
    startLine: number,
    endLine: number,
  ): Promise<void> {
    const session = this.noteRelocateSession;

    if (
      !session ||
      session.target.level !== "section" ||
      session.target.sectionId !== sectionId
    ) {
      return;
    }

    try {
      await relocateSectionNoteService({
        uri: session.uri,
        notes: this.notes,
        sectionId,
        startLine,
        endLine,
      });
      this.noteRelocateSession = undefined;
      await this.runtimeStateDetectionController?.detectResourceNotes(session.uri);
      await this.loadResourceNotes(session.uri, false, getActiveLine(session.uri));
      await this.view?.webview.postMessage({ type: "noteRelocated" });
    } catch (error) {
      await this.postNotice({
        tone: "error",
        title: "Relocate Section Note Failed",
        message: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  }

  private async runRelocateLineNote(lineId: string, line: number): Promise<void> {
    const session = this.noteRelocateSession;

    if (!session || session.target.level !== "line" || session.target.lineId !== lineId) {
      return;
    }

    try {
      await relocateLineNoteService({
        uri: session.uri,
        notes: this.notes,
        lineId,
        line,
      });
      this.noteRelocateSession = undefined;
      await this.runtimeStateDetectionController?.detectResourceNotes(session.uri);
      await this.loadResourceNotes(session.uri, false, getActiveLine(session.uri));
      await this.view?.webview.postMessage({ type: "noteRelocated" });
    } catch (error) {
      await this.postNotice({
        tone: "error",
        title: "Relocate Line Note Failed",
        message: error instanceof Error ? error.message : "Unknown error.",
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

  private selectSection(sectionId: string): void {
    if (this.currentPayload?.kind !== "file") {
      return;
    }

    if (!this.currentPayload.sectionNotes.some((section) => section.id === sectionId)) {
      return;
    }

    this.selectedSectionId = sectionId;
    this.isSectionSelectionManual = true;
    this.updateEditorHighlights();
    void this.postCurrentResourceNotes();
  }

  private updateEditorHighlights(): void {
    this.highlightController.update({
      viewAvailable: Boolean(this.view),
      resourceUri: this.currentResourceUri,
      payload: this.currentPayload,
      selectedSectionId: this.selectedSectionId,
    });
  }

  private getCurrentResourceEditor(): vscode.TextEditor | undefined {
    return this.currentResourceUri
      ? this.highlightController.findEditor(this.currentResourceUri)
      : undefined;
  }

  private async getReactWebviewHtml(webview: vscode.Webview): Promise<string> {
    const webviewRoot = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const indexUri = vscode.Uri.joinPath(webviewRoot, "index.html");
    const rawHtml = await readFile(indexUri.fsPath, "utf-8");

    const htmlWithAssets = rawHtml.replace(
      /(src|href)="\.\/([^"]+)"/g,
      (_match, attribute: string, assetPath: string) => {
        const assetUri = vscode.Uri.joinPath(webviewRoot, ...assetPath.split("/"));
        return `${attribute}="${webview.asWebviewUri(assetUri).toString()}"`;
      },
    );

    return htmlWithAssets.replace(
      "</head>",
      `${getNotesTypographyStyle(getCzazaSettings(this.currentResourceUri))}</head>`,
    );
  }
}

/**
 * Remaps one visible resource when it equals or descends from a moved resource.
 *
 * @param currentUri - Resource currently shown in the Notes view.
 * @param previousUri - File or directory path before the move.
 * @param nextUri - File or directory path after the move.
 * @returns Remapped URI, or the unchanged current URI when it is outside the move.
 */
function remapResourceUri(
  currentUri: vscode.Uri,
  previousUri: vscode.Uri,
  nextUri: vscode.Uri,
): vscode.Uri {
  if (!isSameOrDescendantResource(currentUri, previousUri)) {
    return currentUri;
  }

  const relativePath = path.relative(previousUri.fsPath, currentUri.fsPath);
  return vscode.Uri.file(path.join(nextUri.fsPath, relativePath));
}

/**
 * Reports whether one file URI equals or descends from another file URI.
 *
 * @param candidateUri - Candidate resource URI.
 * @param parentUri - File or directory URI used as the boundary.
 * @returns True when the candidate is the same resource or lies below it.
 */
function isSameOrDescendantResource(
  candidateUri: vscode.Uri,
  parentUri: vscode.Uri,
): boolean {
  if (candidateUri.scheme !== "file" || parentUri.scheme !== "file") {
    return candidateUri.toString() === parentUri.toString();
  }

  const relativePath = path.relative(parentUri.fsPath, candidateUri.fsPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
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
    targets?: unknown;
    tab?: unknown;
  };

  return (
    candidate.type === "ready" ||
    (candidate.type === "navigatorTabChanged" &&
      (candidate.tab === "files" ||
        candidate.tab === "sections" ||
        candidate.tab === "lines")) ||
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
    (candidate.type === "clearVisibleNavigatorStaleContent" &&
      Array.isArray(candidate.targets) &&
      candidate.targets.every(isVisibleNavigatorStaleTarget)) ||
    (candidate.type === "viewNavigatorFileNotes" &&
      typeof candidate.relativePath === "string" &&
      isNoteAnchorStatus(candidate.anchor)) ||
    (candidate.type === "relocateFileNote" &&
      typeof candidate.fromRelativePath === "string" &&
      typeof candidate.toRelativePath === "string") ||
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
    (candidate.type === "startNoteRelocate" && isNoteRelocateTarget(candidate.target)) ||
    candidate.type === "stopNoteRelocate" ||
    (candidate.type === "relocateSectionNote" &&
      typeof candidate.sectionId === "string" &&
      Number.isInteger(candidate.startLine) &&
      Number.isInteger(candidate.endLine) &&
      isValidLineRange(Number(candidate.startLine), Number(candidate.endLine))) ||
    (candidate.type === "relocateLineNote" &&
      typeof candidate.lineId === "string" &&
      Number.isInteger(candidate.line) &&
      isPositiveLine(Number(candidate.line))) ||
    (candidate.type === "selectSection" && typeof candidate.sectionId === "string")
  );
}

/**
 * Validates one bulk stale-content target received from the webview.
 *
 * @param target - Unknown target candidate.
 * @returns Whether the candidate is a supported visible Navigator target.
 */
function isVisibleNavigatorStaleTarget(
  target: unknown,
): target is
  | { level: "file"; relativePath: string }
  | { level: "section"; sectionId: string }
  | { level: "line"; line: number } {
  if (!target || typeof target !== "object") {
    return false;
  }

  const candidate = target as {
    level?: unknown;
    relativePath?: unknown;
    sectionId?: unknown;
    line?: unknown;
  };

  return (
    (candidate.level === "file" && typeof candidate.relativePath === "string") ||
    (candidate.level === "section" && typeof candidate.sectionId === "string") ||
    (candidate.level === "line" &&
      Number.isInteger(candidate.line) &&
      isPositiveLine(Number(candidate.line)))
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

function isNoteRelocateTarget(value: unknown): value is NoteRelocateSession["target"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const target = value as {
    level?: unknown;
    fromRelativePath?: unknown;
    sectionId?: unknown;
    lineId?: unknown;
    startLine?: unknown;
    endLine?: unknown;
    line?: unknown;
  };

  return (
    (target.level === "file" && typeof target.fromRelativePath === "string") ||
    (target.level === "section" &&
      typeof target.sectionId === "string" &&
      Number.isInteger(target.startLine) &&
      Number.isInteger(target.endLine) &&
      isValidLineRange(Number(target.startLine), Number(target.endLine))) ||
    (target.level === "line" &&
      typeof target.lineId === "string" &&
      Number.isInteger(target.line) &&
      isPositiveLine(Number(target.line)))
  );
}

function selectAutomaticSectionId(
  payload: ResourceNotesResult | undefined,
): string | undefined {
  if (payload?.kind !== "file") {
    return undefined;
  }

  return [...payload.sectionNotes].sort(compareSectionsForAutomaticSelection)[0]?.id;
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

function getSelectedEditorLineRange(selection: vscode.Selection): {
  startLine: number;
  endLine: number;
} {
  const startLine = selection.start.line + 1;
  const excludesTrailingEmptyLine =
    selection.end.line > selection.start.line && selection.end.character === 0;
  const endLine = excludesTrailingEmptyLine ? selection.end.line : selection.end.line + 1;

  return {
    startLine,
    endLine: Math.max(startLine, endLine),
  };
}

function isPositiveLine(line: number): boolean {
  return Number.isInteger(line) && line > 0;
}

/**
 * Converts stale-confirmation failures into user-facing CZaza Notice content.
 *
 * @param error - Unknown error raised while confirming stale content.
 * @returns Friendly Notice title and message.
 */
function getClearStaleErrorNotice(error: unknown): {
  title: string;
  message: string;
} {
  const fileError = getErrnoError(error);
  const normalizedMessage = getErrorMessage(error);

  if (fileError?.code === "ENOENT" || normalizedMessage.includes("ENOENT")) {
    const messagePath = normalizedMessage.match(/['"]([^'"]+)['"]\s*$/)?.[1];
    const fileName =
      typeof fileError?.path === "string"
        ? path.basename(fileError.path)
        : messagePath
          ? path.basename(messagePath)
        : "The source file";

    return {
      title: "Source File Not Found",
      message: `${fileName} no longer exists. Relocate or delete its stale Notes before trying again.`,
    };
  }

  return {
    title: "Could Not Clear Stale Content",
    message: normalizedMessage,
  };
}

/**
 * Produces one clean user-facing message without repeated Error prefixes.
 *
 * @param error - Unknown operation failure.
 * @returns Normalized error text suitable for CZaza Notice UI.
 */
function getErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "An unknown error occurred.";

  return message.replace(/^(?:Error:\s*)+/i, "").trim();
}

/**
 * Reads a Node-style filesystem error from an error or its direct cause.
 *
 * @param error - Unknown operation failure.
 * @returns Errno-like error data when available.
 */
function getErrnoError(
  error: unknown,
): (NodeJS.ErrnoException & { path?: unknown }) | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as NodeJS.ErrnoException & {
    path?: unknown;
    cause?: unknown;
  };

  if (candidate.code || candidate.path) {
    return candidate;
  }

  return candidate.cause && typeof candidate.cause === "object"
    ? candidate.cause as NodeJS.ErrnoException & { path?: unknown }
    : candidate;
}
