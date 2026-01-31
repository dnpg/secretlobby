import { beforeEach } from "vitest";

// Reset environment variables before each test
beforeEach(() => {
  delete process.env.NODE_ENV;
  delete process.env.SERVICE_NAME;
});
