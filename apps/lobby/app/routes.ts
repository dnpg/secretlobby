import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Main lobby entry (password-protected)
  index("routes/_index.tsx"),

  // Logout
  route("logout", "routes/logout.tsx"),

  // Audio streaming API routes
  route("api/stream/:trackId", "routes/api.stream.$trackId.tsx"),
  route("api/manifest/:trackId", "routes/api.manifest.$trackId.tsx"),
  route("api/segment/:trackId/:index", "routes/api.segment.$trackId.$index.tsx"),
] satisfies RouteConfig;
