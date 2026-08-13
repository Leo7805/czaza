/**
 * Root React component for the CZaza notes webview.
 */

import { useEffect, useMemo, useState } from "react";

import { ResourceNotesView } from "./components/ResourceNotesView";
import { NotesNavigatorView } from "./components/NotesNavigatorView";
import { NoticeModal } from "./components/NoticeModal";
import { RelocateNoteModal } from "./components/RelocateNoteModal";
import { NotesSpaceMenu } from "./components/NotesSpaceMenu";
import { PersonalIdentityModal } from "./components/PersonalIdentityModal";
import type { PersonalIdentityListItem } from "./types";
import type {
  ExtensionToWebviewMessage,
  NotesViewMode,
  NavigatorNotesViewModel,
  NoteRelocateSuggestion,
  NoteRelocateTarget,
  ResourceNotesViewModel,
  WebviewNotice,
  NotesSpaceMenuState,
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
  const [navigatorNotes, setNavigatorNotes] =
    useState<NavigatorNotesViewModel>(initialNavigatorNotes);
  const [notice, setNotice] = useState<WebviewNotice | undefined>();
  const [noteRelocateTarget, setNoteRelocateTarget] = useState<NoteRelocateTarget>();
  const [noteRelocateSuggestion, setNoteRelocateSuggestion] =
    useState<NoteRelocateSuggestion>();
  const [notesSpaceMenu, setNotesSpaceMenu] = useState<NotesSpaceMenuState>();
  const [identityModalOpen, setIdentityModalOpen] = useState(false);
  const [identityDefaults, setIdentityDefaults] = useState<NotesSpaceMenuState["gitIdentity"]>();
  const [pendingIdentity, setPendingIdentity] = useState<PersonalIdentityListItem>();
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

      if (message.type === "openNotesSpaceMenu") {
        setNotesSpaceMenu(message.state);
        setIdentityModalOpen(false);
        return;
      }

      if (message.type === "closeNotesSpaceMenu") {
        setNotesSpaceMenu(undefined);
        return;
      }

      if (message.type === "openNoteRelocate") {
        setNoteRelocateTarget(message.target);
        setNoteRelocateSuggestion(undefined);
        return;
      }

      if (message.type === "noteRelocateSuggestion") {
        setNoteRelocateSuggestion(message.suggestion);
        return;
      }

      if (message.type === "noteRelocated" || message.type === "closeNoteRelocate") {
        setNoteRelocateTarget(undefined);
        setNoteRelocateSuggestion(undefined);
      }
    };

    window.addEventListener("message", handleMessage);
    const closeMenuOnBlur = (): void => {
      vscode?.postMessage({ type: "notesSpaceMenuClosed" });
      setNotesSpaceMenu(undefined);
    };
    const closeMenuWhenHidden = (): void => {
      if (document.hidden) closeMenuOnBlur();
    };
    window.addEventListener("blur", closeMenuOnBlur);
    document.addEventListener("visibilitychange", closeMenuWhenHidden);

    return () => {
      document.removeEventListener("contextmenu", preventDefaultContextMenu, true);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("blur", closeMenuOnBlur);
      document.removeEventListener("visibilitychange", closeMenuWhenHidden);
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
        <NotesNavigatorView navigatorNotes={navigatorNotes} />
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
      {notesSpaceMenu ? (
        <NotesSpaceMenu
          state={notesSpaceMenu}
          onProject={() => {
            vscode?.postMessage({ type: "selectNotesSpace", scope: "project" });
            setNotesSpaceMenu(undefined);
          }}
          onTeam={() => {
            vscode?.postMessage({ type: "selectNotesSpace", scope: "team" });
            setNotesSpaceMenu(undefined);
          }}
          onPersonal={(member) => {
            setPendingIdentity(member);
            setNotesSpaceMenu(undefined);
          }}
          onCreateIdentity={() => {
            setIdentityDefaults(notesSpaceMenu.gitIdentity);
            setIdentityModalOpen(true);
            setNotesSpaceMenu(undefined);
          }}
          onClose={() => {
            vscode?.postMessage({ type: "notesSpaceMenuClosed" });
            setNotesSpaceMenu(undefined);
          }}
        />
      ) : null}
      {identityModalOpen ? (
        <PersonalIdentityModal
          defaultName={identityDefaults?.displayName}
          defaultEmail={identityDefaults?.email}
          onCancel={() => setIdentityModalOpen(false)}
          onSubmit={(displayName, email) => {
            vscode?.postMessage({ type: "createPersonalIdentity", displayName, email });
            setIdentityModalOpen(false);
          }}
        />
      ) : null}
      {pendingIdentity ? (
        <NoticeModal
          tone="warning"
          title="Switch Personal Identity"
          message={`Use ${pendingIdentity.displayName}'s Personal Notes in this workspace? This is a confirmation against accidental selection, not authentication.`}
          actions={[
            { label: "Cancel", variant: "secondary", onClick: () => setPendingIdentity(undefined) },
            {
              label: `Use ${pendingIdentity.displayName}`,
              onClick: () => {
                vscode?.postMessage({ type: "selectPersonalNotes", memberId: pendingIdentity.memberId });
                setPendingIdentity(undefined);
              },
            },
          ]}
          onDismiss={() => setPendingIdentity(undefined)}
        />
      ) : null}
      {noteRelocateTarget ? (
        <RelocateNoteModal
          target={noteRelocateTarget}
          suggestion={noteRelocateSuggestion}
          onCancel={() => {
            vscode?.postMessage({ type: "stopNoteRelocate" });
            setNoteRelocateTarget(undefined);
            setNoteRelocateSuggestion(undefined);
          }}
          onSubmit={(target) => {
            if (target.level === "file") {
              vscode?.postMessage({ type: "relocateFileNote", ...target });
            } else if (target.level === "section") {
              vscode?.postMessage({ type: "relocateSectionNote", ...target });
            } else {
              vscode?.postMessage({ type: "relocateLineNote", ...target });
            }
          }}
        />
      ) : null}
    </main>
  );
}
