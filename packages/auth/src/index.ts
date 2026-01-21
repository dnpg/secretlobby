// Session management
export {
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
} from "./session.server.js";

// Password authentication
export {
  hashPassword,
  verifyPassword,
  authenticateWithPassword,
  createUser,
  getUserById,
  addUserToAccount,
  type AuthenticatedUser,
} from "./password.server.js";

// OAuth
export {
  getGoogleClient,
  isGoogleConfigured,
  authenticateWithGoogle,
} from "./oauth.server.js";

// Re-export arctic utilities for OAuth flows
export { generateState, generateCodeVerifier } from "arctic";
