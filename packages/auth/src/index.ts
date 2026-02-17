// Session management
export {
  getSession,
  createSessionResponse,
  updateSession,
  destroySession,
  isLoggedIn,
  isAdmin,
  isStaff,
  isStaffOwner,
  hasAccountAccess,
  requireAuth,
  requireUserAuth,
  requireAccountAccess,
  requireAdminRole,
  getCsrfToken,
  // Multi-lobby authentication
  logoutFromLobby,
  isAuthenticatedForLobby,
  authenticateForLobby,
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
  type CreateUserOptions,
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

// Preview tokens for unpublished lobbies
export {
  generatePreviewToken,
  validatePreviewToken,
} from "./preview.server.js";

// Designer tokens for iframe preview
export {
  generateDesignerToken,
  validateDesignerToken,
  type DesignerPage,
  type DesignerTokenValidationResult,
} from "./designer-token.server.js";

// Re-export arctic utilities for OAuth flows
export { generateState, generateCodeVerifier } from "arctic";
