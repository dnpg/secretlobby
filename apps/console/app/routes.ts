import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  // API (no layout)
  route("api/media", "routes/api.media.ts"),
  route("api/webhooks/stripe", "routes/api.webhooks.stripe.ts"),

  // Authentication
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),

  // OAuth
  route("auth/google", "routes/auth.google.tsx"),
  route("auth/google/callback", "routes/auth.google.callback.tsx"),

  // Dashboard (protected with layout)
  layout("routes/_layout.tsx", [
    index("routes/_layout._index.tsx"),
    route("media", "routes/_layout.media.tsx"),
    route("playlist", "routes/_layout.playlist.tsx"),
    route("theme", "routes/_layout.theme.tsx"),
    route("login-page", "routes/_layout.login.tsx"),
    route("social", "routes/_layout.social.tsx"),
    route("technical-info", "routes/_layout.technical-info.tsx"),
    route("settings", "routes/_layout.settings.tsx"),
    route("billing", "routes/_layout.billing.tsx"),
    route("billing/plans", "routes/_layout.billing.plans.tsx"),
    route("billing/history", "routes/_layout.billing.history.tsx"),
    route("billing/methods", "routes/_layout.billing.methods.tsx"),
    route("billing/checkout", "routes/_layout.billing.checkout.tsx"),
    route("billing/success", "routes/_layout.billing.success.tsx"),
  ]),
] satisfies RouteConfig;
