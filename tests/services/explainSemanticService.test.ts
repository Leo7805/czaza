import { describe, expect, it } from "vitest";
import type { AiClient } from "@shared/ai/aiClient";
import type { CodeExplanation } from "@shared/types/codeExplanation";
import { explainSemanticService } from "@shared/services/explainSemanticService";

describe("explainSemanticService()", () => {
  it("uses file and structure context and normalizes semanticUnits", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(createFakeAiResponse(), prompts);

    const result = await explainSemanticService(
      {
        sourceCode: createSourceCode(),
        filePath: "src/Button.tsx",
        language: "tsx",
        context: createContext(),
      },
      aiClient,
    );

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Return only semanticUnits");
    expect(prompts[0]).toContain("定义一个按钮组件。");
    expect(prompts[0]).toContain("component:Button:3");
    expect(prompts[0]).toContain("Do not create semanticUnits that duplicate parser-detected structureUnits");

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("semantic:button-styling:4");
    expect(result[0]?.title).toBe("按钮样式定义");
    expect(result[0]?.range).toEqual({
      startLine: 4,
      endLine: 5,
    });
    expect(result[0]?.explanation.summary).toBe("把按钮样式集中到 className。");
  });
});

function createFakeAiClient(response: unknown, prompts: string[]): AiClient {
  return {
    complete: async (prompt) => {
      prompts.push(prompt);

      return `\`\`\`json
${JSON.stringify(response)}
\`\`\``;
    },
  };
}

function createFakeAiResponse() {
  return {
    semanticUnits: [
      {
        id: "semantic:button-styling:4",
        title: "按钮样式定义",
        range: {
          startLine: 4,
          endLine: 5,
        },
        explanation: {
          summary: "把按钮样式集中到 className。",
          detail: "这段逻辑先定义 className，再把它用于 JSX button。",
          aiNotes: [],
        },
      },
      {
        id: "semantic:bad-range:99",
        title: "越界范围",
        range: {
          startLine: 99,
          endLine: 100,
        },
        explanation: {
          summary: "应被丢弃。",
          detail: "",
          aiNotes: [],
        },
      },
    ],
  };
}

function createSourceCode(): string {
  return [
    'import "./Button.css";',
    "// comment should be skipped",
    "export function Button() {",
    '  const className = "px-2 text-sm hover:bg-slate-100";',
    "  return <button className={className}>Save</button>;",
    "}",
  ].join("\n");
}

function createContext(): CodeExplanation {
  return {
    language: "tsx",
    file: {
      explanation: {
        summary: "定义一个按钮组件。",
        detail: "这个文件导出 Button。",
        aiNotes: [],
        userNotes: [],
      },
    },
    structureUnits: [
      {
        id: "component:Button:3",
        kind: "component",
        name: "Button",
        range: {
          startLine: 3,
          endLine: 6,
        },
        code: "",
        explanation: {
          summary: "渲染 Save 按钮。",
          detail: "",
          aiNotes: [],
          userNotes: [],
        },
      },
    ],
    semanticUnits: [],
  };
}
