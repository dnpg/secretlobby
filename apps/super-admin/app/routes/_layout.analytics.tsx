import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.analytics";
import { AnalyticsView } from "@secretlobby/ui";
import { getAnalyticsForPeriod, lastNDaysWindow } from "@secretlobby/db";

export function meta() {
  return [{ title: "Super Admin — Analytics" }];
}

const WINDOW_DAYS = 30;

export async function loader(_args: Route.LoaderArgs) {
  const { from, to } = lastNDaysWindow(WINDOW_DAYS);
  const data = await getAnalyticsForPeriod({ from, to });
  return { data, windowDays: WINDOW_DAYS };
}

export default function AnalyticsOverview() {
  const { data, windowDays } = useLoaderData<typeof loader>();
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Analytics</h2>
        <p className="text-theme-secondary text-sm mt-1">
          Last {windowDays} days across all lobbies. Click a lobby to drill in.
        </p>
      </div>
      <AnalyticsView
        data={data}
        showTopLobbies
        renderLobbyLink={(lobbyId, label) => (
          <Link
            to={`/analytics/lobby/${lobbyId}`}
            className="hover:underline cursor-pointer"
          >
            {label}
          </Link>
        )}
        renderAccountLink={(accountId, label) => (
          <Link
            to={`/accounts/${accountId}`}
            className="hover:underline cursor-pointer"
          >
            {label}
          </Link>
        )}
      />
    </div>
  );
}
