/**
 * Connects VS Code's built-in Git repository state to CZaza transition protection.
 */

import * as vscode from "vscode";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import { GitWorkspaceTransitionGuard } from "./GitWorkspaceTransitionGuard";

/** Minimal Git HEAD reference used for transition detection. */
type GitHeadReference = {
  name?: string;
  commit?: string;
};

/** Minimal built-in Git repository API used by CZaza. */
type GitRepository = {
  rootUri: vscode.Uri;
  state: {
    HEAD?: GitHeadReference;
    onDidChange: vscode.Event<void>;
  };
};

/** Minimal built-in Git API used by CZaza. */
type GitApi = {
  repositories: readonly GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
};

/** Minimal built-in Git extension export used by CZaza. */
type GitExtensionExports = {
  getAPI(version: 1): GitApi;
};

/**
 * Registers Git HEAD monitoring for all current and subsequently opened repositories.
 *
 * @param context - Current VS Code extension context.
 * @param notes - Shared workspace Note store.
 * @param notesProvider - Notes view refreshed after a stable transition.
 * @param guard - Shared transition state consumed by content event handlers.
 * @returns Promise resolved after Git listeners are registered.
 */
export async function registerGitWorkspaceTransition(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  notesProvider: NotesViewProvider,
  guard: GitWorkspaceTransitionGuard,
): Promise<void> {
  const extension =
    vscode.extensions.getExtension<GitExtensionExports>("vscode.git");

  if (!extension) {
    return;
  }

  const exports = extension.isActive
    ? extension.exports
    : await extension.activate();
  const git = exports.getAPI(1);
  let activeRepository: GitRepository | undefined;

  const finishDisposable = guard.onDidFinishTransition(async () => {
    const repository = activeRepository;

    if (!repository) {
      return;
    }

    const revision = guard.getRevision();

    clearRepositoryNoteCache(notes, repository.rootUri);
    await notesProvider.refreshCurrentNotes(repository.rootUri);

    if (!guard.isRevisionCurrent(revision)) {
      clearRepositoryNoteCache(notes, repository.rootUri);
      return;
    }

    if (activeRepository === repository) {
      activeRepository = undefined;
    }
  });

  context.subscriptions.push(
    finishDisposable,
    ...git.repositories.map((repository) =>
      monitorGitRepository(repository, notes, guard, (changedRepository) => {
        activeRepository = changedRepository;
      }),
    ),
    git.onDidOpenRepository((repository) => {
      context.subscriptions.push(
        monitorGitRepository(repository, notes, guard, (changedRepository) => {
          activeRepository = changedRepository;
        }),
      );
    }),
  );
}

/**
 * Monitors one Git repository for branch name or commit changes.
 *
 * @param repository - Built-in Git repository to monitor.
 * @param notes - Shared workspace Note store.
 * @param guard - Shared workspace transition guard.
 * @param onTransition - Callback receiving the repository that changed HEAD.
 * @returns Disposable Git state listener.
 */
function monitorGitRepository(
  repository: GitRepository,
  notes: WorkspaceNoteStore,
  guard: GitWorkspaceTransitionGuard,
  onTransition: (repository: GitRepository) => void,
): vscode.Disposable {
  let previousHead = createHeadIdentity(repository.state.HEAD);

  return repository.state.onDidChange(() => {
    const currentHead = createHeadIdentity(repository.state.HEAD);

    if (currentHead === previousHead) {
      return;
    }

    previousHead = currentHead;
    onTransition(repository);
    clearRepositoryNoteCache(notes, repository.rootUri);
    guard.beginTransition();
  });
}

/**
 * Creates a comparable identity from a Git branch name and commit.
 *
 * @param head - Current Git HEAD reference.
 * @returns Stable identity string.
 */
function createHeadIdentity(head: GitHeadReference | undefined): string {
  return `${head?.name ?? ""}\u0000${head?.commit ?? ""}`;
}

/**
 * Clears cached Notes belonging to the repository's configured CZaza root.
 *
 * @param notes - Shared workspace Note store.
 * @param repositoryUri - Root URI of the changed Git repository.
 * @returns Nothing.
 */
function clearRepositoryNoteCache(
  notes: WorkspaceNoteStore,
  repositoryUri: vscode.Uri,
): void {
  if (repositoryUri.scheme !== "file") {
    return;
  }

  try {
    const { rootDirectory } = resolveCzazaRootDirectory(repositoryUri);
    const settings = getCzazaSettings(repositoryUri);
    notes.cache.clearCache(rootDirectory, settings.outputDirectory);
  } catch (error) {
    console.error("Failed to clear CZaza Notes cache after a Git HEAD change.", error);
  }
}
