/**
 * Wraps the VS Code webview API for the React UI.
 */

import type { WebviewToExtensionMessage } from "./types";

/**
 * Minimal VS Code webview API used by this React app.
 */
export type VsCodeWebviewApi = {
  /**
   * Posts a typed message to the extension host.
   *
   * @param message - Message sent to the extension host.
   *
   * @example
   * vscode.postMessage({ type: "ready" });
   */
  postMessage(message: WebviewToExtensionMessage): void;
};

declare global {
  /**
   * Provided by VS Code inside webview JavaScript contexts.
   *
   * @example
   * const vscode = acquireVsCodeApi();
   */
  function acquireVsCodeApi(): VsCodeWebviewApi;
}

let cachedApi: VsCodeWebviewApi | undefined;

/**
 * Returns the VS Code webview API when running inside VS Code.
 *
 * @returns VS Code webview API, or undefined during browser-only development.
 *
 * @example
 * getVsCodeApi()?.postMessage({ type: "ready" });
 */
export function getVsCodeApi(): VsCodeWebviewApi | undefined {
  if (cachedApi) {
    return cachedApi;
  }

  if (typeof acquireVsCodeApi === "function") {
    cachedApi = acquireVsCodeApi();
    return cachedApi;
  }

  return undefined;
}
