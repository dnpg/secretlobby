import { useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/_layout.lobby.analytics";
import { AnalyticsView } from "@secretlobby/ui";
import { getAnalyticsForPeriod, lastNDaysWindow } from "@secretlobby/db";

export function meta() {
  return [{ title: "Lobby Analytics — Admin" }];
}

const WINDOW_DAYS = 30;

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    throw redirect("/lobbies");
  }

  // Account-scoped ownership check — never serve analytics for another
  // account's lobby, even if the URL is crafted manually.
  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  const { from, to } = lastNDaysWindow(WINDOW_DAYS);
  const data = await getAnalyticsForPeriod({ from, to, lobbyId });
  return { data, windowDays: WINDOW_DAYS };
}

export default function LobbyAnalyticsPage() {
  const { data, windowDays } = useLoaderData<typeof loader>();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="text-sm text-theme-secondary mt-1">
          Last {windowDays} days for this lobby. Updated live as visitors interact.
        </p>
      </div>
      <AnalyticsView data={data} showTopLobbies={false} />
    </div>
  );
}
