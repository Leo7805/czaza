/**
 * Parses source code into structure units. ( TypeScript, TSX, JavaScript, JSX for now)
 *
 * This file is the entry point for extracting parser-detected
 * code structures such as components, functions, hooks, and classes.
 */

import ts from "typescript";
import type { Language } from "@shared/types/common";
import type { BasicStructureUnit, StructureUnitKind } from "@shared/types/structureUnit";

type TypeScriptLikeLanguage = Extract<Language, "ts" | "tsx" | "js" | "jsx">;

/**
 * Input for parsing structure units from source code.
 */
export type ParseStructureUnitsInput = {
  /** Source code content from the active editor. */
  sourceCode: string;

  /** Programming language of the source code. */
  language: Language;

  /** Optional file path for future language detection or diagnostics. */
  filePath?: string;
};

/**
 * Parses structure units from source code.
 *
 * The first implementation returns an empty list.
 * AST extraction logic will be added incrementally.
 */
export function parseStructureUnits(input: ParseStructureUnitsInput): BasicStructureUnit[] {
  const { sourceCode, language, filePath } = input;

  if (isTypeScriptLikeLanguage(language)) {
    return parseTypeScriptStructureUnits(sourceCode, language, filePath);
  }

  return [];
}

/**
 * Parses TypeScript, TSX, JavaScript, and JSX source code into structure units.
 */
function parseTypeScriptStructureUnits(
  sourceCode: string,
  language: TypeScriptLikeLanguage,
  filePath?: string,
): BasicStructureUnit[] {
  /**
   * Parses the source code into a TypeScript AST (SourceFile),
   * which serves as the root node for structure extraction.
   */
  const sourceFile = ts.createSourceFile(
    filePath ?? `temp.${language}`, // TypeScript requires a filename to create a SourceFile, so use a temporary one when the real path is unavailable.
    sourceCode,
    ts.ScriptTarget.Latest, // Parse the source code using the latest supported ECMAScript syntax.
    true,
    getScriptKind(language),
  );

  const units: BasicStructureUnit[] = [];

  /**
   * Visits only top-level AST nodes and extracts supported structure units.
   * Once a supported unit is found, its child nodes are intentionally not scanned.
   */
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      units.push(createBasicStructureUnit(sourceFile, node, getFunctionKind(node), node.name.text));
      return;
    }

    if (ts.isClassDeclaration(node) && node.name) {
      units.push(createBasicStructureUnit(sourceFile, node, "class", node.name.text));
      return;
    }

    if (ts.isInterfaceDeclaration(node)) {
      units.push(createBasicStructureUnit(sourceFile, node, "interface", node.name.text));
      return;
    }

    if (ts.isTypeAliasDeclaration(node)) {
      units.push(createBasicStructureUnit(sourceFile, node, "type", node.name.text));
      return;
    }

    if (ts.isEnumDeclaration(node)) {
      units.push(createBasicStructureUnit(sourceFile, node, "enum", node.name.text));
      return;
    }

    if (ts.isVariableStatement(node)) {
      units.push(...parseVariableStatement(sourceFile, node));
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return units;
}

/**
 * Extracts structure units from a variable statement.
 */
function parseVariableStatement(
  sourceFile: ts.SourceFile,
  node: ts.VariableStatement,
): BasicStructureUnit[] {
  const units: BasicStructureUnit[] = [];

  for (const declaration of node.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name)) {
      continue;
    }

    const name = declaration.name.text;
    const kind = getVariableKind(name, declaration.initializer);

    units.push(createBasicStructureUnit(sourceFile, node, kind, name));
  }

  return units;
}

/**
 * Classifies a function declaration as a React component, custom hook, or normal function.
 */
function getFunctionKind(node: ts.FunctionDeclaration): StructureUnitKind {
  const name = node.name?.text ?? "";

  if (isHookName(name)) {
    return "hook";
  }

  if (isComponentName(name) && containsJsx(node)) {
    return "component";
  }

  return "function";
}

/**
 * Classifies a variable declaration as a component, hook, or variable.
 */
function getVariableKind(name: string, initializer: ts.Expression | undefined): StructureUnitKind {
  if (initializer && isFunctionLikeExpression(initializer)) {
    if (isHookName(name)) {
      return "hook";
    }

    if (isComponentName(name) && containsJsx(initializer)) {
      return "component";
    }

    return "function";
  }

  return "variable";
}

/**
 * Returns true when a name follows the React custom hook naming convention.
 */
function isHookName(name: string): boolean {
  return /^use[A-Z0-9]/.test(name);
}

/**
 * Returns true when a name follows the React component naming convention.
 */
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * Returns true for arrow functions and function expressions.
 */
function isFunctionLikeExpression(node: ts.Expression): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function isTypeScriptLikeLanguage(language: Language): language is TypeScriptLikeLanguage {
  return language === "ts" || language === "tsx" || language === "js" || language === "jsx";
}

/**
 * Checks whether a node contains JSX syntax.
 */
function containsJsx(node: ts.Node): boolean {
  let found = false;

  /**
   * Recursively scans child nodes until JSX is found.
   */
  function visit(child: ts.Node): void {
    if (found) {
      return;
    }

    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      found = true;
      return;
    }

    ts.forEachChild(child, visit);
  }

  visit(node);

  return found;
}

/**
 * Creates a BasicStructureUnit from a TypeScript AST node.
 */
function createBasicStructureUnit(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  kind: StructureUnitKind,
  name: string,
): BasicStructureUnit {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  return {
    id: `${kind}:${name}:${start.line + 1}`,
    kind,
    name,
    range: {
      startLine: start.line + 1,
      endLine: end.line + 1,
    },
    code: node.getText(sourceFile),
  };
}

/**
 * Maps the internal language type to TypeScript's ScriptKind.
 */
function getScriptKind(language: TypeScriptLikeLanguage): ts.ScriptKind {
  switch (language) {
    case "tsx":
      return ts.ScriptKind.TSX;

    case "jsx":
      return ts.ScriptKind.JSX;

    case "js":
      return ts.ScriptKind.JS;

    case "ts":
    default:
      return ts.ScriptKind.TS;
  }
}
