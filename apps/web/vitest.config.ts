import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // server-only throws in vitest; alias to a no-op so server-side modules are testable.
      "server-only": path.resolve(__dirname, "test/__mocks__/server-only.ts"),
    },
  },
  test: {
    // Default environment is node — keeps siwe/session-token/supabase-schema tests unaffected.
    // The world-map test opts into jsdom via its own `// @vitest-environment jsdom` docblock.
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
});
