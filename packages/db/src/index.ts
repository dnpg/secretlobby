// Re-export Prisma client singleton
export { prisma, disconnectDb } from "./client.js";

// Re-export generated types for use across apps
export type {
  Account,
  User,
  AccountUser,
  Session,
  Lobby,
  Track,
  Domain,
  AuditLog,
  Media,
  Subscription,
  PaymentMethod,
  PaymentHistory,
  SystemSettings,
  SubscriptionPlan,
  RateLimitViolation,
} from "./generated/client/client.js";

// Re-export enums
export {
  UserRole,
  DomainStatus,
  SubscriptionTier,
  SubscriptionStatus,
  PaymentStatus,
  MediaType,
  EmbedProvider,
  ViolationStatus,
} from "./generated/client/enums.js";

// Re-export Prisma types for advanced queries
export { Prisma } from "./generated/client/client.js";
