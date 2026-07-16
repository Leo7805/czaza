/**
 * Root React component for the CZaza notes webview.
 */

import { useEffect, useMemo, useState } from "react";

import { ResourceNotesView } from "./components/ResourceNotesView";
import { NotesNavigatorView } from "./components/NotesNavigatorView";
import type {
  ExtensionToWebviewMessage,
  NotesViewMode,
<<<<<<< HEAD
  NavigatorNotesViewModel,
=======
>>>>>>> 3f7b5c4acf9dcab7bc90f6cdc6cfcc381965368e
  ResourceNotesViewModel,
} from "./types";
import { getVsCodeApi } from "./vscodeApi";
import "./styles.css";

const initialNotes: ResourceNotesViewModel = {
  kind: "empty",
  message: "Select a file or directory to view CZaza notes.",
};

const initialNavigatorNotes: NavigatorNotesViewModel = { kind: "empty" };

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
  const [viewMode, setViewMode] = useState<NotesViewMode>("detail");
<<<<<<< HEAD
  const [navigatorNotes, setNavigatorNotes] =
    useState<NavigatorNotesViewModel>(initialNavigatorNotes);
=======
>>>>>>> 3f7b5c4acf9dcab7bc90f6cdc6cfcc381965368e
  const vscode = useMemo(() => getVsCodeApi(), []);

  useEffect(() => {
    vscode?.postMessage({ type: "ready" });

    // VS Code can add its own WebView context menu before React's bubbling
    // handler runs, so prevent the default event during capture as well.
    const preventDefaultContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
    };

    document.addEventListener("contextmenu", preventDefaultContextMenu, true);

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as ExtensionToWebviewMessage;

      if (message.type === "resourceNotes") {
        setNotes(message.payload);
        return;
      }

<<<<<<< HEAD
      if (message.type === "navigatorNotes") {
        setNavigatorNotes(message.payload);
        return;
      }

=======
>>>>>>> 3f7b5c4acf9dcab7bc90f6cdc6cfcc381965368e
      if (message.type === "notesViewMode") {
        setViewMode(message.mode);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      document.removeEventListener("contextmenu", preventDefaultContextMenu, true);
      window.removeEventListener("message", handleMessage);
    };
  }, [vscode]);

  return (
    <main
      className="notes-shell"
      data-vscode-context={JSON.stringify({ preventDefaultContextMenuItems: true })}
      onContextMenu={(event) => event.preventDefault()}
    >
      {viewMode === "detail" ? (
        <ResourceNotesView notes={notes} />
      ) : (
<<<<<<< HEAD
        <NotesNavigatorView navigatorNotes={navigatorNotes} />
=======
        <NotesNavigatorView notes={notes} />
>>>>>>> 3f7b5c4acf9dcab7bc90f6cdc6cfcc381965368e
      )}
    </main>
  );
}
