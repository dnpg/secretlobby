import type { User } from "@secretlobby/db";

/**
 * Creates a mock user object for testing
 */
export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: "test-user-id",
    email: "test@example.com",
    passwordHash: "$2a$12$mockHashValue",
    name: "Test User",
    avatarUrl: null,
    emailVerified: false,
    emailVerifyToken: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    ...overrides,
  };
}

/**
 * Creates a mock authenticated user with accounts
 */
export function createMockAuthenticatedUser() {
  return {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    accounts: [
      {
        accountId: "test-account-id",
        role: "OWNER",
        account: {
          id: "test-account-id",
          name: "Test Account",
          slug: "test-account",
        },
      },
    ],
  };
}

/**
 * Creates a mock user with accounts (full Prisma return)
 */
export function createMockUserWithAccounts(overrides?: Partial<User>) {
  return {
    ...createMockUser(overrides),
    accounts: [
      {
        id: "account-user-id",
        accountId: "test-account-id",
        userId: "test-user-id",
        role: "OWNER" as const,
        invitedAt: new Date(),
        acceptedAt: new Date(),
        invitedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        account: {
          id: "test-account-id",
          name: "Test Account",
          slug: "test-account",
        },
      },
    ],
  };
}

/**
 * Delays execution for testing async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
