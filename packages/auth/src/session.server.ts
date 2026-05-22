import { getIronSession, type SessionOptions } from "iron-session";
import { getSessionSecret } from "./env.server.js";
import { generateCsrfToken } from "./csrf.server.js";

export interface SessionData {
  // Legacy: lobby access (password-based) - single lobby
  isAuthenticated?: boolean;
  lobbyId?: string;
  isAdmin?: boolean;

  // Multi-lobby authentication: array of authenticated lobby IDs
  authenticatedLobbyIds?: string[];

  // Identified visitor per lobby: lobbyId → LobbyUser.id. Present when the
  // visitor entered via magic link or Google sign-in (not password-only).
  // Lets us look up the LobbyUser row for analytics, lastSeenAt updates,
  // and "who's currently in this lobby" admin views without re-querying
  // by email.
  lobbyUserIds?: Record<string, string>;

  // User-based authentication
  userId?: string;
  userEmail?: string;
  userName?: string;

  // Account context
  currentAccountId?: string;
  currentAccountSlug?: string;
  currentAccountRole?: string;

  // Staff (super-admin) context: set when user logs in via super-admin and has a Staff record
  staffRole?: "OWNER" | "ADMIN";

  // Lobby context (for multi-lobby support)
  currentLobbyId?: string;
  currentLobbySlug?: string;

  // OAuth state
  googleState?: string;
  googleCodeVerifier?: string;
  googleInviteCode?: string;

  // Lobby Google sign-in: stashed between the lobby's "sign in with
  // Google" button click and the central OAuth callback so the callback
  // knows which lobby to redirect the visitor back to. Cleared on
  // consume — see apps/console/app/routes/auth.google.callback.tsx.
  lobbyOAuthLobbyId?: string;
  lobbyOAuthReturnPath?: string;
  // Already-validated lobby host (subdomain or verified custom domain).
  // The callback echoes it back as the redirect destination so the
  // session cookie lands on the right origin.
  lobbyOAuthReturnHost?: string;

  // CSRF protection
  csrfToken?: string;
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

/**
 * Logout from a specific lobby without destroying the entire session.
 * Removes the lobbyId from authenticatedLobbyIds array.
 */
export async function logoutFromLobby(
  request: Request,
  lobbyId: string,
  redirectTo: string
): Promise<Response> {
  const response = new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });

  const session = await getIronSession<SessionData>(request, response, getSessionOptions());

  // Remove from authenticated lobbies array
  if (session.authenticatedLobbyIds) {
    session.authenticatedLobbyIds = session.authenticatedLobbyIds.filter(id => id !== lobbyId);
  }

  // Drop visitor identity for this lobby. Other lobbies' identities stay.
  if (session.lobbyUserIds) {
    delete session.lobbyUserIds[lobbyId];
  }

  // Clear legacy fields if they match this lobby
  if (session.lobbyId === lobbyId) {
    session.isAuthenticated = false;
    session.lobbyId = undefined;
  }

  await session.save();

  return response;
}

/**
 * Check if user is authenticated for a specific lobby
 */
export function isAuthenticatedForLobby(session: SessionData, lobbyId: string): boolean {
  // Check new multi-lobby array first
  if (session.authenticatedLobbyIds?.includes(lobbyId)) {
    return true;
  }
  // Fall back to legacy single-lobby check
  return session.isAuthenticated === true && session.lobbyId === lobbyId;
}

/**
 * Add a lobby to the authenticated lobbies list. When the visitor is
 * identified (magic link or Google sign-in), pass `lobbyUserId` to bind
 * the session to a LobbyUser row — that's what downstream code uses to
 * look up email, mark lastSeenAt, etc. Password-only sign-ins omit it.
 */
export async function authenticateForLobby(
  request: Request,
  lobbyId: string,
  redirectTo: string,
  lobbyUserId?: string,
): Promise<Response> {
  const response = new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });

  const session = await getIronSession<SessionData>(request, response, getSessionOptions());

  // Initialize array if needed
  if (!session.authenticatedLobbyIds) {
    session.authenticatedLobbyIds = [];
  }

  // Add lobby if not already authenticated
  if (!session.authenticatedLobbyIds.includes(lobbyId)) {
    session.authenticatedLobbyIds.push(lobbyId);
  }

  // Record visitor identity for this lobby. Overwrites any previous
  // mapping (e.g. if the same browser was used to consume a link for a
  // different email — the most recent click wins).
  if (lobbyUserId) {
    if (!session.lobbyUserIds) {
      session.lobbyUserIds = {};
    }
    session.lobbyUserIds[lobbyId] = lobbyUserId;
  }

  // Also set legacy fields for backwards compatibility
  session.isAuthenticated = true;
  session.lobbyId = lobbyId;

  await session.save();

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

/** True if session has a staff role (super-admin access). */
export function isStaff(session: SessionData): boolean {
  return session.staffRole === "OWNER" || session.staffRole === "ADMIN";
}

/** True if session is staff with OWNER role (can manage staff). */
export function isStaffOwner(session: SessionData): boolean {
  return session.staffRole === "OWNER";
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

// =============================================================================
// CSRF Token Helpers
// =============================================================================

/**
 * Get CSRF token from session or generate a new one
 * This ensures each session has a unique CSRF token
 */
export async function getCsrfToken(request: Request): Promise<string> {
  const { session, response } = await getSession(request);

  // Generate token if not already in session
  if (!session.csrfToken) {
    session.csrfToken = generateCsrfToken();
    await session.save();
  }

  return session.csrfToken;
}
