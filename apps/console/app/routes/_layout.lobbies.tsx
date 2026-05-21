import { useLoaderData, Link, redirect } from "react-router";
import type { Route } from "./+types/_layout.lobbies";
import { cn, useImageTransform } from "@secretlobby/ui";

export function meta() {
  return [{ title: "Lobbies - Admin" }];
}

interface LobbyCard {
  id: string;
  name: string;
  slug: string;
  title: string | null;
  isDefault: boolean;
  isPublished: boolean;
  bannerUrl: string | null;
  createdAt: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getPublicUrl } = await import("@secretlobby/storage");
  const { getLobbiesByAccountId } = await import("~/models/queries/lobby.server");
  const { getAccountPlanLimits } = await import("~/models/queries/subscription.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const [lobbies, limits] = await Promise.all([
    getLobbiesByAccountId(accountId),
    getAccountPlanLimits(accountId),
  ]);

  const lobbyCards: LobbyCard[] = lobbies.map((lobby) => ({
    id: lobby.id,
    name: lobby.name,
    slug: lobby.slug,
    title: lobby.title,
    isDefault: lobby.isDefault,
    isPublished: lobby.isPublished,
    bannerUrl: lobby.bannerMedia ? getPublicUrl(lobby.bannerMedia.key) : null,
    createdAt: lobby.createdAt.toISOString(),
  }));

  const canCreateMore = limits.maxLobbies === -1 || lobbies.length < limits.maxLobbies;

  return {
    lobbies: lobbyCards,
    limits: {
      current: lobbies.length,
      max: limits.maxLobbies,
      canCreate: canCreateMore,
    },
  };
}

export default function LobbiesPage() {
  const { lobbies, limits } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lobbies</h1>
          <p className="text-sm text-theme-secondary mt-1">
            Manage your lobbies. Each lobby has its own content, theme, and settings.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-theme-secondary">
            {limits.current} / {limits.max === -1 ? "unlimited" : limits.max} lobbies
          </span>
          {limits.canCreate ? (
            <Link
              to="new"
              className="px-4 py-2 btn-primary rounded-lg transition cursor-pointer"
            >
              Create Lobby
            </Link>
          ) : (
            <span className="px-4 py-2 text-sm text-theme-muted bg-theme-tertiary rounded-lg">
              Upgrade to create more
            </span>
          )}
        </div>
      </div>

      {/* Lobby Grid */}
      {lobbies.length === 0 ? (
        <div className="text-center py-12 bg-theme-secondary rounded-xl border border-theme">
          <p className="text-theme-secondary">No lobbies yet. Create your first lobby to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lobbies.map((lobby) => (
            <LobbyCard key={lobby.id} lobby={lobby} />
          ))}
        </div>
      )}
    </div>
  );
}

function LobbyCard({ lobby }: { lobby: LobbyCard }) {
  const { transformUrl, generateSrcSet } = useImageTransform();

  const bannerBaseWidth = 640;
  const bannerHeighPx = 128;
  const bannerWidths = [320, 640, 960, 1280];

  const bannerSrc = lobby.bannerUrl
    ? transformUrl(lobby.bannerUrl, { width: bannerBaseWidth })
    : null;
  const bannerSrcSet = lobby.bannerUrl
    ? generateSrcSet(lobby.bannerUrl, bannerWidths)
    : null;

  return (
    <Link
      to={`/lobby/${lobby.id}`}
      className="block bg-theme-secondary rounded-xl border border-theme overflow-hidden group cursor-pointer transition hover:border-[var(--color-accent)] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      {/* Banner / Preview */}
      <div className="h-32 bg-theme-tertiary relative">
        {lobby.bannerUrl ? (
          <img
            src={bannerSrc || lobby.bannerUrl}
            srcSet={bannerSrcSet || undefined}
            sizes="(min-width: 1024px) 336px, (min-width: 768px) 354px, 340px"
            width={bannerBaseWidth}
            height={bannerHeighPx}
            loading="lazy"
            alt={lobby.name}
            className="w-full h-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-theme-muted">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Default badge */}
        {lobby.isDefault && (
          <div className="absolute top-2 left-2 px-2 py-1 text-xs font-medium bg-[var(--color-accent)] text-[var(--color-primary-text)] rounded-full">
            Default
          </div>
        )}

        {/* Published status */}
        <div
          className={cn(
            "absolute top-2 right-2 px-2 py-1 text-xs font-medium rounded-full",
            lobby.isPublished
              ? "bg-green-500/20 text-green-400"
              : "bg-yellow-500/20 text-yellow-400",
          )}
        >
          {lobby.isPublished ? "Published" : "Draft"}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-theme-primary truncate group-hover:text-[var(--color-accent)] transition">
          {lobby.title || lobby.name}
        </h3>
        <p className="text-sm text-theme-muted mt-1">/{lobby.slug}</p>
      </div>
    </Link>
  );
}
