import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  // Auth package tests
  "packages/auth/vitest.config.ts",
  // Logger package tests
  "packages/logger/vitest.config.ts",
  // Add other packages here as we add tests
  // "packages/db/vitest.config.ts",
  // "packages/storage/vitest.config.ts",
  // "packages/payments/vitest.config.ts",
]);
