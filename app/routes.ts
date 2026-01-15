import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Public routes
  index("routes/home.tsx"),
  route("logout", "routes/logout.tsx"),

  // Protected player route
  route("player", "routes/player.tsx"),

  // Auth routes (Google OAuth)
  route("auth/google", "routes/auth.google.tsx"),
  route("auth/google/callback", "routes/auth.google.callback.tsx"),

  // Admin routes
  route("admin/login", "routes/admin.login.tsx"),
  route("admin", "routes/admin.tsx", [
    index("routes/admin._index.tsx"),
    route("media", "routes/admin.media.tsx"),
    route("playlist", "routes/admin.playlist.tsx"),
    route("theme", "routes/admin.theme.tsx"),
  ]),

  // API routes for media streaming
  route("api/media/background", "routes/api.media.background.tsx"),
  route("api/media/banner", "routes/api.media.banner.tsx"),
  route("api/media/profile", "routes/api.media.profile.tsx"),
  route("api/media/audio/:filename", "routes/api.media.audio.$filename.tsx"),

  // Token endpoint for secure streaming
  route("api/token/:filename", "routes/api.token.$filename.tsx"),

  // Encrypted streaming endpoint (obfuscated URLs)
  route("api/stream/:trackId", "routes/api.stream.$trackId.tsx"),

  // HLS-like segmented streaming
  route("api/manifest/:trackId", "routes/api.manifest.$trackId.tsx"),
  route("api/segment/:trackId/:index", "routes/api.segment.$trackId.$index.tsx"),
] satisfies RouteConfig;
