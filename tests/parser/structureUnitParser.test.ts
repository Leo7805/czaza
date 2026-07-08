import { describe, expect, it } from "vitest";
import { parseStructureUnits } from "@shared/parser/structureUnitParser";

describe("parseStructureUnits", () => {
  it("classifies top-level TypeScript and TSX structure units", () => {
    const units = parseTestSource(TOP_LEVEL_STRUCTURE_SOURCE);

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
    const units = parseTestSource(NESTED_STRUCTURE_SOURCE);

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

function parseTestSource(sourceCode: string) {
  return parseStructureUnits({
    sourceCode,
    language: "tsx",
    filePath: "example.tsx",
  });
}

const TOP_LEVEL_STRUCTURE_SOURCE = `
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
`;

const NESTED_STRUCTURE_SOURCE = `
function outer() {
  function inner() {}
}

const group = {
  render() {
    return <div />;
  },
};
`;
