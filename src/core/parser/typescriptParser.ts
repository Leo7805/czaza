import ts from "typescript";

export type SourceUnit = {
  id: string;
  kind: string;
  name: string;
  startLine: number;
  endLine: number;
  code: string;
};

export function parseTypeScriptSource(code: string): SourceUnit[] {
  const sourceFile = ts.createSourceFile(
    "temp.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const units: SourceUnit[] = [];

  function getLine(pos: number): number {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  }

  function addUnit(node: ts.Node, kind: string, name: string) {
    units.push({
      id: `${kind}:${name}:${node.pos}`,
      kind,
      name,
      startLine: getLine(node.getStart(sourceFile)),
      endLine: getLine(node.getEnd()),
      code: node.getText(sourceFile),
    });
  }

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addUnit(node, "function", node.name.text);
    }

    if (ts.isInterfaceDeclaration(node)) {
      addUnit(node, "interface", node.name.text);
    }

    if (ts.isTypeAliasDeclaration(node)) {
      addUnit(node, "type", node.name.text);
    }

    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach((declaration) => {
        const name = declaration.name.getText(sourceFile);
        const init = declaration.initializer;

        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          addUnit(declaration, "function", name);
        }
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return units;
}
