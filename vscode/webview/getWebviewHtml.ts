/**
 * Builds the CZaza description webview HTML from native HTML, CSS, and JS assets.
 *
 * The webview runtime files are intentionally kept as normal frontend files so
 * UI edits do not require TypeScript string escaping.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads the description view assets from the extension root and injects them
 * into VS Code's required single HTML string.
 */
export function getWebviewHtml(extensionRootPath: string) {
  const styles = readWebviewFile(extensionRootPath, "descriptionView.css");
  const markup = readWebviewFile(extensionRootPath, "descriptionView.html");
  const script = readWebviewFile(extensionRootPath, "descriptionView.js");

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
${styles}
  </style>
</head>
<body>
${markup}

  <script>
${script}
  </script>
</body>
</html>
`;
}

/**
 * Reads a webview asset relative to the extension installation directory.
 */
function readWebviewFile(extensionRootPath: string, fileName: string) {
  return readFileSync(path.join(extensionRootPath, "vscode", "webview", fileName), "utf8");
}
