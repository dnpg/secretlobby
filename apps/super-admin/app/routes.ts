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
    route("users", "routes/_layout.users.tsx", [
      index("routes/_layout.users._index.tsx"),
      route("new", "routes/_layout.users.new.tsx"),
      route(":userId", "routes/_layout.users.$userId.tsx"),
    ]),
    route("domains", "routes/_layout.domains.tsx"),
    route("interested", "routes/_layout.interested.tsx"),
    route("invitations", "routes/_layout.invitations.tsx"),
    route("emails", "routes/_layout.emails.tsx", [
      index("routes/_layout.emails._index.tsx"),
      route("templates/:key", "routes/_layout.emails.templates.$key.tsx"),
      route("elements/:key", "routes/_layout.emails.elements.$key.tsx"),
    ]),
    route("plans", "routes/_layout.plans.tsx"),
    route("staff", "routes/_layout.staff.tsx", [
      index("routes/_layout.staff._index.tsx"),
      route("search-users", "routes/_layout.staff.search-users.tsx"),
    ]),
    route("security", "routes/_layout.security.tsx"),
    route("security/:ipAddress", "routes/_layout.security.$ipAddress.tsx"),
    route("settings", "routes/_layout.settings.tsx"),
    route("profile", "routes/_layout.profile.tsx"),
  ]),
] satisfies RouteConfig;
