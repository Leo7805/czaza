/**
 * Renders an empty or unavailable resource state.
 */

/**
 * Renders a centered message when no notes can be shown.
 *
 * @param props - Component props.
 * @param props.message - Empty state message.
 * @returns React element for an empty state.
 *
 * @example
 * <EmptyState message="Select a file or directory to view CZaza notes." />
 */
export function EmptyState({ message }: { message: string }) {
  return (
    <section className="notes-empty">
      <p>{message}</p>
    </section>
  );
}
