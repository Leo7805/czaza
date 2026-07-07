/**
 * Provides helpers for mapping editor language identifiers
 * or file extensions to the internal Language type.
 */

import type { Language } from "@shared/types/common";

/**
 * Maps a VS Code language id to the internal Language type.
 *
 * Returns undefined when the language is not supported yet.
 */
export function getLanguageFromId(languageId: string): Language | undefined {
  switch (languageId) {
    case "typescript":
      return "ts";

    case "typescriptreact":
      return "tsx";

    case "javascript":
      return "js";

    case "javascriptreact":
      return "jsx";

    case "csharp":
      return "csharp";

    default:
      return undefined;
  }
}

/**
 * Maps a file path or file name to the internal Language type.
 *
 * This is useful when the caller does not have access to VS Code's
 * TextDocument.languageId.
 */
export function getLanguageFromFilePath(filePath: string): Language | undefined {
  if (filePath.endsWith(".tsx")) {
    return "tsx";
  }

  if (filePath.endsWith(".ts")) {
    return "ts";
  }

  if (filePath.endsWith(".jsx")) {
    return "jsx";
  }

  if (filePath.endsWith(".js")) {
    return "js";
  }

  return undefined;
}
