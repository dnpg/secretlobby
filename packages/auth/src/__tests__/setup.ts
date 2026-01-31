import { beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@secretlobby/db";

// Mock environment variables for testing
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-must-be-at-least-32-characters-long";
  process.env.AUTH_URL = "http://localhost:3000";
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

// Mock Prisma client - we'll use real database in integration tests
// For unit tests, we'll mock the specific methods we need
export const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  session: {
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  accountUser: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
} as unknown as PrismaClient;

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
