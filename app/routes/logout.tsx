import type { Route } from "./+types/logout";
import { destroySession } from "~/lib/session.server";

export async function action({ request }: Route.ActionArgs) {
  return destroySession(request, "/");
}

export async function loader() {
  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
}
