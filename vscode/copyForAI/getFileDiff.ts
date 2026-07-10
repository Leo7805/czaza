/**
 * Provides Git utilities for retrieving the changes made to a single file.
 */

import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";

/**
 * The maximum amount of Git output accepted for a single file diff.
 */
const MAX_DIFF_BUFFER_SIZE = 10 * 1024 * 1024;

/**
 * Represents the possible results of requesting a file diff.
 */
export type FileDiffResult =
  | {
      kind: "diff";
      diff: string;
      repositoryRoot: string;
      relativePath: string;
    }
  | {
      kind: "noChanges";
      repositoryRoot: string;
      relativePath: string;
    }
  | {
      kind: "untracked";
      repositoryRoot: string;
      relativePath: string;
    }
  | {
      kind: "noHead";
      repositoryRoot: string;
      relativePath: string;
    }
  | {
      kind: "notGitRepository";
    };

/**
 * Represents a failed Git command.
 */
class GitCommandError extends Error {
  /**
   * Git's standard error output.
   */
  public readonly stderr: string;

  /**
   * Creates an error containing Git's standard error output.
   */
  constructor(message: string, stderr: string) {
    super(message);
    this.name = "GitCommandError";
    this.stderr = stderr;
  }
}

/**
 * Runs a Git command and returns its standard output.
 *
 * Arguments are passed directly to the Git executable rather than being
 * assembled into a shell command, so paths containing spaces or quotes
 * are handled safely.
 */
function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        encoding: "utf8",
        maxBuffer: MAX_DIFF_BUFFER_SIZE,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new GitCommandError(error.message, String(stderr)));
          return;
        }

        resolve(String(stdout));
      },
    );
  });
}

/**
 * Checks whether a Git command completes successfully.
 */
async function gitCommandSucceeds(args: string[], cwd: string): Promise<boolean> {
  try {
    await runGit(args, cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a platform-specific relative path into a Git-compatible path.
 */
function normalizeGitPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

/**
 * Returns the Git diff between HEAD and the current saved version of a file.
 *
 * The result distinguishes between a real diff, an unchanged file,
 * an untracked file, a repository without a first commit, and a file
 * outside a Git repository.
 *
 * @param filePath - The absolute path of the selected local file.
 */
export async function getFileDiff(filePath: string): Promise<FileDiffResult> {
  const resolvedFilePath = path.resolve(filePath);

  /**
   * Resolve directory aliases such as macOS `/var` → `/private/var`.
   *
   * Only the parent directory is resolved so that a selected symbolic-link
   * file is not replaced with the path of its target.
   */
  const fileDirectory = await realpath(path.dirname(resolvedFilePath));

  const absoluteFilePath = path.join(fileDirectory, path.basename(resolvedFilePath));

  let repositoryRoot: string;

  try {
    const reportedRepositoryRoot = (
      await runGit(["rev-parse", "--show-toplevel"], fileDirectory)
    ).trim();

    /**
     * Canonicalize the repository path as well, ensuring that both paths
     * use the same macOS representation before calculating a relative path.
     */
    repositoryRoot = await realpath(reportedRepositoryRoot);
  } catch (error) {
    if (error instanceof GitCommandError && error.stderr.includes("not a git repository")) {
      return {
        kind: "notGitRepository",
      };
    }

    throw error;
  }

  const relativePath = normalizeGitPath(path.relative(repositoryRoot, absoluteFilePath));

  const hasHead = await gitCommandSucceeds(
    ["rev-parse", "--verify", "--quiet", "HEAD"],
    repositoryRoot,
  );

  if (!hasHead) {
    return {
      kind: "noHead",
      repositoryRoot,
      relativePath,
    };
  }

  const isTracked = await gitCommandSucceeds(
    ["ls-files", "--error-unmatch", "--", relativePath],
    repositoryRoot,
  );

  if (!isTracked) {
    return {
      kind: "untracked",
      repositoryRoot,
      relativePath,
    };
  }

  const diff = await runGit(
    ["diff", "--no-color", "--no-ext-diff", "HEAD", "--", relativePath],
    repositoryRoot,
  );

  if (diff.trim().length === 0) {
    return {
      kind: "noChanges",
      repositoryRoot,
      relativePath,
    };
  }

  return {
    kind: "diff",
    diff,
    repositoryRoot,
    relativePath,
  };
}
