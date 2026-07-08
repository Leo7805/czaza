import { describe, expect, it } from "vitest";
import type { AiClient } from "@shared/ai/aiClient";
import type { CodeExplanation } from "@shared/types/codeExplanation";
import { explainLineRangeService } from "@shared/services/explainLineRangeService";

describe("explainLineRangeService()", () => {
  it("normalizes lineUnits with optional tokenUnits for a requested range", async () => {
    const prompts: string[] = [];
    const sourceCode = createSourceCode();
    const aiClient = createFakeAiClient(createFakeAiResponse(), prompts);

    const result = await explainLineRangeService(
      {
        sourceCode,
        filePath: "src/Button.tsx",
        language: "tsx",
        range: {
          startLine: 4,
          endLine: 5,
        },
        context: createContext(),
      },
      aiClient,
    );

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Return only line units for the requested range");
    expect(prompts[0]).toContain("requestedRange: 4-5");
    expect(prompts[0]).toContain("Relevant structure summaries");
    expect(prompts[0]).toContain("Relevant semantic summaries");
    expect(prompts[0]).toContain("Do not return code");

    expect(result).toHaveLength(2);
    expect(result[0]?.lineNumber).toBe(4);
    expect(result[0]?.code).toBe('  const className = "px-2 text-sm hover:bg-slate-100";');
    expect(result[0]?.explanation.summary).toBe("定义按钮样式字符串。");
    expect(result[0]?.tokenUnits?.map((token) => token.text)).toEqual([
      "className",
      "px-2",
      "text-sm",
      "hover:bg-slate-100",
    ]);
    expect(result[0]?.tokenUnits?.[3]?.range).toEqual({
      startLine: 4,
      endLine: 4,
    });
    expect(result[1]?.lineNumber).toBe(5);
    expect(result[1]?.code).toBe("  return <button className={className}>Save</button>;");
    expect(result[1]?.tokenUnits?.map((token) => token.kind)).toEqual([
      "keyword",
      "jsx-tag",
      "jsx-prop",
      "literal",
    ]);
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
    lines: [
      {
        lineNumber: 4,
        explanation: {
          summary: "定义按钮样式字符串。",
          detail: "这一行把按钮要使用的 class 集中放进 className 变量。",
          aiNotes: [],
        },
        tokenUnits: [
          {
            text: "className",
            kind: "identifier",
            explanation: {
              summary: "样式变量名。",
              detail: "保存 JSX button 后续使用的 class 字符串。",
              aiNotes: [],
            },
          },
          {
            text: "px-2",
            kind: "tailwind-class",
            explanation: {
              summary: "水平内边距。",
              detail: "设置左右 padding。",
              aiNotes: [],
            },
          },
          {
            text: "text-sm",
            kind: "tailwind-class",
            explanation: {
              summary: "小号文字。",
              detail: "设置按钮文字大小。",
              aiNotes: [],
            },
          },
          {
            text: "hover:bg-slate-100",
            kind: "tailwind-class",
            explanation: {
              summary: "悬停背景。",
              detail: "hover: 表示鼠标悬停状态，bg-slate-100 设置浅灰背景。",
              aiNotes: [],
            },
          },
        ],
      },
      {
        lineNumber: 5,
        explanation: {
          summary: "返回按钮 JSX。",
          detail: "这一行把 className 传给 button 并显示 Save 文本。",
          aiNotes: [],
        },
        tokenUnits: [
          {
            text: "return",
            kind: "keyword",
            explanation: {
              summary: "返回 JSX。",
              detail: "表示组件输出这个 button 元素。",
              aiNotes: [],
            },
          },
          {
            text: "button",
            kind: "jsx-tag",
            explanation: {
              summary: "按钮标签。",
              detail: "渲染 HTML button 元素。",
              aiNotes: [],
            },
          },
          {
            text: "className",
            kind: "jsx-prop",
            explanation: {
              summary: "样式属性。",
              detail: "React JSX 中用于设置 CSS class。",
              aiNotes: [],
            },
          },
          {
            text: "Save",
            kind: "literal",
            explanation: {
              summary: "按钮文本。",
              detail: "用户看到的按钮文字。",
              aiNotes: [],
            },
          },
        ],
      },
      {
        lineNumber: 99,
        explanation: {
          summary: "越界行。",
          detail: "应被丢弃。",
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
          detail: "",
          aiNotes: [],
          userNotes: [],
        },
      },
    ],
  };
}
