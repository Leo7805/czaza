# AGENTS.md

## Workflow Rules

- Before proposing or making code changes:
  - Read `AGENTS.md`.
  - Read relevant existing project documentation, including `docs/DECISIONS.md`.
  - Read `docs/ARCHITECTURE.md` and `docs/context.md` when those files exist and are relevant.
  - Inspect the existing implementation before proposing a solution.
- Never modify code without my approval.
- Always explain the proposed changes before writing any code.
- Before implementation, provide:
  - The files that will be modified.
  - A brief explanation of each change.
  - Any new files, renamed files, or deleted files.
  - Any potential risks or breaking changes.
  - A brief validation plan.
- Wait for my confirmation before generating or editing code.

---

## Communication

- Keep explanations concise, practical, and specific to the current task.
- Explain architecture, state, and workflow concepts in plain language before using technical terms.
- When introducing a technical term, explain what it means, why it exists, and give one short concrete example.
- Do not use a technical label as the complete explanation. For example, instead of only saying “there is no Relocation Candidate Registry,” explain: “CZaza currently writes calculated line changes directly to Notes. It does not yet have an in-memory waiting area that temporarily holds those changes until the file is safely saved. That waiting area is called the Relocation Candidate Registry.”
- Prefer a simple core proposal that covers the main 80–90% of the requirement. Keep optional edge cases, extra safeguards, and broader improvements in a short “Future Improvements” section, and do not include them in the implementation unless the user approves them. Do not defer issues involving data loss, security, or correctness.
- Before implementation, explain the proposed approach and affected files.
- After implementation, briefly explain what changed and why.
- Clearly identify assumptions, risks, side effects, and unresolved limitations.
- Do not present planned or unperformed work as completed.

---

## General Development Principles

- Make the smallest safe change that solves the problem.
- Only modify code directly related to the approved task.
- Avoid unrelated refactoring, formatting, renaming, or dependency upgrades.
- Follow the existing project architecture, naming conventions, and coding style.
- Reuse existing code whenever practical.
- Before introducing new utilities, helpers, abstractions, or modules, check whether similar functionality already exists.
- Prefer extending existing implementations over creating parallel ones.
- Do not duplicate logic unless there is a clear and documented reason.
- Prefer consistency with the existing project over introducing new patterns.
- Avoid over-engineering. Do not introduce abstractions for hypothetical future requirements.
- Inspect the existing implementation before proposing changes. Do not invent APIs, files, project structures, or behaviors.
- Prefer native platform APIs before introducing libraries.
- Prefer user experience and maintainability over unnecessary feature count.

---

## File Organization

- Each source file should have one clear responsibility.
- Prefer splitting files by responsibility rather than by line count.
- Aim to keep source files under **300 lines**.
- If a file grows beyond **300 lines**, evaluate whether it contains multiple responsibilities.
- Files over **500 lines** should normally be split unless there is a clear reason not to (for example: configuration, generated code, or test files).
- Avoid creating unnecessary tiny files simply to satisfy a line limit.

---

## Code Documentation Rules

Follow these rules whenever you generate or modify code.

### General Rules

- All comments MUST be written in English.
- Every source file MUST include a file-level comment describing its purpose.
- Keep comments concise.
- Explain intent, design decisions, assumptions, or non-obvious logic.
- Do **not** comment obvious code.
- Update comments whenever related code changes.

---

## TypeScript / JavaScript

For all `.ts`, `.tsx`, `.js`, and `.jsx` files:

- Use **JSDoc** comments.
- Every class, function, and method must include a concise JSDoc comment, including non-exported classes, internal functions, and private methods.
- Class comments must describe the class responsibility and any relevant lifecycle or resource-ownership behavior.
- Exported classes should include `@example` whenever practical.
- Functions and methods must include `@param` and `@returns` whenever applicable.
- Constructors only need separate JSDoc when they perform non-obvious setup or accept parameters that require explanation.
- Simple anonymous callbacks, getters, and setters do not require separate JSDoc unless their behavior or side effects are non-obvious.
- Include `@param`, `@returns`, and `@example` whenever applicable.

Example:

```ts
/**
 * Calculates the total price including tax.
 *
 * @param price - Original price.
 * @param taxRate - Tax rate as a decimal.
 * @returns The final price including tax.
 *
 * @example
 * const total = calculateTotal(100, 0.1);
 */
function calculateTotal(price: number, taxRate: number): number {
  return price * (1 + taxRate);
}
```

---

## Import Paths

- Use aliases already configured by the relevant TypeScript project, such as `@shared/*` and `@vscode/*`, for cross-directory imports.
- Use `./` for imports within the same directory.
- Follow the surrounding code when no configured alias fits.
- Do not introduce a new import alias or perform a broad import rewrite without approval.

---

## Generated Code Requirements

- Every generated or modified source file must retain or receive an accurate file-level comment.
- Public APIs must include JSDoc and should include usage examples whenever practical.
- Prefer descriptive names over comments that merely restate the code.
- Avoid deeply nested control flow when a simpler structure is available.

---

## Dependency Rules

- Do not add, remove, or upgrade dependencies without approval.
- Prefer existing project dependencies and platform APIs.
- Explain why a new dependency is needed before using it.

---

## Compatibility Rules

- Preserve existing behavior unless the approved task explicitly changes it.
- Do not change public interfaces without approval.
- Clearly identify any breaking changes before implementation.

---

## Validation Rules

After implementing changes:

- Update or add tests when behavior changes.
- Put tests under the existing root `tests/` directory and follow its current subsystem structure.
- Prefer pure logic tests without a DOM environment when behavior does not depend on browser APIs.
- Add a DOM test environment only when the behavior genuinely requires it.
- Do not remove or weaken tests simply to make them pass.
- Run the smallest relevant validation first whenever possible.
- Run relevant scripts that actually exist in `package.json`, such as targeted Vitest tests, `npm run build`, and `npm run lint`.
- For manual VS Code extension testing, use an Extension Development Host. Package or install a VSIX only when packaging behavior is relevant.
- Clearly report which validations were actually performed (tests, build, lint, type check, etc.).
- Never claim code has been tested unless it was actually tested.

---

## Testing Report

After implementation:

- List every automated validation command that was actually run and its result.
- Clearly distinguish completed automated validation from manual testing that remains.
- List each requested manual check on a separate line and include its expected result.
- Include relevant edge cases that should be checked manually.
- If no manual testing is necessary, explicitly say why.

---

## Documentation

- Update documentation when architecture, durable behavior, workflows, or significant decisions change.
- Prefer updating existing documentation such as `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md`.
- Do not create documentation files that do not serve a clear persistent purpose.
- Keep durable architectural decisions out of transient implementation comments.

---

## Persistent Context

- Use `docs/context.md`, when present or explicitly approved for creation, as a concise persistent handoff for work that continues across sessions or agents.
- Write persistent context in English.
- Read it when resuming paused work, recovering from lost context, or switching to a substantially different project area.
- Update it only when the active goal, implementation state, key decision, blocker, validation result, or next step materially changes.
- Replace stale information instead of appending a chronological conversation log.
- Keep it concise and link to durable documentation instead of duplicating it.
- Never store secrets, credentials, tokens, or private user data in it.
- The primary coordinating agent is its default writer; sub-agents may only write when ownership is explicitly delegated.

---

## Change Summary

After every implementation:

- Organize the summary by file.
- List every added, modified, moved, or deleted source, test, documentation, and configuration file.
- Present each existing file as a clickable Markdown link.
- Give each file a one-line description of its responsibility and what changed.
- Under each file, list every added or materially changed class, function, and method with a one-line description.
- Do not list unchanged functions.
- Clearly identify moved or deleted paths that can no longer be linked.
- Report only the automated validations that were actually run.
- List remaining manual tests with one expected result per test.
- End with one suggested commit message using Conventional Commits format.

---

## Maintainability

- Prefer fixing root causes over applying temporary patches.
- Keep the codebase clean and consistent with its current architecture.
- Improve surrounding code only when the improvement is small, directly related, and within the approved scope.
- Do not mix an optional large refactor into a feature or bug fix.
- Propose beneficial larger refactors separately.
- Do not introduce a workaround when a clean solution is reasonably achievable.

---

## Security Rules

- Never hard-code secrets, API keys, passwords, or tokens.
- Never expose secrets in logs.
- Mask sensitive values when displaying them.
- Never commit sensitive configuration or local environment files.
