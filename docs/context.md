# Current Work Context

## Active Goal

Document and then implement the planned runtime-state source-change architecture that will replace CZaza's Git-aware note update mechanism.

## Current State

- Project-level Architecture Notes were moved out of CZaza into the standalone `lj-arch` Skill at `/Users/leo/Projects/ai-agent-skills/lj-arch`.
- The Skill owns Architecture Notes initialization, language metadata, Mermaid workflow, and deterministic validation.
- The Skill reads `config.json`, resolves its Architecture Notes directory relative to the active project root, and uses its configured content language.
- CZaza no longer initializes or manages project-level Architecture Notes.
- Existing user-generated `.czaza/architecture-notes/` directories remain user data and must not be deleted.
- Runtime State Registry, read-only detection, passive checks, Detail/Navigator status overlays, and hash-guarded confirmation for pure stale content are implemented.
- The first proposed Runtime State architecture document now lives at `.czaza/architecture-notes/diagrams/runtime-state-source-change.md`.
- The proposed persistence gate document lives at `.czaza/architecture-notes/diagrams/source-change-persistence-gate.md`.

## Key Decisions

- Keep file, section, and line Notes inside CZaza.
- Keep cross-file architecture documentation in the independent `lj-arch` Skill.
- Use the Skill's deterministic scripts for initialization and validation.
- Keep the Skill configuration project-portable by storing a project-relative Architecture Notes directory rather than an absolute machine path.
- Use the user's AI Agent for project understanding, Mermaid content, and summaries.
- Do not restore Architecture Notes integration in CZaza unless a future requirement cannot be handled by the Skill.

## Planned Runtime State Architecture

This design is being implemented incrementally; realtime event normalization, location-review confirmation, Candidate Persistence Gate, and Git-aware code removal remain pending.

- Decouple source-change handling from Git concepts such as branches, HEAD revisions, checkout, merge, restore, and transition timing.
- Use three detection sources: precise VS Code document events, file-system watcher events, and passive consistency checks.
- Treat precise user-edit changes as candidates for deterministic line and section relocation.
- Separate deterministic relocation calculation from persistence authority: a supported splice creates an in-memory candidate but does not authorize a Note Store write.
- Require a trusted dirty-to-save lifecycle or explicit user confirmation before a relocation candidate may enter the persistence gate.
- Invalidate pending candidates on watcher, reload, rename, or delete signals, then represent the affected resource through Runtime State.
- Re-read the source and verify its current hash immediately before persistence.
- Treat ambiguous external changes as read-only detection; they must not automatically update persisted Notes.
- Keep derived states such as stale content, location review, missing source, or possible rename in memory rather than in tracked Note JSON or `index.json`.
- Keep proposed Runtime locations out of Detail and Navigator location fields until relocate is explicitly confirmed.
- Store only affected files with non-current runtime state, including the file path, current source hash, status, and optional reason.
- Use the runtime source hash to confirm that the file has not changed again before applying a user-approved update.
- Recompute runtime state after restart through startup, first-open, Navigator, or explicit consistency checks; do not rely on a continuous full-workspace scan.
- Persist Note content, locations, `sourceHash`, and `updatedAt` only after a reliable deterministic edit or an explicit user confirmation.
- Keep file watchers event-driven, debounce duplicate notifications, and inspect only affected files.
- Remove the existing Git transition guard and Git-aware source-change gate only after the runtime-state workflow is implemented and validated.

## Validation

- The `lj-arch` Skill passed the standard Skill validator.
- Its initialization script created a complete test Architecture Notes directory.
- Its validation script passed both an empty initialized outline and a fixture containing a linked Mermaid document.
- Its validation script rejects invalid architecture document status values.
- CZaza's targeted NotesViewProvider tests, full test suite, build, lint, and VSIX packaging passed after removing the integration.
- The packaged VSIX no longer contains Architecture Notes templates or initialization code.

## Next Step

Design the location-review confirmation path without weakening automatic persistence for trusted deterministic edits.
