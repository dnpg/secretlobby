import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx", { id: "home" }),
  // Locale-prefixed routes (e.g., /es)
  route(":locale", "routes/_index.tsx", { id: "home-localized" }),
  // Legal pages
  route("privacy", "routes/privacy.tsx"),
  route("terms", "routes/terms.tsx"),
] satisfies RouteConfig;
