import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateVerificationToken,
  createVerificationToken,
  verifyEmailWithToken,
  resendVerificationEmail,
  isEmailVerified,
  generateVerificationUrl,
  sendVerificationEmail,
} from "../verification.server";
import { prisma } from "@secretlobby/db";
import { createMockUser } from "./helpers";

// Mock Prisma
vi.mock("@secretlobby/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock email sending
vi.mock("@secretlobby/email", () => ({
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
}));

import { sendEmailVerification } from "@secretlobby/email";

describe("Email Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateVerificationToken", () => {
    it("should generate a 64-character hex token", () => {
      const token = generateVerificationToken();

      expect(token).toBeDefined();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate unique tokens", () => {
      const token1 = generateVerificationToken();
      const token2 = generateVerificationToken();

      expect(token1).not.toBe(token2);
    });

    it("should generate cryptographically random tokens", () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateVerificationToken());
      }

      // All 100 tokens should be unique
      expect(tokens.size).toBe(100);
    });
  });

  describe("createVerificationToken", () => {
    it("should create token and update user", async () => {
      const mockUser = createMockUser();
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const token = await createVerificationToken("user-123");

      expect(token).toBeDefined();
      expect(token).toHaveLength(64);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: {
          emailVerifyToken: token,
          emailVerified: false,
        },
      });
    });

    it("should set emailVerified to false", async () => {
      const mockUser = createMockUser();
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      await createVerificationToken("user-123");

      const updateCall = vi.mocked(prisma.user.update).mock.calls[0][0];
      expect(updateCall.data.emailVerified).toBe(false);
    });
  });

  describe("verifyEmailWithToken", () => {
    it("should verify email with valid token", async () => {
      const validToken = "a".repeat(64); // 64-character hex token
      const mockUser = createMockUser({
        id: "user-123",
        emailVerifyToken: validToken,
        emailVerified: false,
      });

      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockUser,
        emailVerified: true,
        emailVerifyToken: null,
      });

      const result = await verifyEmailWithToken(validToken);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe("user-123");
      }
    });

    it("should clear token after verification", async () => {
      const token = "a".repeat(64); // 64-character token
      const mockUser = createMockUser({
        id: "test-user-id",
        emailVerifyToken: token,
        emailVerified: false,
      });

      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockUser,
        emailVerified: true,
        emailVerifyToken: null,
      });

      await verifyEmailWithToken(token);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "test-user-id" },
        data: {
          emailVerified: true,
          emailVerifyToken: null,
        },
      });
    });

    it("should reject invalid token format", async () => {
      const result = await verifyEmailWithToken("short-token");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_token");
      }
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it("should reject empty token", async () => {
      const result = await verifyEmailWithToken("");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_token");
      }
    });

    it("should reject non-existent token", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const result = await verifyEmailWithToken("a".repeat(64));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_token");
      }
    });

    it("should reject already verified email", async () => {
      const mockUser = createMockUser({
        emailVerifyToken: "a".repeat(64),
        emailVerified: true, // Already verified
      });

      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);

      const result = await verifyEmailWithToken("a".repeat(64));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("already_verified");
      }
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("resendVerificationEmail", () => {
    it("should resend verification for unverified user", async () => {
      const mockUser = createMockUser({
        email: "test@example.com",
        emailVerified: false,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await resendVerificationEmail("test@example.com");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.token).toBeDefined();
        expect(result.token).toHaveLength(64);
        expect(result.userId).toBe(mockUser.id);
      }
    });

    it("should lowercase email address", async () => {
      const mockUser = createMockUser({
        email: "test@example.com",
        emailVerified: false,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      await resendVerificationEmail("TEST@EXAMPLE.COM");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
    });

    it("should return error for non-existent user", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await resendVerificationEmail("nonexistent@example.com");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("user_not_found");
      }
    });

    it("should return error for already verified user", async () => {
      const mockUser = createMockUser({
        emailVerified: true,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      const result = await resendVerificationEmail("test@example.com");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("already_verified");
      }
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("should generate new token when resending", async () => {
      const mockUser = createMockUser({
        emailVerifyToken: "old-token",
        emailVerified: false,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const result = await resendVerificationEmail("test@example.com");

      if (result.success) {
        expect(result.token).not.toBe("old-token");
      }
    });
  });

  describe("isEmailVerified", () => {
    it("should return true for verified email", async () => {
      const mockUser = createMockUser({ emailVerified: true });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      const result = await isEmailVerified("user-123");

      expect(result).toBe(true);
    });

    it("should return false for unverified email", async () => {
      const mockUser = createMockUser({ emailVerified: false });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      const result = await isEmailVerified("user-123");

      expect(result).toBe(false);
    });

    it("should return false for non-existent user", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await isEmailVerified("non-existent");

      expect(result).toBe(false);
    });

    it("should only select emailVerified field", async () => {
      const mockUser = createMockUser();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      await isEmailVerified("user-123");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-123" },
        select: { emailVerified: true },
      });
    });
  });

  describe("generateVerificationUrl", () => {
    it("should generate verification URL with token", () => {
      const token = "abc123def456";
      const baseUrl = "https://console.secretlobby.co";

      const url = generateVerificationUrl(token, baseUrl);

      expect(url).toBe("https://console.secretlobby.co/verify-email?token=abc123def456");
    });

    it("should remove trailing slash from base URL", () => {
      const token = "abc123";
      const baseUrl = "https://console.secretlobby.co/";

      const url = generateVerificationUrl(token, baseUrl);

      expect(url).toBe("https://console.secretlobby.co/verify-email?token=abc123");
    });

    it("should work with localhost URLs", () => {
      const token = "abc123";
      const baseUrl = "http://localhost:3000";

      const url = generateVerificationUrl(token, baseUrl);

      expect(url).toBe("http://localhost:3000/verify-email?token=abc123");
    });

    it("should work with custom domains", () => {
      const token = "abc123";
      const baseUrl = "https://custom.domain.com";

      const url = generateVerificationUrl(token, baseUrl);

      expect(url).toBe("https://custom.domain.com/verify-email?token=abc123");
    });
  });

  describe("sendVerificationEmail", () => {
    it("should send verification email to user", async () => {
      const mockUser = createMockUser({
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        emailVerified: false,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      const baseUrl = "https://console.secretlobby.co";
      const token = await sendVerificationEmail("user-123", baseUrl);

      expect(token).toBeDefined();
      expect(token).toHaveLength(64);
      expect(sendEmailVerification).toHaveBeenCalledWith({
        to: "test@example.com",
        verificationUrl: expect.stringContaining("/verify-email?token="),
        userName: "Test User",
      });
    });

    it("should throw error for non-existent user", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(
        sendVerificationEmail("non-existent", "https://console.secretlobby.co")
      ).rejects.toThrow("User not found");
    });

    it("should throw error for already verified email", async () => {
      const mockUser = createMockUser({
        emailVerified: true,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      await expect(
        sendVerificationEmail("user-123", "https://console.secretlobby.co")
      ).rejects.toThrow("Email already verified");
    });

    it("should handle user without name", async () => {
      const mockUser = createMockUser({
        email: "test@example.com",
        name: null,
        emailVerified: false,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      await sendVerificationEmail("user-123", "https://console.secretlobby.co");

      expect(sendEmailVerification).toHaveBeenCalledWith({
        to: "test@example.com",
        verificationUrl: expect.any(String),
        userName: undefined,
      });
    });

    it("should create verification token in database", async () => {
      const mockUser = createMockUser({
        emailVerified: false,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      await sendVerificationEmail("user-123", "https://console.secretlobby.co");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: {
          emailVerifyToken: expect.any(String),
          emailVerified: false,
        },
      });
    });

    it("should use baseUrl in verification URL", async () => {
      const mockUser = createMockUser({
        email: "test@example.com",
        emailVerified: false,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser);

      await sendVerificationEmail("user-123", "https://custom.domain.com");

      expect(sendEmailVerification).toHaveBeenCalledWith({
        to: "test@example.com",
        verificationUrl: expect.stringContaining("https://custom.domain.com/verify-email"),
        userName: expect.anything(),
      });
    });
  });
});
