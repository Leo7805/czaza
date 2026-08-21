Ignore rules should match at any directory depth (\*\*/...) rather than only project root, so the scanner remains efficient even when scanning a workspace containing multiple projects.

## Case-Insensitive Note Path Matching

CZaza treats file paths as case-insensitive when matching Notes, while displaying the file name using the current real filesystem path.

## Scoped Team and Personal Note Store Access

Every interactive Notes workflow resolves its project and Team or Personal identity once, then uses a `ScopedWorkspaceNoteStore` for all reads, writes, relocation, and Runtime State checks. The scoped cache rejects attempts to access a different identity, preventing a missing location argument from silently falling back from Personal Notes to Team Notes.

The root `WorkspaceNoteStore` remains the shared repository and cache owner. Explicit Team fallback is allowed only at compatibility boundaries where no Notes scope provider exists, such as isolated tests and legacy command-line workflows.

## Agent Notes Response Language

CZaza publishes the validated `czaza.ai.responseLanguage` value with the active Notes runtime selection. The standalone Agent Notes CLI returns that value from `current`, allowing the CZaza Skill to write AI explanations in the same language as extension-generated Notes. Legacy runtime selections without a language default to English.
