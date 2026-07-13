# AGENT.md

## Workflow Rules

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
- Every exported function, class, interface, type, enum, and public method must include JSDoc.
- Internal functions should include JSDoc only when their purpose, behavior, side effects, or constraints are not immediately obvious.
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

## Generated Code Requirements

When generating or modifying code:

- Every source file must have a file-level comment.
- Public APIs must include JSDoc.
- Public APIs should include usage examples whenever practical.
- Add comments only where they improve readability.
- Prefer descriptive names over explanatory comments.
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
- Do not remove or weaken tests simply to make them pass.
- Run the smallest relevant validation first whenever possible.
- Clearly report which validations were actually performed (tests, build, lint, type check, etc.).
- Never claim code has been tested unless it was actually tested.

---

## Security Rules

- Never hard-code secrets, API keys, passwords, or tokens.
- Never expose secrets in logs.
- Mask sensitive values when displaying them.
- Never commit sensitive configuration or local environment files.
