import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getGoogleClient,
  isGoogleConfigured,
  authenticateWithGoogle,
} from "../oauth.server";
import { prisma } from "@secretlobby/db";
import { createMockUser, createMockUserWithAccounts } from "./helpers";

// Mock Arctic Google client
vi.mock("arctic", () => ({
  Google: class MockGoogle {
    clientId: string;
    clientSecret: string;
    redirectUri: string;

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
      this.clientId = clientId;
      this.clientSecret = clientSecret;
      this.redirectUri = redirectUri;
    }
  },
}));

// Mock Prisma
vi.mock("@secretlobby/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("OAuth Google Client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module state by clearing the cache
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getGoogleClient", () => {
    it("should create Google client with correct configuration", () => {
      const client = getGoogleClient();

      expect(client).not.toBeNull();
      expect(client).toHaveProperty("clientId", "test-google-client-id");
      expect(client).toHaveProperty("clientSecret", "test-google-client-secret");
      expect(client).toHaveProperty(
        "redirectUri",
        "http://localhost:3000/auth/google/callback"
      );
    });

    it("should use AUTH_URL from environment for redirect URI", () => {
      // AUTH_URL is set in setup.ts to http://localhost:3000
      const client = getGoogleClient();

      expect(client).toHaveProperty(
        "redirectUri",
        "http://localhost:3000/auth/google/callback"
      );
    });

    it("should cache the Google client instance", () => {
      const client1 = getGoogleClient();
      const client2 = getGoogleClient();

      // Should return the same instance
      expect(client1).toBe(client2);
    });
  });

  describe("isGoogleConfigured", () => {
    it("should return true when properly configured", () => {
      // Ensure env vars are set
      process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";

      expect(isGoogleConfigured()).toBe(true);
    });

    it("should return false when clientId is missing", () => {
      const oldId = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;

      expect(isGoogleConfigured()).toBe(false);

      process.env.GOOGLE_CLIENT_ID = oldId;
    });

    it("should return false when clientSecret is missing", () => {
      const oldSecret = process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_CLIENT_SECRET;

      expect(isGoogleConfigured()).toBe(false);

      process.env.GOOGLE_CLIENT_SECRET = oldSecret;
    });

    it("should return false when clientId contains placeholder text", () => {
      const oldId = process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_CLIENT_ID = "your-google-client-id";

      expect(isGoogleConfigured()).toBe(false);

      process.env.GOOGLE_CLIENT_ID = oldId;
    });

    it("should return false when both are missing", () => {
      const oldId = process.env.GOOGLE_CLIENT_ID;
      const oldSecret = process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      expect(isGoogleConfigured()).toBe(false);

      process.env.GOOGLE_CLIENT_ID = oldId;
      process.env.GOOGLE_CLIENT_SECRET = oldSecret;
    });
  });
});

describe("Google OAuth Authentication", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_ALLOWED_DOMAINS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("authenticateWithGoogle - new user", () => {
    it("should create new user from Google profile", async () => {
      const googleUser = {
        sub: "google-123",
        email: "newuser@example.com",
        name: "New User",
        picture: "https://example.com/avatar.jpg",
        email_verified: true,
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const createdUser = createMockUserWithAccounts({
        email: "newuser@example.com",
        name: "New User",
        avatarUrl: "https://example.com/avatar.jpg",
        emailVerified: true,
        passwordHash: "",
      });

      vi.mocked(prisma.user.create).mockResolvedValue(createdUser);

      const result = await authenticateWithGoogle(googleUser);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "newuser@example.com",
          name: "New User",
          avatarUrl: "https://example.com/avatar.jpg",
          passwordHash: "",
          emailVerified: true,
        },
        include: expect.any(Object),
      });

      expect(result).not.toBeNull();
      expect(result?.email).toBe("newuser@example.com");
      expect(result?.name).toBe("New User");
    });

    it("should lowercase email address", async () => {
      const googleUser = {
        sub: "google-123",
        email: "NEWUSER@EXAMPLE.COM",
        name: "New User",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(
        createMockUserWithAccounts({ email: "newuser@example.com" })
      );

      await authenticateWithGoogle(googleUser);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "newuser@example.com" },
        include: expect.any(Object),
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: "newuser@example.com",
        }),
        include: expect.any(Object),
      });
    });

    it("should handle missing optional fields", async () => {
      const googleUser = {
        sub: "google-123",
        email: "minimal@example.com",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(
        createMockUserWithAccounts({ email: "minimal@example.com" })
      );

      await authenticateWithGoogle(googleUser);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "minimal@example.com",
          name: null,
          avatarUrl: null,
          passwordHash: "",
          emailVerified: true,
        },
        include: expect.any(Object),
      });
    });

    it("should set emailVerified to true for Google users", async () => {
      const googleUser = {
        sub: "google-123",
        email: "verified@example.com",
        email_verified: false, // Even if Google says false, we trust it
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(
        createMockUserWithAccounts()
      );

      await authenticateWithGoogle(googleUser);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          emailVerified: true,
        }),
        include: expect.any(Object),
      });
    });

    it("should set empty password hash for Google-only users", async () => {
      const googleUser = {
        sub: "google-123",
        email: "googleonly@example.com",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(
        createMockUserWithAccounts()
      );

      await authenticateWithGoogle(googleUser);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          passwordHash: "",
        }),
        include: expect.any(Object),
      });
    });
  });

  describe("authenticateWithGoogle - existing user", () => {
    it("should update existing user information", async () => {
      const googleUser = {
        sub: "google-123",
        email: "existing@example.com",
        name: "Updated Name",
        picture: "https://example.com/new-avatar.jpg",
      };

      const existingUser = createMockUserWithAccounts({
        email: "existing@example.com",
        name: "Old Name",
        avatarUrl: "https://example.com/old-avatar.jpg",
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser);
      vi.mocked(prisma.user.update).mockResolvedValue(existingUser);

      const result = await authenticateWithGoogle(googleUser);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "test-user-id" },
        data: {
          name: "Updated Name",
          avatarUrl: "https://example.com/new-avatar.jpg",
          lastLoginAt: expect.any(Date),
          emailVerified: true,
        },
      });

      expect(result).not.toBeNull();
    });

    it("should preserve existing user data when Google data is missing", async () => {
      const googleUser = {
        sub: "google-123",
        email: "existing@example.com",
        // No name or picture
      };

      const existingUser = createMockUserWithAccounts({
        email: "existing@example.com",
        name: "Existing Name",
        avatarUrl: "https://example.com/existing-avatar.jpg",
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser);
      vi.mocked(prisma.user.update).mockResolvedValue(existingUser);

      await authenticateWithGoogle(googleUser);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "test-user-id" },
        data: {
          name: "Existing Name",
          avatarUrl: "https://example.com/existing-avatar.jpg",
          lastLoginAt: expect.any(Date),
          emailVerified: true,
        },
      });
    });

    it("should update lastLoginAt on authentication", async () => {
      const googleUser = {
        sub: "google-123",
        email: "existing@example.com",
      };

      const existingUser = createMockUserWithAccounts();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser);
      vi.mocked(prisma.user.update).mockResolvedValue(existingUser);

      const beforeLogin = Date.now();
      await authenticateWithGoogle(googleUser);

      const updateCall = vi.mocked(prisma.user.update).mock.calls[0][0];
      const lastLoginAt = updateCall.data.lastLoginAt as Date;
      expect(lastLoginAt.getTime()).toBeGreaterThanOrEqual(beforeLogin);
    });

    it("should set emailVerified to true for existing users", async () => {
      const googleUser = {
        sub: "google-123",
        email: "existing@example.com",
      };

      const existingUser = createMockUserWithAccounts({ emailVerified: false });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser);
      vi.mocked(prisma.user.update).mockResolvedValue(existingUser);

      await authenticateWithGoogle(googleUser);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "test-user-id" },
        data: expect.objectContaining({
          emailVerified: true,
        }),
      });
    });

    it("should not call create when user exists", async () => {
      const googleUser = {
        sub: "google-123",
        email: "existing@example.com",
      };

      const existingUser = createMockUserWithAccounts();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser);
      vi.mocked(prisma.user.update).mockResolvedValue(existingUser);

      await authenticateWithGoogle(googleUser);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe("authenticateWithGoogle - domain restrictions", () => {
    it("should allow users from allowed domain", async () => {
      process.env.GOOGLE_ALLOWED_DOMAINS = "example.com";

      const googleUser = {
        sub: "google-123",
        email: "user@example.com",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(
        createMockUserWithAccounts()
      );

      const result = await authenticateWithGoogle(googleUser);

      expect(result).not.toBeNull();
      expect(prisma.user.findUnique).toHaveBeenCalled();
    });

    it("should reject users from non-allowed domain", async () => {
      process.env.GOOGLE_ALLOWED_DOMAINS = "allowedcorp.com";

      const googleUser = {
        sub: "google-123",
        email: "user@notallowed.com",
      };

      const result = await authenticateWithGoogle(googleUser);

      expect(result).toBeNull();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("should support multiple allowed domains", async () => {
      process.env.GOOGLE_ALLOWED_DOMAINS = "company1.com, company2.com, company3.com";

      const googleUser1 = { sub: "1", email: "user@company1.com" };
      const googleUser2 = { sub: "2", email: "user@company2.com" };
      const googleUser3 = { sub: "3", email: "user@company3.com" };
      const googleUser4 = { sub: "4", email: "user@notallowed.com" };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(
        createMockUserWithAccounts()
      );

      const result1 = await authenticateWithGoogle(googleUser1);
      const result2 = await authenticateWithGoogle(googleUser2);
      const result3 = await authenticateWithGoogle(googleUser3);
      const result4 = await authenticateWithGoogle(googleUser4);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result3).not.toBeNull();
      expect(result4).toBeNull();
    });

    it("should handle domains with spaces in configuration", async () => {
      process.env.GOOGLE_ALLOWED_DOMAINS = "  example.com  ,  test.com  ";

      const googleUser = {
        sub: "google-123",
        email: "user@example.com",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(
        createMockUserWithAccounts()
      );

      const result = await authenticateWithGoogle(googleUser);

      expect(result).not.toBeNull();
    });

    it("should be case-insensitive for domain checking", async () => {
      process.env.GOOGLE_ALLOWED_DOMAINS = "EXAMPLE.COM";

      const googleUser = {
        sub: "google-123",
        email: "user@example.com",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(
        createMockUserWithAccounts()
      );

      const result = await authenticateWithGoogle(googleUser);

      expect(result).not.toBeNull();
    });

    it("should allow all domains when GOOGLE_ALLOWED_DOMAINS is not set", async () => {
      delete process.env.GOOGLE_ALLOWED_DOMAINS;

      const googleUser = {
        sub: "google-123",
        email: "user@anydomain.com",
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(
        createMockUserWithAccounts()
      );

      const result = await authenticateWithGoogle(googleUser);

      expect(result).not.toBeNull();
    });
  });

  describe("authenticateWithGoogle - return value", () => {
    it("should return AuthenticatedUser with accounts", async () => {
      const googleUser = {
        sub: "google-123",
        email: "user@example.com",
        name: "Test User",
      };

      const userWithAccounts = createMockUserWithAccounts({
        email: "user@example.com",
        name: "Test User",
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(userWithAccounts);
      vi.mocked(prisma.user.update).mockResolvedValue(userWithAccounts);

      const result = await authenticateWithGoogle(googleUser);

      expect(result).toMatchObject({
        id: "test-user-id",
        email: "user@example.com",
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
      });
    });

    it("should return user with empty accounts array for new user", async () => {
      const googleUser = {
        sub: "google-123",
        email: "newuser@example.com",
      };

      const newUser = createMockUser({
        email: "newuser@example.com",
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        ...newUser,
        accounts: [],
      });

      const result = await authenticateWithGoogle(googleUser);

      expect(result).not.toBeNull();
      expect(result?.accounts).toEqual([]);
    });
  });
});
