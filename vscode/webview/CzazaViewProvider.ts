import * as vscode from "vscode";
import path from "node:path";
import { realpath } from "node:fs/promises";
import {
  loadProjectTreeState,
  saveProjectTreeState,
  type ProjectTreeState,
} from "@node/cache/projectTreeCache";
import type { ProjectTreeUnit } from "@shared/types/projectTreeUnit";
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
  canEditDescription: boolean;
  highlightColor: string;
  isEditing: boolean;
  fileRoles?: FileRoleItem[];
};

type FileRoleItem = {
  name: string;
  path: string;
  kind: ProjectTreeUnit["kind"];
  description: string;
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
      type: "cancelEdit";
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

  private readonly extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
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

    // Set the HTML content of the Webview
    webviewView.webview.html = getWebviewHtml();

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

        if (message.type === "startEdit") {
          await this.startEditingCurrentResource();
          return;
        }

        this.editingResourceUri = undefined;
        await this.showResourceDescription();
      }),
    );

    // Listen for active editor changes and notify the Webview
    this.viewDisposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.sendActiveFileDescription();
      }),
    );

    this.viewDisposables.push(
      webviewView.onDidDispose(() => {
        this.disposeViewListeners();
        if (this.view === webviewView) {
          this.view = undefined;
        }
      }),
    );

    this.sendActiveFileDescription();
  }

  async showResourceDescription(uri?: vscode.Uri) {
    const resourceUri = uri ?? vscode.window.activeTextEditor?.document.uri;

    if (!resourceUri) {
      this.postDescription({
        fileName: null,
        path: null,
        kind: null,
        category: null,
        status: null,
        description: "No file or folder selected.",
        hasUserDescription: false,
        canEditDescription: false,
        highlightColor: getDescriptionHighlightColor(),
        isEditing: false,
      });
      return;
    }

    await this.sendResourceDescription(resourceUri);
  }

  private async startEditingCurrentResource() {
    const resourceUri = this.currentResourceUri ?? vscode.window.activeTextEditor?.document.uri;

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
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.postMessage({
        type: "description",
        fileName: null,
        path: null,
        kind: null,
        category: null,
        status: null,
        description: "No active file.",
        hasUserDescription: false,
        canEditDescription: false,
        highlightColor: getDescriptionHighlightColor(),
        isEditing: false,
      });
      return;
    }

    void this.sendResourceDescription(editor.document.uri);
  }

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
        canEditDescription: false,
        highlightColor: getDescriptionHighlightColor(),
        isEditing: false,
      });
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
        canEditDescription: false,
        highlightColor: getDescriptionHighlightColor(),
        isEditing: false,
      });
      return;
    }

    await this.refreshProjectTreeIndex(workspace);

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
        canEditDescription: false,
        highlightColor: getDescriptionHighlightColor(),
        isEditing: false,
      });
      return;
    }

    const hasUserDescription = Boolean(matchedUnit.description?.trim());

    this.postDescription({
      fileName: matchedUnit.name,
      path: matchedUnit.path,
      kind: matchedUnit.kind,
      category: matchedUnit.category,
      status: matchedUnit.status,
      description: matchedUnit.description ?? describeProjectTreeUnit(matchedUnit),
      hasUserDescription,
      canEditDescription: true,
      highlightColor: getDescriptionHighlightColor(),
      isEditing: options.isEditing ?? false,
      fileRoles: collectFileRoles(matchedUnit),
    });
  }

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

  private postDescription(message: Omit<DescriptionMessage, "type">) {
    this.postMessage({
      type: "description",
      ...message,
    });
  }

  private async saveProjectTreeState(workspace: vscode.WorkspaceFolder) {
    if (!this.projectTreeState) {
      return;
    }

    await saveProjectTreeState(workspace.uri.fsPath, this.projectTreeState);
  }

  /**
   * Helper to send messages to the Webview.
   */
  private postMessage(message: unknown) {
    this.view?.webview.postMessage(message);
  }

  private disposeViewListeners() {
    while (this.viewDisposables.length > 0) {
      this.viewDisposables.pop()?.dispose();
    }
  }
}

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

function getProjectTreeRelativeIndexKey(relativePath: string): string {
  return `project:${normalizePath(relativePath)}`;
}

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

function compareProjectTreeUnitForDisplay(a: ProjectTreeUnit, b: ProjectTreeUnit): number {
  if (a.kind !== b.kind) {
    return a.kind === "directory" ? -1 : 1;
  }

  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getDescriptionHighlightColor(): string {
  return vscode.workspace
    .getConfiguration("czaza")
    .get("descriptionHighlightColor", "#22c55e");
}

function normalizeFsPath(fsPath: string): string {
  return normalizePath(path.resolve(fsPath));
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

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

  return candidate.type === "saveDescription" && typeof candidate.description === "string";
}
