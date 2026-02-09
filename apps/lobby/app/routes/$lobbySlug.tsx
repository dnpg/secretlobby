// This route handles /:lobbySlug paths (e.g., /my-lobby)
// It uses the same logic as _index.tsx - the resolveTenant function
// extracts the lobby slug from the URL path and returns the correct lobby data

import type { Route } from "./+types/$lobbySlug";

// Import the loader and action implementations from _index
import {
  loader as indexLoader,
  action as indexAction,
  meta as indexMeta,
  default as IndexComponent,
} from "./_index";

// Wrap the loader/action to satisfy type requirements
export async function loader(args: Route.LoaderArgs) {
  return indexLoader(args as any);
}

export async function action(args: Route.ActionArgs) {
  return indexAction(args as any);
}

export function meta(args: Route.MetaArgs) {
  return indexMeta(args as any);
}

export default IndexComponent;
