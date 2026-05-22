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

// Lobby password encryption at rest (separate concern from user-account
// password hashing — lobby passwords are shared secrets, see the file
// for the threat model).
export {
  encryptLobbyPassword,
  decryptLobbyPassword,
  verifyLobbyPassword,
  isEncryptedLobbyPassword,
  getEncryptedKeyId,
  getActiveKeyId,
} from "./lobby-password.server.js";

// Lobby access control (identity + policy + magic-link lifecycle).
// Composes with lobby-password.server.ts.
export {
  LOBBY_MAGIC_LINK_TTL_MS,
  LOBBY_SESSION_TTL_MS,
  normalizeEmail,
  isValidEmailShape,
  extractEmailDomain,
  isDomainAllowed,
  checkLobbyAccess,
  issueLobbyMagicLink,
  consumeLobbyMagicLink,
  touchLobbyUser,
  type LobbyAccessCheck,
  type LobbyAccessShape,
  type IssueMagicLinkOptions,
  type IssuedMagicLink,
  type ConsumeMagicLinkResult,
} from "./lobby-access.server.js";

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
