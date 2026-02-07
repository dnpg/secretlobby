import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx", { id: "home" }),
  // Locale-prefixed routes (e.g., /es)
  route(":locale", "routes/_index.tsx", { id: "home-localized" }),
] satisfies RouteConfig;
