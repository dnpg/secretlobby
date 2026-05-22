// Re-export Prisma client singleton
export { prisma, disconnectDb } from "./client.js";

// Re-export generated types for use across apps
export type {
  Account,
  User,
  AccountUser,
  Staff,
  Session,
  Lobby,
  LobbyUser,
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
  InterestedPerson,
  Invitation,
  EmailHtmlElement,
  EmailTemplate,
  Feedback,
  FeedbackAttachment,
  AnalyticsEvent,
} from "./generated/client/client.js";

// Re-export enums
export {
  UserRole,
  StaffRole,
  DomainStatus,
  SubscriptionTier,
  SubscriptionStatus,
  PaymentStatus,
  MediaType,
  EmbedProvider,
  ViolationStatus,
  InvitationStatus,
  FeedbackType,
  FeedbackStatus,
  LobbyAccessPolicy,
  LobbyUserStatus,
} from "./generated/client/enums.js";

// Re-export Prisma types for advanced queries
export { Prisma } from "./generated/client/client.js";

// Analytics aggregations — used by super-admin overview, super-admin per-lobby
// drill-down, and the console per-lobby analytics tab.
export {
  getAnalyticsForPeriod,
  lastNDaysWindow,
  type AnalyticsPeriod,
  type AnalyticsSummary,
  type AnalyticsForPeriod,
  type DailyPoint,
  type TopLobbyRow,
  type TopCountryRow,
  type TopTrackRow,
} from "./analytics.js";
