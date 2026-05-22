import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.analytics.lobby.$lobbyId";
import {
  getAnalyticsForPeriod,
  lastNDaysWindow,
  prisma,
} from "@secretlobby/db";
import { AnalyticsView } from "@secretlobby/ui";

export function meta({ data }: Route.MetaArgs) {
  const title = data?.lobby?.name ?? "Lobby";
  return [{ title: `Super Admin — Analytics · ${title}` }];
}

const WINDOW_DAYS = 30;

export async function loader({ params }: Route.LoaderArgs) {
  const lobbyId = params.lobbyId;
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: {
      id: true,
      name: true,
      slug: true,
      account: { select: { id: true, name: true } },
    },
  });
  if (!lobby) {
    throw new Response("Lobby not found", { status: 404 });
  }

  const { from, to } = lastNDaysWindow(WINDOW_DAYS);
  const data = await getAnalyticsForPeriod({ from, to, lobbyId });
  return { lobby, data, windowDays: WINDOW_DAYS };
}

export default function AnalyticsLobbyDrilldown() {
  const { lobby, data, windowDays } = useLoaderData<typeof loader>();
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-theme-secondary mb-2">
          <Link to="/analytics" className="hover:underline cursor-pointer">
            ← All lobbies
          </Link>
          <span className="text-theme-muted">/</span>
          <Link
            to={`/accounts/${lobby.account.id}`}
            className="hover:underline cursor-pointer"
          >
            {lobby.account.name}
          </Link>
        </div>
        <h2 className="text-2xl font-bold">{lobby.name}</h2>
        <p className="text-theme-secondary text-sm mt-1">
          Last {windowDays} days · /{lobby.slug}
        </p>
      </div>
      <AnalyticsView data={data} showTopLobbies={false} />
    </div>
  );
}
