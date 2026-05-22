/**
 * Vitest setup for the billing module.
 *
 * We deliberately do NOT touch the database from these tests — they
 * are unit tests against the signature verifier, idempotency check,
 * and webhook dispatch logic with Prisma fully mocked.
 *
 * If you find yourself wanting a real database here, write an
 * integration test in a separate file and gate it behind a
 * `--integration` flag.
 */

import { beforeAll, afterEach, vi } from "vitest";

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_vitest";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy_for_vitest";
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  vi.clearAllMocks();
});
