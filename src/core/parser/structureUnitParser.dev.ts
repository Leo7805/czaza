import { parseStructureUnits } from "./structureUnitParser";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  console.assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}
Expected: ${JSON.stringify(expected)}
Received: ${JSON.stringify(actual)}`,
  );
}

const code = `
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

function outer() {
  function inner() {}
}

const group = {
  render() {
    return <div />;
  },
};
`;

const units = parseStructureUnits({
  sourceCode: code,
  language: "tsx",
  filePath: "example.tsx",
});

assertEqual(
  units.map((unit) => [unit.name, unit.kind]),
  [
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
    ["outer", "function"],
    ["group", "variable"],
  ],
  "structure units should be classified by top-level blocks",
);

assertEqual(
  units.some((unit) => unit.name === "inner"),
  false,
  "nested function declarations should not be extracted as top-level structure units",
);

assertEqual(
  units.some((unit) => unit.name === "render"),
  false,
  "object methods inside variable statements should not be extracted as structure units",
);

assertEqual(
  parseStructureUnits({
    sourceCode: "public class User {}",
    language: "csharp",
    filePath: "User.cs",
  }),
  [],
  "unsupported languages should return no structure units",
);

console.log("All structureUnitParser tests passed.");
