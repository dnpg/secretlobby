import { getIronSession, type SessionOptions } from "iron-session";

export interface SessionData {
  // Legacy: lobby access (password-based)
  isAuthenticated?: boolean;
  isAdmin?: boolean; // Legacy admin flag

  // New: user-based authentication
  userId?: string;
  userEmail?: string;
  userName?: string;
  currentAccountId?: string;
  currentAccountSlug?: string;
  currentAccountRole?: string;

  // OAuth state
  googleState?: string;
  googleCodeVerifier?: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "fallback-secret-min-32-characters-long",
  cookieName: "secretlobby-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession(request: Request) {
  const response = new Response();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  return { session, response };
}

export async function createSessionResponse(
  sessionData: Partial<SessionData>,
  request: Request,
  redirectTo: string
) {
  const response = new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });

  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  Object.assign(session, sessionData);
  await session.save();

  return response;
}

export async function updateSession(
  request: Request,
  sessionData: Partial<SessionData>
) {
  const response = new Response();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  Object.assign(session, sessionData);
  await session.save();
  return { session, response };
}

export async function destroySession(request: Request, redirectTo: string) {
  const response = new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });

  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  session.destroy();

  return response;
}

// =============================================================================
// Auth Helpers
// =============================================================================

export function isLoggedIn(session: SessionData): boolean {
  return !!session.userId;
}

export function isAdmin(session: SessionData): boolean {
  // Support both legacy isAdmin flag and new role-based check
  if (session.isAdmin) return true;
  const role = session.currentAccountRole;
  return role === "OWNER" || role === "ADMIN";
}

export function hasAccountAccess(session: SessionData): boolean {
  return !!session.currentAccountId;
}

export function requireAuth(session: SessionData) {
  if (!session.isAuthenticated) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/" },
    });
  }
}

export function requireUserAuth(session: SessionData, redirectTo = "/admin/login") {
  if (!session.userId) {
    throw new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
  }
}

export function requireAccountAccess(session: SessionData, redirectTo = "/admin/login") {
  if (!session.userId || !session.currentAccountId) {
    throw new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
  }
}

export function requireAdminRole(session: SessionData, redirectTo = "/admin/login") {
  if (!isAdmin(session)) {
    throw new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
  }
}
