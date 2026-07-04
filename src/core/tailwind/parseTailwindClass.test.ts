import { parseTailwindClass } from "./parseTailwindClass";

const cases = [
  {
    input: "fixed",
    expected: {
      original: "fixed",
      modifiers: [],
      property: "fixed",
      value: null,
    },
  },
  {
    input: "hover:bg-slate-100",
    expected: {
      original: "hover:bg-slate-100",
      modifiers: ["hover"],
      property: "bg",
      value: "slate-100",
    },
  },
  {
    input: "active:scale-95",
    expected: {
      original: "active:scale-95",
      modifiers: ["active"],
      property: "scale",
      value: "95",
    },
  },
  {
    input: "md:hover:bg-red-500",
    expected: {
      original: "md:hover:bg-red-500",
      modifiers: ["md", "hover"],
      property: "bg",
      value: "red-500",
    },
  },
  {
    input: "hover:bg-(--ct-toggle-btn-hover-bg)",
    expected: {
      original: "hover:bg-(--ct-toggle-btn-hover-bg)",
      modifiers: ["hover"],
      property: "bg",
      value: "(--ct-toggle-btn-hover-bg)",
    },
  },
];

for (const testCase of cases) {
  const result = parseTailwindClass(testCase.input);

  console.assert(
    JSON.stringify(result) === JSON.stringify(testCase.expected),
    `Failed: ${testCase.input}
Expected: ${JSON.stringify(testCase.expected)}
Received: ${JSON.stringify(result)}`,
  );
}

console.log("All parseTailwindClass tests passed.");
