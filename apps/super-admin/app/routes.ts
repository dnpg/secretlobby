import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Login
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),

  // Dashboard
  index("routes/_index.tsx"),

  // Management
  route("accounts", "routes/accounts.tsx"),
  route("users", "routes/users.tsx"),
  route("domains", "routes/domains.tsx"),
] satisfies RouteConfig;
