import { callDeepSeek } from "@/core/providers/deepseek";
import { explainFilePrompt } from "@/core/prompts/explainFilePrompt";
import type { CodeExplanation } from "@/types";
import { parseTypeScriptSource } from "@/core/parser/typescriptParser";

/**
 * Call ai to explain a given code snippet and returns a structured explanation.
 * @param code
 * @returns
 */
export async function explainFile(code: string): Promise<CodeExplanation> {
  const prompt = explainFilePrompt(code);

  const result = await callDeepSeek(prompt);

  const normalizedResult = result
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const parsedResult = JSON.parse(normalizedResult) as Partial<CodeExplanation> & {
    fileSummary?: string;
  };

  const units = parseTypeScriptSource(code);
  console.log(units);

  return {
    summary: parsedResult.summary ?? parsedResult.fileSummary ?? "",
    mainLogic: Array.isArray(parsedResult.mainLogic) ? parsedResult.mainLogic : [],
    functions: Array.isArray(parsedResult.functions)
      ? parsedResult.functions
          .map((item) => ({
            name: typeof item?.name === "string" ? item.name : "",
            summary: typeof item?.summary === "string" ? item.summary : "",
          }))
          .filter((item) => item.name.length > 0 || item.summary.length > 0)
      : [],
    notes: Array.isArray(parsedResult.notes)
      ? parsedResult.notes.filter((item): item is string => typeof item === "string")
      : [],
  };
}
