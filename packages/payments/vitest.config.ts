import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "@secretlobby/payments",
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,ts}"],
    setupFiles: ["./src/billing/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@secretlobby/db": path.resolve(__dirname, "../db/src"),
      "@secretlobby/logger/server": path.resolve(
        __dirname,
        "../logger/src/server"
      ),
    },
  },
});
