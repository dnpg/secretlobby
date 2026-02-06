import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  // API routes
  route("api/favicon/generate", "routes/api.favicon.generate.ts"),

  // Login
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),

  // Protected routes with layout
  layout("routes/_layout.tsx", [
    index("routes/_layout._index.tsx"),
    route("accounts", "routes/_layout.accounts.tsx"),
    // Account detail routes with nested layout
    route("accounts/:accountId", "routes/_layout.accounts.$accountId.tsx", [
      index("routes/_layout.accounts.$accountId._index.tsx"),
      route("lobbies", "routes/_layout.accounts.$accountId.lobbies.tsx"),
      route("users", "routes/_layout.accounts.$accountId.users.tsx"),
    ]),
    route("users", "routes/_layout.users.tsx"),
    route("domains", "routes/_layout.domains.tsx"),
    route("interested", "routes/_layout.interested.tsx"),
    route("invitations", "routes/_layout.invitations.tsx"),
    route("plans", "routes/_layout.plans.tsx"),
    route("security", "routes/_layout.security.tsx"),
    route("security/:ipAddress", "routes/_layout.security.$ipAddress.tsx"),
    route("settings", "routes/_layout.settings.tsx"),
  ]),
] satisfies RouteConfig;
