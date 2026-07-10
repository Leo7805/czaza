---
name: locate
description: Locate relevant code in the workspace without editing. Use when the user asks where a UI, feature, bug, function, or behavior is implemented.
---

# Locate

If this skill is loaded, the first line of your response MUST be:

[👉 Locate Skill Loaded]

Then locate the code.

## Goal

Find the most relevant code locations quickly.

## Rules

1. Search the workspace before answering.
2. Do not modify code.
3. Prefer Codex-native clickable file links when possible.
4. Return 1-4 locations only.
5. For each location, include only:
   - clickable file link
   - symbol name
   - one short purpose sentence
6. Do not explain the implementation.
7. Do not include code snippets.
8. Stop after locating.

## Output Style

Use Codex-native file links, for example:

- src/components/Button.tsx (line 42) — `Button` — main UI component.
- src/components/ButtonItem.tsx (line 18) — `ButtonItem` — row renderer.
