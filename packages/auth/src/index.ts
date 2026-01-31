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
  getCsrfToken,
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
  type AuthResult,
} from "./password.server.js";

// OAuth
export {
  getGoogleClient,
  isGoogleConfigured,
  authenticateWithGoogle,
} from "./oauth.server.js";

// Password reset
export {
  generatePasswordResetToken,
  verifyPasswordResetToken,
  resetPassword,
} from "./password-reset.server.js";

// Password validation
export {
  PASSWORD_REQUIREMENTS,
  checkPasswordRequirements,
  passwordSchema,
  resetPasswordSchema,
  forgotPasswordSchema,
  type PasswordRequirement,
} from "./password-validation.js";

// Re-export arctic utilities for OAuth flows
export { generateState, generateCodeVerifier } from "arctic";
