export const COMMON_RESPONSE_RULES = `
- Write all explanation text in Simplified Chinese.
- Keep variable names, function names, class names, file names, APIs, and package names in English.
- The goal is to help the reader understand the code. Do not suggest edits, rewrites, refactors, or style changes unless an aiNote must call out a real risk.
- Return only valid JSON. Do not include markdown fences or extra text.
`;

export const COMMON_EXPLANATION_RULES = `
- explanation.summary must be concise.
- explanation.detail must explain purpose, behavior, and important context without being exhaustive.
- explanation.aiNotes should contain useful extra context only when needed. Use [] when there are none.
`;
