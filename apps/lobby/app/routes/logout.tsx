import type { Route } from "./+types/logout";
import { destroySession } from "@secretlobby/auth";

export async function action({ request }: Route.ActionArgs) {
  return destroySession(request, "/");
}

export async function loader({ request }: Route.LoaderArgs) {
  return destroySession(request, "/");
}
