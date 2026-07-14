/**
 * Root React component for the CZaza notes webview.
 */

import { useEffect, useMemo, useState } from "react";

import { ResourceNotesView } from "./components/ResourceNotesView";
import type { ExtensionToWebviewMessage, ResourceNotesViewModel } from "./types";
import { getVsCodeApi } from "./vscodeApi";
import "./styles.css";

const initialNotes: ResourceNotesViewModel = {
  kind: "empty",
  message: "Select a file or directory to view CZaza notes.",
};

/**
 * Renders notes for the currently selected VS Code resource.
 *
 * @returns React element for the webview.
 *
 * @example
 * <App />
 */
export function App() {
  const [notes, setNotes] = useState<ResourceNotesViewModel>(initialNotes);
  const vscode = useMemo(() => getVsCodeApi(), []);

  useEffect(() => {
    vscode?.postMessage({ type: "ready" });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as ExtensionToWebviewMessage;

      if (message.type === "resourceNotes") {
        setNotes(message.payload);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, [vscode]);

  return (
    <main className="notes-shell">
      <ResourceNotesView notes={notes} />
    </main>
  );
}
