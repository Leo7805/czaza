# Current Work Context

## Active Goal

Document and then implement the planned runtime-state source-change architecture that will replace CZaza's Git-aware note update mechanism.

## Current State

- Project-level Architecture Notes were moved out of CZaza into the standalone `lj-arch` Skill at `/Users/leo/Projects/ai-agent-skills/lj-arch`.
- The Skill owns Architecture Notes initialization, language metadata, Mermaid workflow, and deterministic validation.
- The Skill reads `config.json`, resolves its Architecture Notes directory relative to the active project root, and uses its configured content language.
- CZaza no longer initializes or manages project-level Architecture Notes.
- Existing user-generated `.czaza/architecture-notes/` directories remain user data and must not be deleted.
- Runtime State Registry, read-only detection, passive checks, Detail/Navigator status overlays, Clear Stale, manual Relocate, deterministic relocation, and Undo/Redo history are implemented.
- VS Code document changes that are non-deterministic or non-dirty now refresh session-only Runtime State without mutating persisted Notes; deterministic dirty relocation remains immediate.
- Text-file watcher changes now share the per-document queue with VS Code events and refresh Runtime State without mutating persisted Notes.
- Binary watcher changes now compare metadata hashes and expose File stale Runtime State without mutating persisted Notes.
- Watcher delete events now recheck final path existence before creating session-only `missing` and `locationReview` state; a restored path is inspected as a normal Change instead, and `onWillDeleteFiles` records short-lived deterministic deletion markers so duplicate Watcher notifications are suppressed.
- Runtime State UI refreshes are owned by `NotesRuntimeStateRefreshController`; missing resources overlay the current Notes payload without reopening a deleted source, while other changes reload only the affected current view or Navigator scope.
- Shared Runtime State detection entry points are owned by `RuntimeNoteStateDetectionController`: resource detection classifies text, binary, directory, and missing sources; current-file detection reconciles all Note levels; project File Note detection selects indexed File Note resources and preserves complete per-resource Registry state.
- Generic source/resource coordination belongs to `ChangeTaskCoordinator`, which owns Watcher debounce, per-resource serialization, task invalidation, and deterministic Delete suppression.
- Git HEAD listeners, transition guards, Git-aware gates, and their dedicated tests have been removed; Git-driven disk changes now use the same Watcher and Runtime State path as other external changes.
- File and directory VS Code rename/move/delete/remove events now pass the Resource Access Gate and update all matching Note Store entries immediately without the old Git-aware delay; successful operations also move or clear matching Runtime State.
- Source and resource changes are now documented under one determinism classification: exact VS Code transformations may persist immediately, while ambiguous Watcher and passive events remain in Runtime State.
- Runtime State Architecture Notes are organized as one overview at `.czaza/architecture-notes/diagrams/runtime-state-architecture.md` plus Source Relocation and Resource Change detail documents.
- Candidate Registry and Source Change Persistence Gate are optional future improvements, not current prerequisites.

## Key Decisions

- Keep file, section, and line Notes inside CZaza.
- Keep cross-file architecture documentation in the independent `lj-arch` Skill.
- Use the Skill's deterministic scripts for initialization and validation.
- Keep the Skill configuration project-portable by storing a project-relative Architecture Notes directory rather than an absolute machine path.
- Use the user's AI Agent for project understanding, Mermaid content, and summaries.
- Do not restore Architecture Notes integration in CZaza unless a future requirement cannot be handled by the Skill.

## Planned Runtime State Architecture

The planned Runtime State architecture and Git decoupling are implemented.

- Decouple source-change handling from Git concepts such as branches, HEAD revisions, checkout, merge, restore, and transition timing.
- Use three detection sources: precise VS Code document events, file-system watcher events, and passive consistency checks.
- Apply `isDirty=true` changes immediately when Section and Line relocation can be calculated deterministically.
- Preserve existing content and anchor status when deterministic edits only move Section or Line coordinates.
- Treat ambiguous external changes as read-only detection; they must not automatically update persisted Notes.
- Keep derived states such as stale content, location review, or missing source in memory rather than in tracked Note JSON or `index.json`.
- Ignore Watcher create events and never correlate external Delete/Create events into a guessed rename or move; users relocate missing Notes explicitly.
- Keep proposed Runtime locations out of Detail and Navigator location fields until relocate is explicitly confirmed.
- Store only affected files with non-current runtime state, including the file path, current source hash, status, and optional reason.
- Use the runtime source hash to confirm that the file has not changed again before applying a user-approved update.
- Recompute runtime state after restart through startup, first-open, Navigator, or explicit consistency checks; do not rely on a continuous full-workspace scan.
- Persist Note content, locations, `sourceHash`, and `updatedAt` after a deterministic dirty edit or explicit user confirmation.
- Persist deterministic VS Code rename, move, delete, and remove transformations immediately after Resource Access validation.
- Keep file watchers event-driven, debounce duplicate notifications, and inspect only affected files.
- Keep source-change handling independent of Git branch, HEAD, checkout, merge, restore, and transition timing.

## Validation

- The `lj-arch` Skill passed the standard Skill validator.
- Its initialization script created a complete test Architecture Notes directory.
- Its validation script passed both an empty initialized outline and a fixture containing a linked Mermaid document.
- Its validation script rejects invalid architecture document status values.
- CZaza's targeted NotesViewProvider tests, full test suite, build, lint, and VSIX packaging passed after removing the integration.
- The packaged VSIX no longer contains Architecture Notes templates or initialization code.
- A real VS Code 1.100.0 Extension Host regression now builds and loads the development extension in an isolated temporary workspace, activates CZaza, and verifies its core commands.
- The real Extension Host suite seeds File, Section, and Line Notes, deletes their source through Node's filesystem, recreates different content at the same path, and verifies every persistent Note Store file remains byte-for-byte unchanged after both real Watcher quiet periods.

## Next Step

Extend the real Extension Host suite with a rapid Git branch-switch regression that verifies tracked Note Store files remain unchanged.
