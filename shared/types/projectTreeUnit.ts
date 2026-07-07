/**
 * Categorizes a project item by its role in the project.
 */
export type ProjectTreeCategory =
  | "authored" // Project source code maintained by developers.
  | "config" // Project configuration files.
  | "asset" // Static assets such as images, fonts, and icons.
  | "generated" // Files or directories generated automatically by tools.
  | "dependency"; // Third-party dependencies managed by package managers.

export type ProjectTreeStatus = "normal" | "collapsed";

/**
 * Represents a file or directory in the Project Map,
 * providing a high-level overview of the project's structure.
 */
export type ProjectTreeUnit = {
  id: string; // Stable unique identifier.
  kind: "file" | "directory"; // Indicates whether this node is a file or a directory.
  category: ProjectTreeCategory; // Categorizes the project item.
  status: ProjectTreeStatus; // Indicates whether this directory is shown but not expanded.

  path: string; // Relative path from the project root.
  name: string; // Display name of the file or directory.

  description?: string; // Brief description of its purpose.

  /**
   * Child nodes for scanned directories.
   *
   * Missing children means this unit is either a file or an unscanned
   * collapsed directory.
   */
  children?: ProjectTreeUnit[];
};
