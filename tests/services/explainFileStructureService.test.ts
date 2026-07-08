import { describe, expect, it } from "vitest";
import type { AiClient } from "@shared/ai/aiClient";
import { explainFileStructureService } from "@shared/services/explainFileStructureService";

describe("explainFileStructureService()", () => {
  it("normalizes file and structure layers while dropping semantic, line, and token output", async () => {
    const prompts: string[] = [];
    const sourceCode = createSourceCode();
    const aiClient = createFakeAiClient(createFakeAiResponse(), prompts);

    const result = await explainFileStructureService(
      {
        sourceCode,
        language: "tsx",
        filePath: "src/Button.tsx",
        userNote: "用户补充：这个按钮用于保存表单。",
      },
      aiClient,
    );

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('Return a stable JSON object for mode "file-structure"');
    expect(prompts[0]).toContain("Parser-detected structure units");
    expect(prompts[0]).toContain("component:Button:3");
    expect(prompts[0]).toContain("Do not return semanticUnits, lines, or tokenUnits");
    expect(prompts[0]).toContain("Do not return kind, name, range, or code for structureUnits");
    expect(prompts[0]).not.toContain('"semanticUnits"');
    expect(prompts[0]).not.toContain('"lines"');
    expect(result.file.explanation.summary).toBe("定义一个按钮组件。");
    expect(result.file.explanation.aiNotes).toEqual(["className 包含 Tailwind 状态样式。"]);
    expect(result.file.explanation.userNotes).toEqual(["用户补充：这个按钮用于保存表单。"]);

    expect(result.structureUnits).toHaveLength(1);
    expect(result.structureUnits[0]?.id).toBe("component:Button:3");
    expect(result.structureUnits[0]?.code).toBe(sourceCode.split("\n").slice(2, 6).join("\n"));
    expect(result.structureUnits[0]?.explanation.summary).toBe("渲染 Save 按钮。");

    expect(result.semanticUnits).toEqual([]);
    expect(result.lines).toBeUndefined();
  });
});

function createSourceCode(): string {
  return [
    'import "./Button.css";',
    "// comment should be skipped",
    "export function Button() {",
    '  const className = "px-2 text-sm hover:bg-slate-100";',
    "  return <button className={className}>Save</button>;",
    "}",
    "",
  ].join("\n");
}

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
    language: "tsx",
    file: {
      explanation: {
        summary: "定义一个按钮组件。",
        detail: "这个文件导出 Button，用 className 控制按钮样式。",
        aiNotes: ["className 包含 Tailwind 状态样式。"],
      },
    },
    structureUnits: [
      {
        id: "component:Button:3",
        explanation: {
          summary: "渲染 Save 按钮。",
          detail: "这个结构单元负责返回一个带 Tailwind className 的 button。",
          aiNotes: [],
        },
      },
      {
        id: "function:Fake:99",
        explanation: {
          summary: "AI 编造的结构单元，应被忽略。",
          detail: "",
          aiNotes: [],
        },
      },
    ],
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
          detail: "这段逻辑先定义 Tailwind class，再把它传给 JSX button。",
          aiNotes: [],
        },
      },
    ],
    lines: [
      {
        lineNumber: 4,
        explanation: {
          summary: "主 explainFileStructureService 不应该接收 line 输出。",
          detail: "行级解释会由独立服务处理。",
          aiNotes: [],
        },
      },
    ],
  };
}
