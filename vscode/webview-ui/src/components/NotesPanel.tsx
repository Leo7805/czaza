/**
 * Shared outer panel for resource notes views.
 */

import type { ReactNode } from "react";

import { ResourceHeader } from "./ResourceHeader";

/**
 * Renders the notes panel shell with a header and body.
 *
 * @param props - Component props.
 * @param props.kind - Resource kind.
 * @param props.name - Display name.
 * @param props.relativePath - Root-relative path.
 * @param props.showHeaderAction - Whether to show the header action button.
 * @param props.headerActionLabel - Label shown by the header action.
 * @param props.isHeaderActionRunning - Whether the header action is currently running.
 * @param props.onGenerateFileSection - Generates file and section notes.
 * @param props.onGenerateAll - Generates file, section, and line notes.
 * @param props.children - Notes cards rendered inside the panel body.
 * @returns React element for the notes panel.
 *
 * @example
 * <NotesPanel kind="file" name="index.ts" relativePath="src/index.ts" showHeaderAction>
 *   ...
 * </NotesPanel>
 */
export function NotesPanel({
  kind,
  name,
  relativePath,
  showHeaderAction = true,
  headerActionLabel = "Generate",
  isHeaderActionRunning = false,
  onGenerateFileSection,
  onGenerateAll,
  children,
}: {
  kind: "file" | "directory";
  name: string;
  relativePath: string;
  showHeaderAction?: boolean;
  headerActionLabel?: "Generate" | "Regenerate";
  isHeaderActionRunning?: boolean;
  onGenerateFileSection?: () => void;
  onGenerateAll?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="notes-panel">
      <ResourceHeader
        kind={kind}
        name={name}
        relativePath={relativePath}
        showAction={showHeaderAction}
        actionLabel={headerActionLabel}
        isActionRunning={isHeaderActionRunning}
        onGenerateFileSection={onGenerateFileSection}
        onGenerateAll={onGenerateAll}
      />
      <div className="notes-panel__body">{children}</div>
    </section>
  );
}
