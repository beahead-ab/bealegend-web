import { describe, expect, it } from "vitest";
import declaredVersion from "../VERSION?raw";
import manifest from "../package.json";
import viteConfig from "../vite.config.ts?raw";
import versionSource from "./version.ts?raw";
import { APP_VERSION } from "./version";

/**
 * VERSION is the only place this product's version is allowed to live. These
 * fail if the bundle, the package manifest or anything else shows a different
 * number.
 */
describe("product version", () => {
  const declared = declaredVersion.trim();

  it("is a bare semantic version", () => {
    expect(declared).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is what the built bundle reports", () => {
    expect(APP_VERSION).toBe(declared);
  });

  /** npm keeps its own version field. It is not the source — it is a copy, and
   *  a copy that drifts is worse than no copy at all. */
  it("is what package.json states", () => {
    expect(manifest.version).toBe(declared);
  });

  it("is injected by the build rather than written in source", () => {
    expect(viteConfig).toContain("./VERSION");
    expect(versionSource).not.toMatch(/\d+\.\d+\.\d+/);
  });
});
