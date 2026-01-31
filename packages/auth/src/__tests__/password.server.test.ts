import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  authenticateWithPassword,
  createUser,
  getUserById,
  addUserToAccount,
} from "../password.server";
import { prisma } from "@secretlobby/db";
import {
  createMockUser,
  createMockUserWithAccounts,
  createMockAuthenticatedUser,
} from "./helpers";

// Mock the Prisma client
vi.mock("@secretlobby/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    accountUser: {
      create: vi.fn(),
    },
  },
}));

describe("Password Hashing and Verification", () => {
  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const password = "SecurePassword123!";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
      // bcrypt hashes start with $2a$ or $2b$
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it("should create different hashes for the same password", async () => {
      const password = "SecurePassword123!";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle special characters in password", async () => {
      const password = "P@ssw0rd!#$%^&*()";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).toMatch(/^\$2[ab]\$/);
    });
  });

  describe("verifyPassword", () => {
    it("should verify a correct password", async () => {
      const password = "SecurePassword123!";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const password = "SecurePassword123!";
      const wrongPassword = "WrongPassword123!";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });

    it("should be case-sensitive", async () => {
      const password = "SecurePassword123!";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword("securepassword123!", hash);

      expect(isValid).toBe(false);
    });

    it("should reject empty password", async () => {
      const password = "SecurePassword123!";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword("", hash);

      expect(isValid).toBe(false);
    });
  });
});

describe("User Creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createUser", () => {
    it("should create a user with email and password", async () => {
      const mockUser = createMockUser({
        email: "newuser@example.com",
        name: "New User",
      });

      vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

      const user = await createUser("newuser@example.com", "Password123!", "New User");

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "newuser@example.com",
          passwordHash: expect.any(String),
          name: "New User",
          emailVerified: false,
        },
      });

      expect(user).toEqual(mockUser);
    });

    it("should lowercase email addresses", async () => {
      const mockUser = createMockUser({ email: "test@example.com" });
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

      await createUser("TEST@EXAMPLE.COM", "Password123!");

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "test@example.com",
          passwordHash: expect.any(String),
          name: null,
          emailVerified: false,
        },
      });
    });

    it("should create user without a name", async () => {
      const mockUser = createMockUser({ name: null });
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

      await createUser("test@example.com", "Password123!");

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "test@example.com",
          passwordHash: expect.any(String),
          name: null,
          emailVerified: false,
        },
      });
    });

    it("should hash the password before storing", async () => {
      const mockUser = createMockUser();
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

      const password = "PlainTextPassword123!";
      await createUser("test@example.com", password);

      const callArgs = vi.mocked(prisma.user.create).mock.calls[0][0];
      expect(callArgs.data.passwordHash).not.toBe(password);
      expect(callArgs.data.passwordHash).toMatch(/^\$2[ab]\$/);
    });
  });
});

describe("Authentication with Password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful authentication", () => {
    it("should authenticate user with correct credentials", async () => {
      const password = "CorrectPassword123!";
      const hash = await hashPassword(password);
      const mockUser = createMockUserWithAccounts({ passwordHash: hash });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await authenticateWithPassword("test@example.com", password);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.user.email).toBe("test@example.com");
        expect(result.user.accounts).toHaveLength(1);
        expect(result.user.accounts[0].role).toBe("OWNER");
      }
    });

    it("should reset failed login attempts on successful login", async () => {
      const password = "CorrectPassword123!";
      const hash = await hashPassword(password);
      const mockUser = createMockUserWithAccounts({
        passwordHash: hash,
        failedLoginAttempts: 2,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      await authenticateWithPassword("test@example.com", password);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "test-user-id" },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: expect.any(Date),
        },
      });
    });

    it("should update lastLoginAt on successful login", async () => {
      const password = "CorrectPassword123!";
      const hash = await hashPassword(password);
      const mockUser = createMockUserWithAccounts({ passwordHash: hash });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const beforeLogin = Date.now();
      await authenticateWithPassword("test@example.com", password);

      const updateCall = vi.mocked(prisma.user.update).mock.calls[0][0];
      const lastLoginAt = updateCall.data.lastLoginAt as Date;
      expect(lastLoginAt.getTime()).toBeGreaterThanOrEqual(beforeLogin);
    });

    it("should handle case-insensitive email lookup", async () => {
      const password = "CorrectPassword123!";
      const hash = await hashPassword(password);
      const mockUser = createMockUserWithAccounts({ passwordHash: hash });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      await authenticateWithPassword("TEST@EXAMPLE.COM", password);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        include: expect.any(Object),
      });
    });
  });

  describe("failed authentication - invalid credentials", () => {
    it("should return error for non-existent user", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await authenticateWithPassword(
        "nonexistent@example.com",
        "Password123!"
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_credentials");
        expect(result.remainingAttempts).toBe(0);
      }
    });

    it("should return error for incorrect password", async () => {
      const correctPassword = "CorrectPassword123!";
      const hash = await hashPassword(correctPassword);
      const mockUser = createMockUserWithAccounts({ passwordHash: hash });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await authenticateWithPassword(
        "test@example.com",
        "WrongPassword123!"
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_credentials");
        expect(result.remainingAttempts).toBe(2); // 3 - 1 = 2
      }
    });

    it("should increment failed login attempts", async () => {
      const password = "CorrectPassword123!";
      const hash = await hashPassword(password);
      const mockUser = createMockUserWithAccounts({
        passwordHash: hash,
        failedLoginAttempts: 1,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      await authenticateWithPassword("test@example.com", "WrongPassword!");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "test-user-id" },
        data: { failedLoginAttempts: 2 },
      });
    });

    it("should return correct remaining attempts", async () => {
      const password = "CorrectPassword123!";
      const hash = await hashPassword(password);

      // First attempt
      const mockUser1 = createMockUserWithAccounts({
        passwordHash: hash,
        failedLoginAttempts: 0,
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser1);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser1);

      const result1 = await authenticateWithPassword("test@example.com", "Wrong1!");
      expect(result1.success).toBe(false);
      if (!result1.success) expect(result1.remainingAttempts).toBe(2);

      // Second attempt
      const mockUser2 = createMockUserWithAccounts({
        passwordHash: hash,
        failedLoginAttempts: 1,
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser2);

      const result2 = await authenticateWithPassword("test@example.com", "Wrong2!");
      expect(result2.success).toBe(false);
      if (!result2.success) expect(result2.remainingAttempts).toBe(1);
    });
  });

  describe("account lockout", () => {
    it("should lock account after max failed attempts", async () => {
      const password = "CorrectPassword123!";
      const hash = await hashPassword(password);
      const mockUser = createMockUserWithAccounts({
        passwordHash: hash,
        failedLoginAttempts: 2, // One more will lock it
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await authenticateWithPassword("test@example.com", "WrongPassword!");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("account_locked");
        expect(result.lockedUntil).toBeInstanceOf(Date);

        // Verify the lockout was set for ~15 minutes in the future
        const lockDuration = result.lockedUntil.getTime() - Date.now();
        expect(lockDuration).toBeGreaterThan(14 * 60 * 1000); // At least 14 minutes
        expect(lockDuration).toBeLessThan(16 * 60 * 1000); // Less than 16 minutes
      }
    });

    it("should prevent login when account is locked", async () => {
      const password = "CorrectPassword123!";
      const hash = await hashPassword(password);
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      const mockUser = createMockUserWithAccounts({
        passwordHash: hash,
        failedLoginAttempts: 3,
        lockedUntil,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      const result = await authenticateWithPassword("test@example.com", password);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("account_locked");
        expect(result.lockedUntil).toEqual(lockedUntil);
      }

      // Verify password was not even checked (no update call)
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("should reset attempts when lock has expired", async () => {
      const password = "CorrectPassword123!";
      const hash = await hashPassword(password);
      const expiredLock = new Date(Date.now() - 1000); // 1 second ago
      const mockUser = createMockUserWithAccounts({
        passwordHash: hash,
        failedLoginAttempts: 3,
        lockedUntil: expiredLock,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      await authenticateWithPassword("test@example.com", password);

      // Should be called twice: once to reset lock, once for successful login
      expect(prisma.user.update).toHaveBeenCalledTimes(2);

      // First call resets the lock
      expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
        where: { id: "test-user-id" },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });

      // Second call updates last login
      expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
        where: { id: "test-user-id" },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: expect.any(Date),
        },
      });
    });

    it("should handle wrong password after expired lock correctly", async () => {
      const password = "CorrectPassword123!";
      const hash = await hashPassword(password);
      const expiredLock = new Date(Date.now() - 1000);
      const mockUser = createMockUserWithAccounts({
        passwordHash: hash,
        failedLoginAttempts: 3,
        lockedUntil: expiredLock,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await authenticateWithPassword("test@example.com", "WrongPassword!");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_credentials");
        // Should start from 0 after lock expired, so remaining = 2
        expect(result.remainingAttempts).toBe(2);
      }
    });
  });
});

describe("User Retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserById", () => {
    it("should return user with accounts", async () => {
      const mockUser = createMockUserWithAccounts();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      const user = await getUserById("test-user-id");

      expect(user).not.toBeNull();
      expect(user?.id).toBe("test-user-id");
      expect(user?.email).toBe("test@example.com");
      expect(user?.accounts).toHaveLength(1);
    });

    it("should return null for non-existent user", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const user = await getUserById("non-existent-id");

      expect(user).toBeNull();
    });

    it("should include account details", async () => {
      const mockUser = createMockUserWithAccounts();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      const user = await getUserById("test-user-id");

      expect(user?.accounts[0]).toMatchObject({
        accountId: "test-account-id",
        role: "OWNER",
        account: {
          id: "test-account-id",
          name: "Test Account",
          slug: "test-account",
        },
      });
    });
  });
});

describe("Account User Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addUserToAccount", () => {
    it("should add user to account with default VIEWER role", async () => {
      const mockAccountUser = {
        id: "account-user-id",
        userId: "user-id",
        accountId: "account-id",
        role: "VIEWER" as const,
        invitedAt: new Date(),
        acceptedAt: new Date(),
        invitedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.accountUser.create).mockResolvedValue(mockAccountUser);

      const result = await addUserToAccount("user-id", "account-id");

      expect(prisma.accountUser.create).toHaveBeenCalledWith({
        data: {
          userId: "user-id",
          accountId: "account-id",
          role: "VIEWER",
          invitedBy: undefined,
          acceptedAt: expect.any(Date),
        },
      });

      expect(result.role).toBe("VIEWER");
    });

    it("should add user with specified role", async () => {
      const mockAccountUser = {
        id: "account-user-id",
        userId: "user-id",
        accountId: "account-id",
        role: "ADMIN" as const,
        invitedAt: new Date(),
        acceptedAt: new Date(),
        invitedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.accountUser.create).mockResolvedValue(mockAccountUser);

      await addUserToAccount("user-id", "account-id", "ADMIN");

      expect(prisma.accountUser.create).toHaveBeenCalledWith({
        data: {
          userId: "user-id",
          accountId: "account-id",
          role: "ADMIN",
          invitedBy: undefined,
          acceptedAt: expect.any(Date),
        },
      });
    });

    it("should track who invited the user", async () => {
      const mockAccountUser = {
        id: "account-user-id",
        userId: "new-user-id",
        accountId: "account-id",
        role: "EDITOR" as const,
        invitedAt: new Date(),
        acceptedAt: new Date(),
        invitedBy: "inviter-id",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.accountUser.create).mockResolvedValue(mockAccountUser);

      await addUserToAccount("new-user-id", "account-id", "EDITOR", "inviter-id");

      expect(prisma.accountUser.create).toHaveBeenCalledWith({
        data: {
          userId: "new-user-id",
          accountId: "account-id",
          role: "EDITOR",
          invitedBy: "inviter-id",
          acceptedAt: expect.any(Date),
        },
      });
    });

    it("should support all role types", async () => {
      const roles = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const;

      for (const role of roles) {
        vi.clearAllMocks();
        const mockAccountUser = {
          id: "account-user-id",
          userId: "user-id",
          accountId: "account-id",
          role,
          invitedAt: new Date(),
          acceptedAt: new Date(),
          invitedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        vi.mocked(prisma.accountUser.create).mockResolvedValue(mockAccountUser);

        await addUserToAccount("user-id", "account-id", role);

        expect(prisma.accountUser.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ role }),
        });
      }
    });
  });
});
