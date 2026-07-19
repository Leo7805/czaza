/**
 * Selects the correct notes view for the current resource payload.
 */

import type { ResourceNotesViewModel } from "../types";
import { BinaryFileNotesView } from "./BinaryFileNotesView";
import { DirectoryNotesView } from "./DirectoryNotesView";
import { EmptyState } from "./EmptyState";
import { FileNotesView } from "./FileNotesView";

/**
 * Renders the top-level resource notes view.
 *
 * @param props - Component props.
 * @param props.notes - Current resource notes payload.
 * @returns React element for the selected resource state.
 *
 * @example
 * <ResourceNotesView notes={notes} />
 */
export function ResourceNotesView({ notes }: { notes: ResourceNotesViewModel }) {
  if (notes.kind === "empty") {
    return <EmptyState message={notes.message} />;
  }

  if (notes.kind === "outsideRoot") {
    return <EmptyState message="This resource is outside the configured CZaza root." />;
  }

  if (notes.kind === "directory") {
    return <DirectoryNotesView notes={notes} />;
  }

  if (notes.kind === "binary") {
    return <BinaryFileNotesView notes={notes} />;
  }

  return <FileNotesView notes={notes} />;
}
