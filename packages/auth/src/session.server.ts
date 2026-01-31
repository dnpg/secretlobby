import { getIronSession, type SessionOptions } from "iron-session";
import { getSessionSecret } from "./env.server.js";

export interface SessionData {
  // Legacy: lobby access (password-based)
  isAuthenticated?: boolean;
  lobbyId?: string;
  isAdmin?: boolean;

  // User-based authentication
  userId?: string;
  userEmail?: string;
  userName?: string;

  // Account context
  currentAccountId?: string;
  currentAccountSlug?: string;
  currentAccountRole?: string;

  // OAuth state
  googleState?: string;
  googleCodeVerifier?: string;
}

/**
 * Gets session options with validated SESSION_SECRET
 * NOTE: This will throw an error if SESSION_SECRET is not set or invalid
 */
function getSessionOptions(): SessionOptions {
  return {
    password: getSessionSecret(),
    cookieName: "secretlobby-session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  };
}

export async function getSession(request: Request) {
  const response = new Response();
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  return { session, response };
}

export async function createSessionResponse(
  sessionData: Partial<SessionData>,
  request: Request,
  redirectTo: string
): Promise<Response> {
  const response = new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });

  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  Object.assign(session, sessionData);
  await session.save();

  return response;
}

export async function updateSession(
  request: Request,
  sessionData: Partial<SessionData>
) {
  const response = new Response();
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  Object.assign(session, sessionData);
  await session.save();
  return { session, response };
}

export async function destroySession(
  request: Request,
  redirectTo: string
): Promise<Response> {
  const response = new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });

  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  session.destroy();

  return response;
}

// =============================================================================
// Auth Helpers
// =============================================================================

export function isLoggedIn(session: SessionData): boolean {
  return Boolean(session.userId);
}

export function isAdmin(session: SessionData): boolean {
  // Support both legacy isAdmin flag and new role-based check
  if (session.isAdmin) return true;
  const role = session.currentAccountRole;
  return role === "OWNER" || role === "ADMIN";
}

export function hasAccountAccess(session: SessionData): boolean {
  return Boolean(session.currentAccountId);
}

export function requireAuth(session: SessionData, redirectTo = "/") {
  if (!session.isAuthenticated) {
    throw new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
  }
}

export function requireUserAuth(session: SessionData, redirectTo = "/login") {
  if (!session.userId) {
    throw new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
  }
}

export function requireAccountAccess(session: SessionData, redirectTo = "/login") {
  if (!session.userId || !session.currentAccountId) {
    throw new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
  }
}

export function requireAdminRole(session: SessionData, redirectTo = "/login") {
  requireUserAuth(session, redirectTo);
  if (!isAdmin(session)) {
    throw new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
  }
}
