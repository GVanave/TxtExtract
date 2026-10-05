import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // "server-only" throws outside the Next.js server bundler; it is a no-op guard in tests.
      "server-only": path.resolve(__dirname, "tests/unit/empty.ts"),
    },
  },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
