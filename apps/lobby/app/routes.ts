import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Designer preview API (for console iframe)
  route("api/designer-preview", "routes/api.designer-preview.tsx"),

  // Main lobby entry (password-protected)
  index("routes/_index.tsx"),

  // Secondary lobby by slug (e.g., /my-lobby)
  // This catches /:lobbySlug paths and uses the same logic as _index.tsx
  // The resolveTenant function extracts the lobby slug from the URL path
  route(":lobbySlug", "routes/$lobbySlug.tsx"),

  // Logout
  route("logout", "routes/logout.tsx"),

  // HLS audio streaming API routes
  route("api/hls/:trackId/playlist", "routes/api.hls.$trackId.playlist.tsx"),
  route("api/hls/:trackId/segment/:filename", "routes/api.hls.$trackId.segment.$filename.tsx"),
  route("api/stream-mp3/:trackId", "routes/api.stream-mp3.$trackId.tsx"),

  // Admin API for clearing in-memory rate limits
  route("api/clear-rate-limit/:ipAddress", "routes/api.clear-rate-limit.$ipAddress.ts"),
] satisfies RouteConfig;
