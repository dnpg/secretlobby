import { getIronSession, type SessionOptions } from "iron-session";

export interface SessionData {
  isAuthenticated?: boolean;
  isAdmin?: boolean;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "fallback-secret-min-32-characters-long",
  cookieName: "protected-media-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
  },
};

export async function getSession(request: Request) {
  const response = new Response();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  return { session, response };
}

export async function createSessionResponse(
  session: SessionData,
  request: Request,
  redirectTo: string
) {
  const response = new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });

  const ironSession = await getIronSession<SessionData>(request, response, sessionOptions);
  ironSession.isAuthenticated = session.isAuthenticated;
  ironSession.isAdmin = session.isAdmin;
  await ironSession.save();

  return response;
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

export function requireAuth(session: SessionData) {
  if (!session.isAuthenticated) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/" },
    });
  }
}

export function requireAdmin(session: SessionData) {
  if (!session.isAdmin) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/admin/login" },
    });
  }
}
