import { redirect } from "react-router";
import type { Route } from "./+types/_layout._index";

export function meta() {
  return [{ title: "Console" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { session } = await getSession(request);
  requireUserAuth(session);
  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }
  throw redirect("/lobbies");
}

export default function ConsoleHome() {
  return null;
}
