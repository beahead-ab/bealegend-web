import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * The one authoritative source for this product's version — see
 * docs/VERSIONERING.md in the backend repo. Read here and injected, so the
 * bundle cannot state a version of its own and package.json cannot drift from
 * it. A test fails if either does.
 */
const productVersion = readFileSync(new URL("./VERSION", import.meta.url), "utf8").trim();

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(productVersion) },
  server: { port: 5174 },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
