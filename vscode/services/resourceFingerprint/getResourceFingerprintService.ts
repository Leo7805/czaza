/** Resolves the note capabilities and file-level fingerprint for one resource. */

import * as vscode from "vscode";

import { createFileMetadataHash, createSourceHash } from "@shared/utils/hashUtils";

export type ResourceFingerprint =
  | { kind: "directory" }
  | {
      kind: "text";
      hash: string;
      document: vscode.TextDocument;
      programmingLanguage: string;
    }
  | { kind: "binary"; hash: string };

/**
 * Classifies a resource and creates its file-level fingerprint.
 *
 * Text documents use their complete text. Files that VS Code cannot open as
 * text use filesystem metadata only, so binary content is never loaded.
 */
export async function getResourceFingerprint(
  uri: vscode.Uri,
  document?: vscode.TextDocument,
): Promise<ResourceFingerprint> {
  const stat = await vscode.workspace.fs.stat(uri);

  if (stat.type & vscode.FileType.Directory) {
    return { kind: "directory" };
  }

  const textDocument = document ?? (await tryOpenTextDocument(uri));

  if (textDocument) {
    return {
      kind: "text",
      hash: createSourceHash(textDocument.getText()),
      document: textDocument,
      programmingLanguage: textDocument.languageId,
    };
  }

  return {
    kind: "binary",
    hash: createFileMetadataHash({
      size: stat.size,
      mtime: stat.mtime,
      ctime: stat.ctime,
    }),
  };
}

async function tryOpenTextDocument(uri: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  try {
    return await vscode.workspace.openTextDocument(uri);
  } catch {
    return undefined;
  }
}
