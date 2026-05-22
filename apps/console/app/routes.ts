import { type RouteConfig, index, route, layout, prefix } from "@react-router/dev/routes";

export default [
  // Designer mode (full-screen, no layout)
  route("designer/:lobbyId", "routes/designer.$lobbyId.tsx"),

  // Page Builder (full-screen, no layout)
  route("page-builder/:lobbyId", "routes/page-builder.$lobbyId.tsx"),

  // API (no layout)
  route("api/media", "routes/api.media.ts"),
  route("api/webhooks/stripe", "routes/api.webhooks.stripe.ts"),
  route("api/switch-lobby", "routes/api.switch-lobby.tsx"),

  // Authentication
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("verify-email", "routes/verify-email.tsx"),

  // OAuth
  route("auth/google", "routes/auth.google.tsx"),
  route("auth/google/callback", "routes/auth.google.callback.tsx"),

  // Dashboard (protected with layout)
  layout("routes/_layout.tsx", [
    index("routes/_layout._index.tsx"),
    route("lobbies", "routes/_layout.lobbies.tsx"),
    route("lobbies/new", "routes/_layout.lobbies.new.tsx"),

    // Per-lobby routes - use route with children for nested layout
    route("lobby/:lobbyId", "routes/_layout.lobby.tsx", [
      index("routes/_layout.lobby._index.tsx"),
      route("analytics", "routes/_layout.lobby.analytics.tsx"),
      route("playlists", "routes/_layout.lobby.playlists.tsx"),
      route("playlists/:playlistId", "routes/_layout.lobby.playlists.$playlistId.tsx"),
      route("social", "routes/_layout.lobby.social.tsx"),
      route("access", "routes/_layout.lobby.access.tsx"),
    ]),

    // Global routes (account-level, not per-lobby)
    route("media", "routes/_layout.media.tsx"),
    route("playlist", "routes/_layout.playlist.tsx"),
    route("social", "routes/_layout.social.tsx"),
    route("settings", "routes/_layout.settings.tsx"),
    route("profile", "routes/_layout.profile.tsx"),
    route("billing", "routes/_layout.billing.tsx"),
    route("billing/plans", "routes/_layout.billing.plans.tsx"),
    route("billing/history", "routes/_layout.billing.history.tsx"),
    route("billing/methods", "routes/_layout.billing.methods.tsx"),
    route("billing/checkout", "routes/_layout.billing.checkout.tsx"),
    route("billing/success", "routes/_layout.billing.success.tsx"),
    route("feedback", "routes/_layout.feedback.tsx"),
  ]),
] satisfies RouteConfig;
