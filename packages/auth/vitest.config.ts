import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "@secretlobby/auth",
    globals: true,
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/__tests__/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/dist/",
      ],
    },
    include: ["src/**/*.{test,spec}.{js,ts}"],
  },
  resolve: {
    alias: {
      "@secretlobby/db": path.resolve(__dirname, "../db/src"),
    },
  },
});
