import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSession,
  createSessionResponse,
  updateSession,
  destroySession,
  isLoggedIn,
  isAdmin,
  hasAccountAccess,
  requireAuth,
  requireUserAuth,
  requireAccountAccess,
  requireAdminRole,
  type SessionData,
} from "../session.server";

// Mock iron-session
vi.mock("iron-session", () => ({
  getIronSession: vi.fn(),
}));

import { getIronSession } from "iron-session";

describe("Session Management", () => {
  let mockSession: SessionData & { save: () => Promise<void>; destroy: () => void };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock session object
    mockSession = {
      save: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
    };

    // Mock getIronSession to return our mock session
    vi.mocked(getIronSession).mockResolvedValue(mockSession);
  });

  describe("getSession", () => {
    it("should return session and response", async () => {
      const request = new Request("http://localhost:3000");

      const result = await getSession(request);

      expect(result.session).toBeDefined();
      expect(result.response).toBeInstanceOf(Response);
      expect(getIronSession).toHaveBeenCalledWith(
        request,
        expect.any(Response),
        expect.objectContaining({
          cookieName: "secretlobby-session",
          password: expect.any(String),
        })
      );
    });

    it("should configure session with proper cookie options", async () => {
      const request = new Request("http://localhost:3000");

      await getSession(request);

      expect(getIronSession).toHaveBeenCalledWith(
        request,
        expect.any(Response),
        expect.objectContaining({
          cookieName: "secretlobby-session",
          cookieOptions: expect.objectContaining({
            httpOnly: true,
            sameSite: "lax",
          }),
        })
      );
    });
  });

  describe("createSessionResponse", () => {
    it("should create session with redirect", async () => {
      const request = new Request("http://localhost:3000");
      const sessionData: Partial<SessionData> = {
        userId: "user-123",
        userEmail: "test@example.com",
      };

      const response = await createSessionResponse(sessionData, request, "/dashboard");

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/dashboard");
      expect(mockSession.save).toHaveBeenCalled();
      expect(mockSession.userId).toBe("user-123");
      expect(mockSession.userEmail).toBe("test@example.com");
    });

    it("should merge session data", async () => {
      const request = new Request("http://localhost:3000");
      mockSession.userId = "existing-user";

      const sessionData: Partial<SessionData> = {
        currentAccountId: "account-123",
        currentAccountRole: "OWNER",
      };

      await createSessionResponse(sessionData, request, "/");

      expect(mockSession.userId).toBe("existing-user");
      expect(mockSession.currentAccountId).toBe("account-123");
      expect(mockSession.currentAccountRole).toBe("OWNER");
    });

    it("should save session before returning", async () => {
      const request = new Request("http://localhost:3000");
      const sessionData: Partial<SessionData> = { userId: "user-123" };

      await createSessionResponse(sessionData, request, "/");

      expect(mockSession.save).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateSession", () => {
    it("should update session data", async () => {
      const request = new Request("http://localhost:3000");
      const updates: Partial<SessionData> = {
        currentAccountId: "new-account-id",
        currentAccountSlug: "new-account",
      };

      const result = await updateSession(request, updates);

      expect(result.session).toBeDefined();
      expect(result.response).toBeInstanceOf(Response);
      expect(mockSession.currentAccountId).toBe("new-account-id");
      expect(mockSession.currentAccountSlug).toBe("new-account");
      expect(mockSession.save).toHaveBeenCalled();
    });

    it("should preserve existing session data", async () => {
      const request = new Request("http://localhost:3000");
      mockSession.userId = "user-123";
      mockSession.userEmail = "test@example.com";

      await updateSession(request, { currentAccountId: "account-123" });

      expect(mockSession.userId).toBe("user-123");
      expect(mockSession.userEmail).toBe("test@example.com");
      expect(mockSession.currentAccountId).toBe("account-123");
    });

    it("should handle multiple updates", async () => {
      const request = new Request("http://localhost:3000");

      const updates: Partial<SessionData> = {
        userId: "user-123",
        userEmail: "test@example.com",
        userName: "Test User",
        currentAccountId: "account-123",
        currentAccountSlug: "test-account",
        currentAccountRole: "OWNER",
      };

      await updateSession(request, updates);

      expect(mockSession.userId).toBe("user-123");
      expect(mockSession.userEmail).toBe("test@example.com");
      expect(mockSession.userName).toBe("Test User");
      expect(mockSession.currentAccountId).toBe("account-123");
      expect(mockSession.currentAccountSlug).toBe("test-account");
      expect(mockSession.currentAccountRole).toBe("OWNER");
    });
  });

  describe("destroySession", () => {
    it("should destroy session and redirect", async () => {
      const request = new Request("http://localhost:3000");

      const response = await destroySession(request, "/login");

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/login");
      expect(mockSession.destroy).toHaveBeenCalled();
    });

    it("should redirect to specified location", async () => {
      const request = new Request("http://localhost:3000");

      const response = await destroySession(request, "/goodbye");

      expect(response.headers.get("Location")).toBe("/goodbye");
    });
  });
});

describe("Session Auth Helpers", () => {
  describe("isLoggedIn", () => {
    it("should return true when userId is set", () => {
      const session: SessionData = { userId: "user-123" };
      expect(isLoggedIn(session)).toBe(true);
    });

    it("should return false when userId is not set", () => {
      const session: SessionData = {};
      expect(isLoggedIn(session)).toBe(false);
    });

    it("should return false when userId is empty string", () => {
      const session: SessionData = { userId: "" };
      expect(isLoggedIn(session)).toBe(false);
    });

    it("should return false when userId is undefined", () => {
      const session: SessionData = { userId: undefined };
      expect(isLoggedIn(session)).toBe(false);
    });
  });

  describe("isAdmin", () => {
    it("should return true for OWNER role", () => {
      const session: SessionData = {
        userId: "user-123",
        currentAccountRole: "OWNER",
      };
      expect(isAdmin(session)).toBe(true);
    });

    it("should return true for ADMIN role", () => {
      const session: SessionData = {
        userId: "user-123",
        currentAccountRole: "ADMIN",
      };
      expect(isAdmin(session)).toBe(true);
    });

    it("should return false for EDITOR role", () => {
      const session: SessionData = {
        userId: "user-123",
        currentAccountRole: "EDITOR",
      };
      expect(isAdmin(session)).toBe(false);
    });

    it("should return false for VIEWER role", () => {
      const session: SessionData = {
        userId: "user-123",
        currentAccountRole: "VIEWER",
      };
      expect(isAdmin(session)).toBe(false);
    });

    it("should support legacy isAdmin flag", () => {
      const session: SessionData = {
        userId: "user-123",
        isAdmin: true,
      };
      expect(isAdmin(session)).toBe(true);
    });

    it("should return false when no role is set", () => {
      const session: SessionData = { userId: "user-123" };
      expect(isAdmin(session)).toBe(false);
    });

    it("should prioritize legacy isAdmin flag", () => {
      const session: SessionData = {
        userId: "user-123",
        isAdmin: true,
        currentAccountRole: "VIEWER",
      };
      // Legacy flag takes precedence
      expect(isAdmin(session)).toBe(true);
    });
  });

  describe("hasAccountAccess", () => {
    it("should return true when currentAccountId is set", () => {
      const session: SessionData = { currentAccountId: "account-123" };
      expect(hasAccountAccess(session)).toBe(true);
    });

    it("should return false when currentAccountId is not set", () => {
      const session: SessionData = {};
      expect(hasAccountAccess(session)).toBe(false);
    });

    it("should return false when currentAccountId is empty string", () => {
      const session: SessionData = { currentAccountId: "" };
      expect(hasAccountAccess(session)).toBe(false);
    });
  });
});

describe("Session Auth Guards", () => {
  describe("requireAuth", () => {
    it("should not throw when isAuthenticated is true", () => {
      const session: SessionData = { isAuthenticated: true };

      expect(() => requireAuth(session)).not.toThrow();
    });

    it("should throw redirect when isAuthenticated is false", () => {
      const session: SessionData = { isAuthenticated: false };

      expect(() => requireAuth(session)).toThrow(Response);

      try {
        requireAuth(session);
      } catch (error) {
        expect(error).toBeInstanceOf(Response);
        expect((error as Response).status).toBe(302);
        expect((error as Response).headers.get("Location")).toBe("/");
      }
    });

    it("should throw redirect when isAuthenticated is not set", () => {
      const session: SessionData = {};

      expect(() => requireAuth(session)).toThrow(Response);
    });

    it("should redirect to custom location", () => {
      const session: SessionData = {};

      try {
        requireAuth(session, "/custom-login");
      } catch (error) {
        expect((error as Response).headers.get("Location")).toBe("/custom-login");
      }
    });
  });

  describe("requireUserAuth", () => {
    it("should not throw when userId is set", () => {
      const session: SessionData = { userId: "user-123" };

      expect(() => requireUserAuth(session)).not.toThrow();
    });

    it("should throw redirect when userId is not set", () => {
      const session: SessionData = {};

      expect(() => requireUserAuth(session)).toThrow(Response);

      try {
        requireUserAuth(session);
      } catch (error) {
        expect(error).toBeInstanceOf(Response);
        expect((error as Response).status).toBe(302);
        expect((error as Response).headers.get("Location")).toBe("/login");
      }
    });

    it("should redirect to custom location", () => {
      const session: SessionData = {};

      try {
        requireUserAuth(session, "/auth/signin");
      } catch (error) {
        expect((error as Response).headers.get("Location")).toBe("/auth/signin");
      }
    });
  });

  describe("requireAccountAccess", () => {
    it("should not throw when both userId and currentAccountId are set", () => {
      const session: SessionData = {
        userId: "user-123",
        currentAccountId: "account-123",
      };

      expect(() => requireAccountAccess(session)).not.toThrow();
    });

    it("should throw when userId is missing", () => {
      const session: SessionData = { currentAccountId: "account-123" };

      expect(() => requireAccountAccess(session)).toThrow(Response);
    });

    it("should throw when currentAccountId is missing", () => {
      const session: SessionData = { userId: "user-123" };

      expect(() => requireAccountAccess(session)).toThrow(Response);
    });

    it("should throw when both are missing", () => {
      const session: SessionData = {};

      expect(() => requireAccountAccess(session)).toThrow(Response);

      try {
        requireAccountAccess(session);
      } catch (error) {
        expect(error).toBeInstanceOf(Response);
        expect((error as Response).status).toBe(302);
        expect((error as Response).headers.get("Location")).toBe("/login");
      }
    });

    it("should redirect to custom location", () => {
      const session: SessionData = {};

      try {
        requireAccountAccess(session, "/select-account");
      } catch (error) {
        expect((error as Response).headers.get("Location")).toBe("/select-account");
      }
    });
  });

  describe("requireAdminRole", () => {
    it("should not throw for OWNER role", () => {
      const session: SessionData = {
        userId: "user-123",
        currentAccountRole: "OWNER",
      };

      expect(() => requireAdminRole(session)).not.toThrow();
    });

    it("should not throw for ADMIN role", () => {
      const session: SessionData = {
        userId: "user-123",
        currentAccountRole: "ADMIN",
      };

      expect(() => requireAdminRole(session)).not.toThrow();
    });

    it("should throw for EDITOR role", () => {
      const session: SessionData = {
        userId: "user-123",
        currentAccountRole: "EDITOR",
      };

      expect(() => requireAdminRole(session)).toThrow(Response);
    });

    it("should throw for VIEWER role", () => {
      const session: SessionData = {
        userId: "user-123",
        currentAccountRole: "VIEWER",
      };

      expect(() => requireAdminRole(session)).toThrow(Response);
    });

    it("should throw when userId is missing", () => {
      const session: SessionData = { currentAccountRole: "OWNER" };

      expect(() => requireAdminRole(session)).toThrow(Response);

      try {
        requireAdminRole(session);
      } catch (error) {
        expect((error as Response).headers.get("Location")).toBe("/login");
      }
    });

    it("should throw when role is not admin", () => {
      const session: SessionData = {
        userId: "user-123",
        currentAccountRole: "VIEWER",
      };

      expect(() => requireAdminRole(session)).toThrow(Response);
    });

    it("should support legacy isAdmin flag", () => {
      const session: SessionData = {
        userId: "user-123",
        isAdmin: true,
      };

      expect(() => requireAdminRole(session)).not.toThrow();
    });

    it("should redirect to custom location", () => {
      const session: SessionData = { userId: "user-123" };

      try {
        requireAdminRole(session, "/access-denied");
      } catch (error) {
        expect((error as Response).headers.get("Location")).toBe("/access-denied");
      }
    });
  });
});

describe("Session Data Interface", () => {
  it("should support legacy lobby authentication", () => {
    const session: SessionData = {
      isAuthenticated: true,
      lobbyId: "lobby-123",
      isAdmin: true,
    };

    expect(session.isAuthenticated).toBe(true);
    expect(session.lobbyId).toBe("lobby-123");
    expect(session.isAdmin).toBe(true);
  });

  it("should support user authentication", () => {
    const session: SessionData = {
      userId: "user-123",
      userEmail: "test@example.com",
      userName: "Test User",
    };

    expect(session.userId).toBe("user-123");
    expect(session.userEmail).toBe("test@example.com");
    expect(session.userName).toBe("Test User");
  });

  it("should support account context", () => {
    const session: SessionData = {
      currentAccountId: "account-123",
      currentAccountSlug: "my-band",
      currentAccountRole: "OWNER",
    };

    expect(session.currentAccountId).toBe("account-123");
    expect(session.currentAccountSlug).toBe("my-band");
    expect(session.currentAccountRole).toBe("OWNER");
  });

  it("should support OAuth state", () => {
    const session: SessionData = {
      googleState: "state-token",
      googleCodeVerifier: "verifier-code",
    };

    expect(session.googleState).toBe("state-token");
    expect(session.googleCodeVerifier).toBe("verifier-code");
  });

  it("should support combined session data", () => {
    const session: SessionData = {
      userId: "user-123",
      userEmail: "test@example.com",
      userName: "Test User",
      currentAccountId: "account-123",
      currentAccountSlug: "my-band",
      currentAccountRole: "OWNER",
      googleState: "state-token",
    };

    expect(isLoggedIn(session)).toBe(true);
    expect(hasAccountAccess(session)).toBe(true);
    expect(isAdmin(session)).toBe(true);
  });
});
