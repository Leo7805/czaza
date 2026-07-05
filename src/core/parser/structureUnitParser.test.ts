import { describe, expect, it } from "vitest";
import { parseStructureUnits } from "./structureUnitParser";

describe("parseStructureUnits", () => {
  it("classifies top-level TypeScript and TSX structure units", () => {
    const units = parseStructureUnits({
      sourceCode: `
function normalFn() {}

function useDeclaredThing() {}

const useValue = 1;

const useArrowThing = () => {};

const App = () => <div />;

const value = 123;

interface User {}

type UserId = string;

enum Status {
  Ready,
}

class Service {}
`,
      language: "tsx",
      filePath: "example.tsx",
    });

    expect(units.map((unit) => [unit.name, unit.kind])).toEqual([
      ["normalFn", "function"],
      ["useDeclaredThing", "hook"],
      ["useValue", "variable"],
      ["useArrowThing", "hook"],
      ["App", "component"],
      ["value", "variable"],
      ["User", "interface"],
      ["UserId", "type"],
      ["Status", "enum"],
      ["Service", "class"],
    ]);
  });

  it("keeps variable statements as coarse structure blocks", () => {
    const units = parseStructureUnits({
      sourceCode: "const a = 1, b = () => {};",
      language: "ts",
      filePath: "example.ts",
    });

    expect(units).toHaveLength(2);
    expect(units.map((unit) => [unit.name, unit.kind])).toEqual([
      ["a", "variable"],
      ["b", "function"],
    ]);
    expect(units[0]?.code).toBe("const a = 1, b = () => {};");
    expect(units[1]?.code).toBe("const a = 1, b = () => {};");
  });

  it("does not extract nested declarations inside recognized top-level blocks", () => {
    const units = parseStructureUnits({
      sourceCode: `
function outer() {
  function inner() {}
}

const group = {
  render() {
    return <div />;
  },
};
`,
      language: "tsx",
      filePath: "example.tsx",
    });

    expect(units.map((unit) => [unit.name, unit.kind])).toEqual([
      ["outer", "function"],
      ["group", "variable"],
    ]);
    expect(units.some((unit) => unit.name === "inner")).toBe(false);
    expect(units.some((unit) => unit.name === "render")).toBe(false);
  });

  it("returns no units for unsupported languages", () => {
    expect(
      parseStructureUnits({
        sourceCode: "public class User {}",
        language: "csharp",
        filePath: "User.cs",
      }),
    ).toEqual([]);
  });
});
