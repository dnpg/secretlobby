import type { Route } from "./+types/api.stream.$trackId";

// Direct streaming is disabled - audio is served via segmented streaming
// (api/manifest + api/segment) for security and DRM protection
export async function loader({ request }: Route.LoaderArgs) {
  return new Response(null, { status: 410 });
}
