/**
 * VS Code WebviewViewProvider for the CZaza Description panel.
 *
 * The provider bridges VS Code editor/project state with the plain webview UI:
 * it resolves the active resource, loads cached project metadata, persists user
 * notes, runs analysis commands, and posts render payloads to the webview.
 */
import * as vscode from "vscode";
import path from "node:path";
import { realpath } from "node:fs/promises";
import {
  loadProjectTreeState,
  saveProjectTreeState,
  type ProjectTreeState,
} from "@node/cache/projectTreeCache";
import type { ProjectTreeUnit } from "@shared/types/projectTreeUnit";
import type { StructureUnit } from "@shared/types/structureUnit";
import { ExplanationCache } from "../explanations/ExplanationCache";
import { ExplanationStore } from "../explanations/ExplanationStore";
import { getWebviewHtml } from "./getWebviewHtml";

type DescriptionMessage = {
  type: "description";
  fileName: string | null;
  path: string | null;
  kind: ProjectTreeUnit["kind"] | null;
  category: ProjectTreeUnit["category"] | null;
  status: ProjectTreeUnit["status"] | null;
  description: string;
  hasUserDescription: boolean;
  aiDescription: string | null;
  aiDetail: string | null;
  aiNotes: string[];
  canEditDescription: boolean;
  highlightColor: string;
  isEditing: boolean;
  fileRoles?: FileRoleItem[];
  activeLine: number | null;
  hasStructureMetadata: boolean;
  activeStructure: ActiveStructureItem | null;
  activeLineExplanation: ActiveLineExplanation | null;
};

type FileRoleItem = {
  name: string;
  path: string;
  kind: ProjectTreeUnit["kind"];
  description: string;
};

type AnalysisMessageType = "analyzeFileStructure" | "analyzeSemantic" | "analyzeLineRange";

type ActiveStructureItem = {
  id: string;
  name: string;
  kind: StructureUnit["kind"];
  startLine: number;
  endLine: number;
  summary: string;
  detail: string;
  aiNotes: string[];
  userNotes: string[];
};

type ActiveLineExplanation = {
  lineNumber: number;
  code: string;
  summary: string;
  detail: string;
  aiNotes: string[];
  userNotes: string[];
};

type WebviewMessage =
  | {
      type: "startEdit";
    }
  | {
      type: "saveDescription";
      description: string;
    }
  | {
      type: "saveStructureUserNotes";
      structureId: string;
      notes: string;
    }
  | {
      type: "saveLineUserNotes";
      lineNumber: number;
      notes: string;
    }
  | {
      type: "cancelEdit";
    }
  | {
      type: AnalysisMessageType;
    };

/**
 * WebviewViewProvider for the CZaza Description view.
 * It renders a small Explorer panel that follows the active editor.
 */
export class CzazaViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly viewDisposables: vscode.Disposable[] = [];
  private projectTreeState?: ProjectTreeState;
  private projectTreeIndex = new Map<string, ProjectTreeUnit>();
  private currentResourceUri?: vscode.Uri;
  private editingResourceUri?: vscode.Uri;
  private currentActiveLine?: number;
  private structureHighlightedEditor?: vscode.TextEditor;
  private readonly structureDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(78, 161, 255, 0.10)",
  });

  private readonly extensionUri: vscode.Uri;
  private readonly explanations: ExplanationStore;
  private readonly explanationCache: ExplanationCache;

  constructor(
    extensionUri: vscode.Uri,
    explanations: ExplanationStore,
    explanationCache: ExplanationCache,
  ) {
    this.extensionUri = extensionUri;
    this.explanations = explanations;
    this.explanationCache = explanationCache;
  }

  /**
   * Called when VS Code needs to show this Webview View.
   * This is the entry point of the view's lifecycle.
   */
  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.disposeViewListeners();
    this.view = webviewView;

    // Allow the Webview to run JavaScript
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    // The HTML shell reads native webview assets from the extension root.
    webviewView.webview.html = getWebviewHtml(this.extensionUri.fsPath);

    await this.refreshProjectTreeIndex();

    this.viewDisposables.push(
      webviewView.webview.onDidReceiveMessage(async (message: unknown) => {
        if (!isWebviewMessage(message)) {
          return;
        }

        if (message.type === "saveDescription") {
          await this.saveEditingDescription(message.description);
          return;
        }

        if (message.type === "saveStructureUserNotes") {
          await this.saveStructureUserNotes(message.structureId, message.notes);
          return;
        }

        if (message.type === "saveLineUserNotes") {
          await this.saveLineUserNotes(message.lineNumber, message.notes);
          return;
        }

        if (message.type === "startEdit") {
          await this.startEditingCurrentResource();
          return;
        }

        if (
          message.type === "analyzeFileStructure" ||
          message.type === "analyzeSemantic" ||
          message.type === "analyzeLineRange"
        ) {
          await this.runAnalysisCommand(message.type);
          return;
        }

        this.editingResourceUri = undefined;
        await this.showResourceDescription();
      }),
    );

    // Keep the panel useful even when the user changes files outside the CZaza view.
      this.viewDisposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.sendActiveFileDescription();
      }),
    );

    this.viewDisposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === vscode.window.activeTextEditor) {
          void this.sendResourceDescription(event.textEditor.document.uri);
        }
      }),
    );

    this.viewDisposables.push(
      webviewView.onDidDispose(() => {
        this.clearStructureHighlight();
        this.disposeViewListeners();
        if (this.view === webviewView) {
          this.view = undefined;
        }
      }),
    );

    this.sendActiveFileDescription();
  }

  async showResourceDescription(uri?: vscode.Uri) {
    const resourceUri = this.resolveCurrentResourceUri(uri);

    if (!resourceUri) {
      this.postDescription({
        fileName: null,
        path: null,
        kind: null,
        category: null,
        status: null,
        description: "No file or folder selected.",
        hasUserDescription: false,
        ...emptyAiDescription(),
        canEditDescription: false,
        highlightColor: getDescriptionHighlightColor(),
        isEditing: false,
        activeLine: null,
        hasStructureMetadata: false,
        activeStructure: null,
        activeLineExplanation: null,
      });
      this.clearStructureHighlight();
      return;
    }

    await this.sendResourceDescription(resourceUri);
  }

  /**
   * Enters edit mode for the current resource's user-authored description.
   */
  private async startEditingCurrentResource() {
    const resourceUri = this.resolveCurrentResourceUri();

    if (!resourceUri) {
      vscode.window.showWarningMessage("Select a file or folder before adding a CZaza description.");
      return;
    }

    if (resourceUri.scheme !== "file") {
      vscode.window.showWarningMessage("CZaza descriptions can only be added to local workspace files.");
      return;
    }

    const workspace = vscode.workspace.getWorkspaceFolder(resourceUri);

    if (!workspace) {
      vscode.window.showWarningMessage("CZaza descriptions can only be added inside the current workspace.");
      return;
    }

    await this.refreshProjectTreeIndex(workspace);

    const matchedUnit = await findProjectTreeUnitByUri(
      this.projectTreeIndex,
      workspace.uri.fsPath,
      resourceUri,
    );

    if (!matchedUnit) {
      vscode.window.showWarningMessage("This resource was not found in the CZaza scan cache.");
      await this.sendResourceDescription(resourceUri);
      return;
    }

    this.editingResourceUri = resourceUri;
    await this.sendResourceDescription(resourceUri, { isEditing: true });
  }

  /**
   * Send the currently active file's basic description to the Webview.
   */
  private sendActiveFileDescription() {
    const editorUri = getActiveOrVisibleEditorUri();

    if (!editorUri) {
      this.postMessage({
        type: "description",
        fileName: null,
        path: null,
        kind: null,
        category: null,
        status: null,
        description: "No active file.",
        hasUserDescription: false,
        ...emptyAiDescription(),
        canEditDescription: false,
        highlightColor: getDescriptionHighlightColor(),
        isEditing: false,
        activeLine: null,
        hasStructureMetadata: false,
        activeStructure: null,
        activeLineExplanation: null,
      });
      this.clearStructureHighlight();
      return;
    }

    void this.sendResourceDescription(editorUri);
  }

  /**
   * Persists the file-level user description into the project tree cache.
   */
  private async saveEditingDescription(description: string) {
    const resourceUri = this.editingResourceUri;

    if (!resourceUri) {
      vscode.window.showWarningMessage("No CZaza description is being edited.");
      return;
    }

    const workspace = vscode.workspace.getWorkspaceFolder(resourceUri);

    if (!workspace) {
      vscode.window.showWarningMessage("CZaza descriptions can only be saved inside the current workspace.");
      return;
    }

    await this.refreshProjectTreeIndex(workspace);

    const matchedUnit = await findProjectTreeUnitByUri(
      this.projectTreeIndex,
      workspace.uri.fsPath,
      resourceUri,
    );

    if (!matchedUnit) {
      vscode.window.showWarningMessage("This resource was not found in the CZaza scan cache.");
      this.editingResourceUri = undefined;
      await this.sendResourceDescription(resourceUri);
      return;
    }

    matchedUnit.description = description.trim();
    await this.saveProjectTreeState(workspace);
    this.editingResourceUri = undefined;
    await this.sendResourceDescription(resourceUri);
  }

  /**
   * Runs the requested AI analysis command and reports completion back to the webview.
   */
  private async runAnalysisCommand(type: AnalysisMessageType) {
    const resourceUri = this.resolveCurrentResourceUri();

    if (!resourceUri) {
      vscode.window.showWarningMessage("Open a local source file before analyzing CZaza explanations.");
      return;
    }

    const commandByType = {
      analyzeFileStructure: "czaza.analyzeFileStructure",
      analyzeSemantic: "czaza.analyzeSemantic",
      analyzeLineRange: "czaza.analyzeLineRange",
    } as const;

    const labelByType = {
      analyzeFileStructure: "file and structure units",
      analyzeSemantic: "semantic units",
      analyzeLineRange: "nearby lines",
    } as const;
    const startedAt = Date.now();
    const payload =
      type === "analyzeLineRange" && this.currentActiveLine
        ? { uri: resourceUri.toString(), line: this.currentActiveLine }
        : { uri: resourceUri.toString() };

    try {
      await vscode.commands.executeCommand(commandByType[type], payload);
      this.postMessage({
        type: "analysisResult",
        ok: true,
        label: labelByType[type],
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown analysis error.";
      this.postMessage({
        type: "analysisResult",
        ok: false,
        label: labelByType[type],
        elapsedMs: Date.now() - startedAt,
        message,
      });
      vscode.window.showErrorMessage(`CZaza analysis failed: ${message}`);
    }
  }

  /**
   * Persists user notes attached to one analyzed structure unit.
   */
  private async saveStructureUserNotes(structureId: string, notes: string) {
    const resourceUri = this.resolveCurrentResourceUri();

    if (!resourceUri) {
      return;
    }

    await this.explanationCache.loadForUri(resourceUri, this.explanations);
    const saved = this.explanations.setStructureUserNotes(
      resourceUri,
      structureId,
      toUserNotes(notes),
    );

    if (!saved) {
      vscode.window.showWarningMessage("No matching CZaza structure was found for these notes.");
      return;
    }

    await this.explanationCache.saveForUri(resourceUri, this.explanations);
    await this.sendResourceDescription(resourceUri);
  }

  /**
   * Persists user notes attached to one source line.
   */
  private async saveLineUserNotes(lineNumber: number, notes: string) {
    const resourceUri = this.resolveCurrentResourceUri();
    const editor = vscode.window.activeTextEditor;

    if (!resourceUri || !editor || editor.document.uri.toString() !== resourceUri.toString()) {
      return;
    }

    const safeLine = Math.min(Math.max(1, lineNumber), editor.document.lineCount);
    const code = editor.document.lineAt(safeLine - 1).text;
    await this.explanationCache.loadForUri(resourceUri, this.explanations);
    this.explanations.setLineUserNotes(resourceUri, safeLine, toUserNotes(notes), code);
    await this.explanationCache.saveForUri(resourceUri, this.explanations);
    await this.sendResourceDescription(resourceUri);
  }

  /**
   * Builds and posts the full description payload for one resource URI.
   */
  private async sendResourceDescription(
    resourceUri: vscode.Uri,
    options: { isEditing?: boolean } = {},
  ) {
    this.currentResourceUri = resourceUri;

    if (resourceUri.scheme !== "file") {
      this.postDescription({
        fileName: resourceUri.path ? path.basename(resourceUri.path) : "Untitled",
        path: resourceUri.toString(),
        kind: null,
        category: null,
        status: null,
        description: "This resource is not backed by a local workspace file.",
        hasUserDescription: false,
        ...emptyAiDescription(),
        canEditDescription: false,
        highlightColor: getDescriptionHighlightColor(),
        isEditing: false,
        activeLine: null,
        hasStructureMetadata: false,
        activeStructure: null,
        activeLineExplanation: null,
      });
      this.clearStructureHighlight();
      return;
    }

    const workspace = vscode.workspace.getWorkspaceFolder(resourceUri);

    if (!workspace) {
      this.postDescription({
        fileName: path.basename(resourceUri.fsPath),
        path: resourceUri.fsPath,
        kind: null,
        category: null,
        status: null,
        description: "This resource is outside the current workspace.",
        hasUserDescription: false,
        ...emptyAiDescription(),
        canEditDescription: false,
        highlightColor: getDescriptionHighlightColor(),
        isEditing: false,
        activeLine: null,
        hasStructureMetadata: false,
        activeStructure: null,
        activeLineExplanation: null,
      });
      this.clearStructureHighlight();
      return;
    }

    await this.refreshProjectTreeIndex(workspace);
    await this.explanationCache.loadForUri(resourceUri, this.explanations);

    const relativePath = normalizePath(path.relative(workspace.uri.fsPath, resourceUri.fsPath)) || ".";
    const matchedUnit = await findProjectTreeUnitByUri(
      this.projectTreeIndex,
      workspace.uri.fsPath,
      resourceUri,
    );

    if (!matchedUnit) {
      this.postDescription({
        fileName: path.basename(resourceUri.fsPath),
        path: relativePath,
        kind: null,
        category: null,
        status: null,
        description: "No scanned CZaza metadata found for this resource.",
        hasUserDescription: false,
        ...emptyAiDescription(),
        canEditDescription: false,
        highlightColor: getDescriptionHighlightColor(),
        isEditing: false,
        activeLine: getActiveLineForUri(resourceUri),
        hasStructureMetadata: false,
        activeStructure: null,
        activeLineExplanation: null,
      });
      this.clearStructureHighlight();
      return;
    }

    const hasUserDescription = Boolean(matchedUnit.description?.trim());
    const aiDescription = getAiDescription(this.explanations, resourceUri);
    const structureContext = getActiveStructureContext(this.explanations, resourceUri);
    this.currentActiveLine = structureContext.activeLine ?? undefined;
    this.updateStructureHighlight(resourceUri, structureContext.activeStructure);

    this.postDescription({
      fileName: matchedUnit.name,
      path: matchedUnit.path,
      kind: matchedUnit.kind,
      category: matchedUnit.category,
      status: matchedUnit.status,
      description: matchedUnit.description ?? describeProjectTreeUnit(matchedUnit),
      hasUserDescription,
      ...aiDescription,
      canEditDescription: true,
      highlightColor: getDescriptionHighlightColor(),
      isEditing: options.isEditing ?? false,
      fileRoles: collectFileRoles(matchedUnit),
      ...structureContext,
    });
  }

  /**
   * Resolves the resource the view should operate on.
   *
   * Explicit Explorer/tree selections win. Otherwise the provider falls back to
   * the current editor, including visible editors when the webview owns focus.
   */
  private resolveCurrentResourceUri(uri?: vscode.Uri): vscode.Uri | undefined {
    if (uri) {
      return uri;
    }

    const activeEditorUri = getActiveOrVisibleEditorUri();

    if (!this.currentResourceUri) {
      return activeEditorUri;
    }

    if (this.currentResourceUri.scheme !== "file") {
      return activeEditorUri ?? this.currentResourceUri;
    }

    const workspace = vscode.workspace.getWorkspaceFolder(this.currentResourceUri);

    if (!workspace) {
      return activeEditorUri ?? this.currentResourceUri;
    }

    return this.currentResourceUri;
  }

  /**
   * Rebuilds the lookup index from the persisted project tree cache.
   */
  private async refreshProjectTreeIndex(workspace = vscode.workspace.workspaceFolders?.[0]) {
    if (!workspace) {
      this.projectTreeIndex.clear();
      this.projectTreeState = undefined;
      return;
    }

    const state = await loadProjectTreeState(workspace.uri.fsPath);
    this.projectTreeState = state;
    this.projectTreeIndex = buildProjectTreeIndex(workspace.uri.fsPath, state.tree);
  }

  /**
   * Adds the webview message discriminator before posting a description payload.
   */
  private postDescription(message: Omit<DescriptionMessage, "type">) {
    this.postMessage({
      type: "description",
      ...message,
    });
  }

  /**
   * Writes the in-memory project tree state back to disk.
   */
  private async saveProjectTreeState(workspace: vscode.WorkspaceFolder) {
    if (!this.projectTreeState) {
      return;
    }

    await saveProjectTreeState(workspace.uri.fsPath, this.projectTreeState);
  }

  /**
   * Sends an arbitrary message to the webview if it is currently resolved.
   */
  private postMessage(message: unknown) {
    this.view?.webview.postMessage(message);
  }

  /**
   * Highlights the active structure block in the current text editor.
   */
  private updateStructureHighlight(resourceUri: vscode.Uri, activeStructure: ActiveStructureItem | null) {
    const editor = vscode.window.activeTextEditor;

    if (!editor || editor.document.uri.toString() !== resourceUri.toString() || !activeStructure) {
      this.clearStructureHighlight();
      return;
    }

    const startLine = Math.max(0, activeStructure.startLine - 1);
    const endLine = Math.min(editor.document.lineCount - 1, activeStructure.endLine - 1);
    const endCharacter = editor.document.lineAt(endLine).text.length;
    const range = new vscode.Range(startLine, 0, endLine, endCharacter);

    if (this.structureHighlightedEditor && this.structureHighlightedEditor !== editor) {
      this.structureHighlightedEditor.setDecorations(this.structureDecorationType, []);
    }

    this.structureHighlightedEditor = editor;
    editor.setDecorations(this.structureDecorationType, [range]);
  }

  /**
   * Clears any active structure highlight decoration.
   */
  private clearStructureHighlight() {
    this.structureHighlightedEditor?.setDecorations(this.structureDecorationType, []);
    this.structureHighlightedEditor = undefined;
  }

  /**
   * Disposes per-webview listeners before re-resolving or tearing down the view.
   */
  private disposeViewListeners() {
    while (this.viewDisposables.length > 0) {
      this.viewDisposables.pop()?.dispose();
    }
  }
}

/**
 * Builds lookup keys for project tree units by absolute path and project-relative path.
 */
function buildProjectTreeIndex(rootFsPath: string, root: ProjectTreeUnit): Map<string, ProjectTreeUnit> {
  const index = new Map<string, ProjectTreeUnit>();

  function visit(unit: ProjectTreeUnit) {
    const absolutePath =
      unit.path === "." ? rootFsPath : path.join(rootFsPath, ...unit.path.split("/"));

    index.set(normalizeFsPath(absolutePath), unit);
    index.set(getProjectTreeRelativeIndexKey(unit.path), unit);

    for (const child of unit.children ?? []) {
      visit(child);
    }
  }

  visit(root);

  return index;
}

/**
 * Finds the project tree unit for a URI, including symlink-normalized fallback matching.
 */
async function findProjectTreeUnitByUri(
  index: Map<string, ProjectTreeUnit>,
  rootFsPath: string,
  resourceUri: vscode.Uri,
): Promise<ProjectTreeUnit | undefined> {
  const exactMatch = index.get(normalizeFsPath(resourceUri.fsPath));

  if (exactMatch) {
    return exactMatch;
  }

  const relativePath = normalizePath(path.relative(rootFsPath, resourceUri.fsPath)) || ".";
  const relativeMatch = index.get(getProjectTreeRelativeIndexKey(relativePath));

  if (relativeMatch) {
    return relativeMatch;
  }

  try {
    const realFsPath = await realpath(resourceUri.fsPath);
    const realPathMatch = index.get(normalizeFsPath(realFsPath));

    if (realPathMatch) {
      return realPathMatch;
    }

    const realRootFsPath = await realpath(rootFsPath);
    const realRelativePath = normalizePath(path.relative(realRootFsPath, realFsPath)) || ".";
    return index.get(getProjectTreeRelativeIndexKey(realRelativePath));
  } catch {
    return undefined;
  }
}

/**
 * Creates a namespaced key for project-relative project tree lookups.
 */
function getProjectTreeRelativeIndexKey(relativePath: string): string {
  return `project:${normalizePath(relativePath)}`;
}

/**
 * Generates fallback description text when the scan cache has no user description.
 */
function describeProjectTreeUnit(unit: ProjectTreeUnit): string {
  const role =
    unit.category === "authored"
      ? "project-authored source"
      : `${unit.category} project resource`;

  if (unit.kind === "directory") {
    return unit.status === "collapsed"
      ? `Collapsed ${role} directory.`
      : `Scanned ${role} directory.`;
  }

  return `Scanned ${role} file.`;
}

/**
 * Collects described child resources for directory cards.
 */
function collectFileRoles(unit: ProjectTreeUnit): FileRoleItem[] {
  if (unit.kind !== "directory") {
    return [];
  }

  return (unit.children ?? [])
    .filter((child) => Boolean(child.description?.trim()))
    .sort(compareProjectTreeUnitForDisplay)
    .map((child) => ({
      name: child.name,
      path: child.path,
      kind: child.kind,
      description: child.description?.trim() ?? "",
    }));
}

/**
 * Sorts directories before files, then by natural filename order.
 */
function compareProjectTreeUnitForDisplay(a: ProjectTreeUnit, b: ProjectTreeUnit): number {
  if (a.kind !== b.kind) {
    return a.kind === "directory" ? -1 : 1;
  }

  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Reads the configured user-description highlight color.
 */
function getDescriptionHighlightColor(): string {
  return vscode.workspace
    .getConfiguration("czaza")
    .get("descriptionHighlightColor", "#22c55e");
}

/**
 * Extracts file-level AI description fields from the explanation store.
 */
function getAiDescription(explanations: ExplanationStore, resourceUri: vscode.Uri) {
  const explanation = explanations.get(resourceUri)?.fileStructure?.file.explanation;

  if (!explanation) {
    return emptyAiDescription();
  }

  return {
    aiDescription: explanation.summary || null,
    aiDetail: explanation.detail || null,
    aiNotes: explanation.aiNotes ?? [],
  };
}

/**
 * Computes active line, active structure, and line explanation for the webview.
 */
function getActiveStructureContext(explanations: ExplanationStore, resourceUri: vscode.Uri) {
  const activeLine = getActiveLineForUri(resourceUri);
  const state = explanations.get(resourceUri);
  const structureUnits = state?.fileStructure?.structureUnits ?? [];
  const activeStructure =
    activeLine === null ? null : findStructureUnitAtLine(structureUnits, activeLine);
  const activeLineUnit = activeLine === null ? undefined : state?.lineUnitsByLine.get(activeLine);

  return {
    activeLine,
    hasStructureMetadata: Boolean(state?.fileStructure),
    activeStructure: activeStructure ? toActiveStructureItem(activeStructure) : null,
    activeLineExplanation: activeLineUnit
      ? {
          lineNumber: activeLineUnit.lineNumber,
          code: activeLineUnit.code,
          summary: activeLineUnit.explanation.summary,
          detail: activeLineUnit.explanation.detail,
          aiNotes: activeLineUnit.explanation.aiNotes ?? [],
          userNotes: activeLineUnit.explanation.userNotes ?? [],
        }
      : null,
  };
}

/**
 * Returns the one-based cursor line if the active editor matches the resource.
 */
function getActiveLineForUri(resourceUri: vscode.Uri): number | null {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.uri.toString() !== resourceUri.toString()) {
    return null;
  }

  return editor.selection.active.line + 1;
}

/**
 * Resolves a local file URI from the active editor or visible editor fallback.
 */
function getActiveOrVisibleEditorUri(): vscode.Uri | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;

  if (activeUri?.scheme === "file") {
    return activeUri;
  }

  return vscode.window.visibleTextEditors.find((editor) => editor.document.uri.scheme === "file")
    ?.document.uri;
}

/**
 * Chooses the smallest structure unit that contains the active line.
 */
function findStructureUnitAtLine(
  structureUnits: StructureUnit[],
  lineNumber: number,
): StructureUnit | undefined {
  return structureUnits
    .filter((unit) => unit.range.startLine <= lineNumber && unit.range.endLine >= lineNumber)
    .sort((a, b) => {
      const aSize = a.range.endLine - a.range.startLine;
      const bSize = b.range.endLine - b.range.startLine;
      return aSize - bSize;
    })[0];
}

/**
 * Maps a stored StructureUnit into the serializable shape posted to the webview.
 */
function toActiveStructureItem(unit: StructureUnit): ActiveStructureItem {
  return {
    id: unit.id,
    name: unit.name,
    kind: unit.kind,
    startLine: unit.range.startLine,
    endLine: unit.range.endLine,
    summary: unit.explanation.summary,
    detail: unit.explanation.detail,
    aiNotes: unit.explanation.aiNotes ?? [],
    userNotes: unit.explanation.userNotes ?? [],
  };
}

/**
 * Converts textarea text into the stored user-note array shape.
 */
function toUserNotes(notes: string): string[] {
  const trimmed = notes.trim();
  return trimmed ? [trimmed] : [];
}

/**
 * Returns an empty AI description payload for resources without analysis.
 */
function emptyAiDescription() {
  return {
    aiDescription: null,
    aiDetail: null,
    aiNotes: [],
  };
}

/**
 * Normalizes absolute filesystem paths for cross-platform map keys.
 */
function normalizeFsPath(fsPath: string): string {
  return normalizePath(path.resolve(fsPath));
}

/**
 * Normalizes project-relative paths to forward-slash form.
 */
function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

/**
 * Runtime type guard for messages posted by the webview script.
 */
function isWebviewMessage(message: unknown): message is WebviewMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<WebviewMessage>;

  if (candidate.type === "cancelEdit") {
    return true;
  }

  if (candidate.type === "startEdit") {
    return true;
  }

  if (
    candidate.type === "analyzeFileStructure" ||
    candidate.type === "analyzeSemantic" ||
    candidate.type === "analyzeLineRange"
  ) {
    return true;
  }

  if (
    candidate.type === "saveStructureUserNotes" &&
    typeof candidate.structureId === "string" &&
    typeof candidate.notes === "string"
  ) {
    return true;
  }

  if (
    candidate.type === "saveLineUserNotes" &&
    typeof candidate.lineNumber === "number" &&
    typeof candidate.notes === "string"
  ) {
    return true;
  }

  return candidate.type === "saveDescription" && typeof candidate.description === "string";
}
