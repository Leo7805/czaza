/**
 * Shared prompt rule blocks for AI response formatting and analysis style.
 */

/**
 * Common JSON output rules for AI-first DTO prompts.
 *
 * These rules intentionally do not define the response language because that
 * comes from the user's VS Code AI response language setting.
 *
 * @example
 * const prompt = `Rules:\n${COMMON_JSON_OUTPUT_RULES}`;
 */
export const COMMON_JSON_OUTPUT_RULES = `
- Return only valid JSON.
- Do not include markdown fences.
- Do not include explanatory text outside the JSON object.
`;

/**
 * Common source-code reference rules for AI-first code analysis prompts.
 *
 * @example
 * const prompt = `Rules:\n${COMMON_CODE_REFERENCE_RULES}`;
 */
export const COMMON_CODE_REFERENCE_RULES = `
- Keep code identifiers, API names, file names, package names, and string literals unchanged.
- Do not invent source code, line numbers, file paths, imports, or APIs.
`;

/**
 * Common analysis style rules for AI-first code explanation prompts.
 *
 * @example
 * const prompt = `Rules:\n${COMMON_ANALYSIS_STYLE_RULES}`;
 */
export const COMMON_ANALYSIS_STYLE_RULES = `
- Focus on what the code does and why it exists.
- Explain behavior, responsibility, and important context.
- Do not suggest edits, rewrites, refactors, or style changes unless an aiNote must call out a real risk.
- Keep explanations concise but specific.
- The response language instruction above is mandatory for all natural-language explanation text.
- Write summary, detail, and aiNotes in the requested response language.
- Do not switch explanation language because the source code or surrounding context uses another language.
`;

/**
 * Common aiNotes rules for AI-first DTO prompts.
 *
 * @example
 * const prompt = `Rules:\n${COMMON_AI_NOTES_RULES}`;
 */
export const COMMON_AI_NOTES_RULES = `
- aiNotes must contain useful extra context only when needed.
- Use aiNotes for risks, assumptions, edge cases, surprising behavior, or important caveats.
- Use [] when there are no useful notes.
`;

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
