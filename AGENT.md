# AGENT.md

## Workflow Rules

- Never modify code without my approval.
- Always explain the proposed changes first.
- Wait for my confirmation before generating or editing code.

---

## Code Documentation Rules

Follow these rules whenever you generate or modify code in this project.

### General Rules

- All comments MUST be written in English.
- Every source file MUST include a file-level comment describing its purpose.
- Keep comments concise and explain intent rather than obvious implementation.
- Update comments whenever the related code changes.

---

## TypeScript / JavaScript

For all `.ts`, `.tsx`, `.js`, and `.jsx` files:

- Use **JSDoc** comments.
- Every exported function, class, interface, type, enum, and public method must include JSDoc.
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

- Every file must have a file-level comment.
- Every function must include documentation.
- Public APIs should include an example.
- Add comments only for important or non-obvious logic.
- Do **not** add comments for self-explanatory code.
