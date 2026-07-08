import { describe, expect, it } from "vitest";
import { createPathMatcher } from "@node/scan/createPathMatcher";

describe("createPathMatcher()", () => {
  it("matches bare names as files or directories at any depth", () => {
    const matches = createPathMatcher([".DS_Store"]);

    expect(matches(".DS_Store", "file")).toBe(true);
    expect(matches("packages/app/.DS_Store", "file")).toBe(true);
    expect(matches(".DS_Store", "directory")).toBe(true);
  });

  it("matches directory-only patterns at any depth", () => {
    const matches = createPathMatcher([".czaza/", "node_modules/"]);

    expect(matches(".czaza", "directory")).toBe(true);
    expect(matches(".czaza", "file")).toBe(false);
    expect(matches("packages/app/.czaza", "directory")).toBe(true);
    expect(matches("node_modules", "directory")).toBe(true);
    expect(matches("node_modules", "file")).toBe(false);
    expect(matches("packages/app/node_modules", "directory")).toBe(true);
  });

  it("matches root-only patterns from the project root", () => {
    const matches = createPathMatcher(["/dist/"]);

    expect(matches("dist", "directory")).toBe(true);
    expect(matches("packages/app/dist", "directory")).toBe(false);
  });

  it("keeps explicit glob patterns working", () => {
    const matches = createPathMatcher(["**/.custom-cache/**"]);

    expect(matches("packages/app/.custom-cache/result.json", "file")).toBe(true);
    expect(matches("packages/app/src/index.ts", "file")).toBe(false);
  });
});
