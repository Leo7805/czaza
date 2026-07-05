/**
 * Categorizes a project item by its role in the project.
 */
export type ProjectMapCategory =
  | "authored" // Project source code maintained by developers.
  | "config" // Project configuration files.
  | "asset" // Static assets such as images, fonts, and icons.
  | "generated" // Files or directories generated automatically by tools.
  | "dependency"; // Third-party dependencies managed by package managers.

/**
 * Represents a file or directory in the Project Map,
 * providing a high-level overview of the project's structure.
 */
export type ProjectMapUnit = {
  id: string; // Stable unique identifier.
  kind: "file" | "directory"; // Indicates whether this node is a file or a directory.
  category: ProjectMapCategory; // Categorizes the project item.
  path: string; // Relative path from the project root.
  name: string; // Display name of the file or directory.
  description: string; // Brief description of its purpose.
  children?: ProjectMapUnit[]; // Child nodes for directories.
};
