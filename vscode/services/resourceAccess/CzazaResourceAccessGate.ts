/**
 * Enforces the workspace and managed-output boundary for CZaza resource operations.
 */

import * as vscode from "vscode";

import { isCzazaNoteStoreRelativePath } from "@shared/utils/managedOutputPath";
import { getCzazaSettings, type CzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
  type ResolvedCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";

/** Reason a resource cannot participate in source-note operations. */
export type CzazaResourceAccessDenialReason =
  | "unsupportedScheme"
  | "outsideWorkspace"
  | "outsideRoot"
  | "noteStore";

/** Resolved resource scope returned after every access check succeeds. */
export type AllowedCzazaResourceAccess = {
  allowed: true;
  relativePath: string;
  root: ResolvedCzazaRootDirectory;
  settings: CzazaSettings;
};

/** Rejected resource scope with a stable reason for UI and service handling. */
export type DeniedCzazaResourceAccess = {
  allowed: false;
  reason: CzazaResourceAccessDenialReason;
};

/** Result of checking whether one URI may be used by CZaza source-note operations. */
export type CzazaResourceAccessResult =
  | AllowedCzazaResourceAccess
  | DeniedCzazaResourceAccess;

/**
 * Evaluates one URI against the CZaza source-resource boundary.
 *
 * @param uri - Resource requested by a UI, command, service, or event.
 * @returns Allowed scope details or a stable denial reason.
 *
 * @example
 * const access = evaluateCzazaResourceAccess(document.uri);
 * if (access.allowed) {
 *   console.log(access.relativePath);
 * }
 */
export function evaluateCzazaResourceAccess(uri: vscode.Uri): CzazaResourceAccessResult {
  if (uri.scheme !== "file") {
    return { allowed: false, reason: "unsupportedScheme" };
  }

  if (!vscode.workspace.getWorkspaceFolder(uri)) {
    return { allowed: false, reason: "outsideWorkspace" };
  }

  let root: ResolvedCzazaRootDirectory;

  try {
    root = resolveCzazaRootDirectory(uri);
  } catch {
    return { allowed: false, reason: "outsideRoot" };
  }

  let relativePath: string;

  try {
    relativePath = getCzazaRelativePath(uri, root.rootDirectory);
  } catch {
    return { allowed: false, reason: "outsideRoot" };
  }

  const settings = getCzazaSettings(uri);

  if (isCzazaNoteStoreRelativePath(root.rootDirectory, settings.outputDirectory, relativePath)) {
    return { allowed: false, reason: "noteStore" };
  }

  return {
    allowed: true,
    relativePath,
    root,
    settings,
  };
}

/**
 * Requires one URI to pass the CZaza source-resource boundary.
 *
 * @param uri - Resource requested by a write-capable operation.
 * @returns Resolved allowed resource scope.
 * @throws When the resource is unsupported, outside the workspace or root, or managed by CZaza.
 *
 * @example
 * const access = requireCzazaResourceAccess(document.uri);
 * await save(access.relativePath);
 */
export function requireCzazaResourceAccess(uri: vscode.Uri): AllowedCzazaResourceAccess {
  const result = evaluateCzazaResourceAccess(uri);

  if (result.allowed) {
    return result;
  }

  throw new Error(getCzazaResourceAccessDenialMessage(result.reason));
}

/**
 * Creates a user-facing explanation for one resource denial.
 *
 * @param reason - Stable denial reason returned by the Gate.
 * @returns Human-readable denial message.
 */
export function getCzazaResourceAccessDenialMessage(
  reason: CzazaResourceAccessDenialReason,
): string {
  switch (reason) {
    case "unsupportedScheme":
      return "CZaza Notes can only operate on local file resources.";
    case "outsideWorkspace":
      return "The selected resource is outside the open VS Code workspace folders.";
    case "outsideRoot":
      return "The selected resource is outside the configured CZaza root directory.";
    case "noteStore":
      return "CZaza Note Store files cannot have source notes.";
  }
}
