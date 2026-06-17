import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    // Default environment is node — keeps siwe/session-token/supabase-schema tests unaffected.
    // The world-map test opts into jsdom via its own `// @vitest-environment jsdom` docblock.
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
});
