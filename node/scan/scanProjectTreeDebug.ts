import type { ProjectTreeUnit, ProjectTreeCategory } from "@shared/types/projectTreeUnit";

type FormatProjectTreeMode = "tree" | "list";

type FormatProjectTreeOptions = {
  color?: boolean;
  mode?: FormatProjectTreeMode;
};

const CATEGORY_LABELS: Record<ProjectTreeCategory, string> = {
  authored: "AUT",
  config: "CFG",
  asset: "AST",
  generated: "GEN",
  dependency: "DEP",
};

const CATEGORY_COLORS: Record<ProjectTreeCategory, string> = {
  authored: "\x1b[32m",
  config: "\x1b[34m",
  asset: "\x1b[36m",
  generated: "\x1b[33m",
  dependency: "\x1b[35m",
};

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const COLLAPSED_COLOR = "\x1b[33m";
const ROOT_COLOR = "\x1b[1m";

export function printProjectTreeDebug(tree: ProjectTreeUnit): void {
  //   console.log("\nRAW JSON\n");
  //   console.dir(tree, { depth: null });

  console.log("\nTREE VIEW\n");
  console.log(formatProjectTree(tree, { color: true }));

  //   console.log("\nLIST VIEW\n");
  //   console.log(formatProjectTree(tree, { color: true, mode: "list" }));
}

/**
 * Formats a project tree into a readable terminal view.
 *
 * This is mainly used for debugging scanner output and snapshot tests.
 */
export function formatProjectTree(
  tree: ProjectTreeUnit,
  options: FormatProjectTreeOptions = {},
): string {
  const lines: string[] = [];
  const useColor = options.color ?? false;
  const mode = options.mode ?? "tree";

  const paint = (text: string, color?: string) => {
    if (!useColor || !color) {
      return text;
    }

    return `${color}${text}${RESET}`;
  };

  const formatCategory = (category: ProjectTreeCategory) => {
    return paint(CATEGORY_LABELS[category], CATEGORY_COLORS[category]);
  };

  const formatRootMeta = (node: ProjectTreeUnit) => {
    const itemCount = node.children?.length ?? 0;
    const itemLabel = itemCount === 1 ? "item" : "items";

    return `${paint("[ROOT]", ROOT_COLOR)} ${paint(`${itemCount} ${itemLabel}`, DIM)}`;
  };

  const formatMeta = (node: ProjectTreeUnit, includePath: boolean) => {
    const metaParts: string[] = [formatCategory(node.category)];

    if (node.kind === "directory") {
      if (node.status === "collapsed") {
        metaParts.push(paint("collapsed", COLLAPSED_COLOR));
      } else {
        metaParts.push(paint(String(node.children?.length ?? 0), DIM));
      }
    }

    const result = [`[${metaParts.join(", ")}]`];

    if (includePath) {
      result.push(paint(`path=${node.path}`, DIM));
    }

    return result.join(" ");
  };

  const visitTree = (node: ProjectTreeUnit, prefix: string, isLast: boolean) => {
    const branch = isLast ? "└── " : "├── ";
    const icon = node.kind === "directory" ? "📁" : "📄";

    const left = `${prefix}${branch}${icon} ${node.name}`;
    lines.push(`${left.padEnd(40, " ")} ${formatMeta(node, false)}`);

    if (!node.children?.length) {
      return;
    }

    const childPrefix = prefix + (isLast ? "    " : "│   ");

    node.children.forEach((child, index) => {
      visitTree(child, childPrefix, index === node.children!.length - 1);
    });
  };

  const visitList = (node: ProjectTreeUnit) => {
    const icon = node.kind === "directory" ? "📁" : "📄";
    const left = `${icon} ${node.name}`;

    lines.push(`${left.padEnd(40, " ")} ${formatMeta(node, true)}`);

    if (!node.children?.length) {
      return;
    }

    node.children.forEach(visitList);
  };

  if (mode === "list") {
    visitList(tree);
    return lines.join("\n");
  }

  const rootLeft = `📁 ${tree.name}`;
  lines.push(`${rootLeft.padEnd(40, " ")} ${formatRootMeta(tree)}`);

  if (tree.children?.length) {
    tree.children.forEach((child, index) => {
      visitTree(child, "", index === tree.children!.length - 1);
    });
  }

  return lines.join("\n");
}
