import { useState } from "react";
import { explainTailwindClass } from "@/core/tailwind/explainTailwindClass";
import type { TailwindExplanation } from "@/types";

const examples = [
  "fixed right-4 bottom-4 rounded-full",
  "hover:bg-slate-100 active:scale-95",
  "flex items-center justify-center",
  "dark:hover:bg-slate-100",
  "md:hover:bg-slate-100 md:active:scale-95",
  "fixed z-1000000 grid h-10.5 w-10.5 touch-none place-items-center rounded-full border-0 bg-transparent p-0 text-[20px] leading-none text-(--ct-toggle-btn-color) opacity-60 transition-[background-color,color,opacity,transform] duration-150 ease-out cursor-pointer hover:cursor-pointer hover:-translate-y-px hover:bg-(--ct-toggle-btn-hover-bg) hover:text-(--ct-accent-hover) hover:opacity-80 active:cursor-grabbing active:scale-95 active:bg-(--ct-toggle-btn-hover-active-bg)",
];

export default function TailwindPlayground() {
  const [hoverItem, setHoverItem] = useState<TailwindExplanation | null>(null);

  const renderExplanationItem = (label: string, item: TailwindExplanation["property"] | null) => {
    if (!item) {
      return null;
    }

    return (
      <div key={`${label}-${item.token}`} style={{ marginBottom: 12 }}>
        <strong>
          {label}: {item.token}
        </strong>
        <p>{item.note?.summary ?? "暂未收录."}</p>
        {item.note?.detail && (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              margin: 0,
            }}
          >
            {item.note.detail}
          </pre>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: "40px 40px 67vh" }}>
      <h2>Tailwind Explain Playground</h2>

      {examples.map((example) => (
        <div
          key={example}
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          {example.split(" ").map((className) => (
            <span
              key={className}
              onMouseEnter={() => setHoverItem(explainTailwindClass(className))}
              onMouseLeave={() => setHoverItem(null)}
              style={{
                padding: "6px 10px",
                border: "1px solid #ccc",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              {className}
            </span>
          ))}
        </div>
      ))}

      <div
        style={{
          marginTop: 24,
          minHeight: 120,
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 6,
          background: "#fafafa",
        }}
      >
        {hoverItem ? (
          <>
            <h3>{hoverItem.original}</h3>

            {hoverItem.modifiers.map((item) => renderExplanationItem("modifier", item))}
            {renderExplanationItem("property", hoverItem.property)}
            {renderExplanationItem("value", hoverItem.value)}
          </>
        ) : (
          "Hover 一个 class 看解释"
        )}
      </div>
    </div>
  );
}
