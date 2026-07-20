/**
 * Root React component for the CZaza notes webview.
 */

import { useEffect, useMemo, useState } from "react";

import { ResourceNotesView } from "./components/ResourceNotesView";
import { NotesNavigatorView } from "./components/NotesNavigatorView";
import { NoticeModal } from "./components/NoticeModal";
import type {
  ExtensionToWebviewMessage,
  NotesViewMode,
  NavigatorNotesViewModel,
  ResourceNotesViewModel,
  WebviewNotice,
} from "./types";
import { getVsCodeApi } from "./vscodeApi";
import "./styles.css";

const initialNotes: ResourceNotesViewModel = {
  kind: "empty",
  message: "Select a file or directory to view CZaza notes.",
};

const initialNavigatorNotes: NavigatorNotesViewModel = { kind: "empty" };

type RelocatedFileNote = {
  fromRelativePath: string;
  toRelativePath: string;
  sequence: number;
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
  const [viewMode, setViewMode] = useState<NotesViewMode>("detail");
  const [navigatorNotes, setNavigatorNotes] =
    useState<NavigatorNotesViewModel>(initialNavigatorNotes);
  const [notice, setNotice] = useState<WebviewNotice | undefined>();
  const [relocatedFileNote, setRelocatedFileNote] = useState<RelocatedFileNote | undefined>();
  const [relocateTargetPath, setRelocateTargetPath] = useState<string | undefined>();
  const vscode = useMemo(() => getVsCodeApi(), []);

  useEffect(() => {
    vscode?.postMessage({ type: "ready" });

    // VS Code can add its own WebView context menu before React's bubbling
    // handler runs, so prevent the default event during capture as well.
    // Keep native text-editing context menus available inside form fields.
    const preventDefaultContextMenu = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea")) {
        return;
      }

      event.preventDefault();
    };

    document.addEventListener("contextmenu", preventDefaultContextMenu, true);

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as ExtensionToWebviewMessage;

      if (message.type === "resourceNotes") {
        setNotes(message.payload);
        return;
      }

      if (message.type === "navigatorNotes") {
        setNavigatorNotes(message.payload);
        return;
      }

      if (message.type === "notesViewMode") {
        setViewMode(message.mode);
        return;
      }

      if (message.type === "notice") {
        setNotice(message.notice);
        return;
      }

      if (message.type === "navigatorFileNoteRelocated") {
        setRelocatedFileNote((previous) => ({
          fromRelativePath: message.fromRelativePath,
          toRelativePath: message.toRelativePath,
          sequence: (previous?.sequence ?? 0) + 1,
        }));
        return;
      }

      if (message.type === "navigatorRelocateTargetPath") {
        setRelocateTargetPath(message.relativePath);
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
      className={viewMode === "navigator" ? "notes-shell notes-shell--navigator" : "notes-shell"}
      onContextMenu={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("input, textarea")) {
          return;
        }

        event.preventDefault();
      }}
    >
      {viewMode === "detail" ? (
        <ResourceNotesView notes={notes} />
      ) : (
        <NotesNavigatorView
          navigatorNotes={navigatorNotes}
          relocatedFileNote={relocatedFileNote}
          relocateTargetPath={relocateTargetPath}
        />
      )}
      {notice ? (
        <NoticeModal
          tone={notice.tone}
          title={notice.title}
          message={notice.message}
          actions={notice.actions.map((action) => ({
            ...action,
            onClick: () => {
              if (action.action) {
                vscode?.postMessage({ type: "runNoticeAction", action: action.action });
              }
              setNotice(undefined);
            },
          }))}
          onDismiss={() => setNotice(undefined)}
        />
      ) : null}
    </main>
  );
}
