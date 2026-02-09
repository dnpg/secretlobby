import { useLoaderData, useActionData, Link, Form, useNavigation, redirect } from "react-router";
import { useEffect } from "react";
import type { Route } from "./+types/_layout.lobbies";
import { cn } from "@secretlobby/ui";
import { toast } from "sonner";

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
  const { getLobbiesByAccountId, getLobbyCount } = await import("~/models/queries/lobby.server");
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

export async function action({ request }: Route.ActionArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { setDefaultLobby, deleteLobby } = await import("~/models/mutations/lobby.server");
  const { getLobbyById, getLobbyCount } = await import("~/models/queries/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobbies" });

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "set-default": {
        const lobbyId = formData.get("lobbyId") as string;
        if (!lobbyId) {
          return { error: "Lobby ID required" };
        }

        // Verify lobby belongs to account
        const lobby = await getLobbyById(lobbyId);
        if (!lobby || lobby.accountId !== accountId) {
          return { error: "Lobby not found" };
        }

        await setDefaultLobby(accountId, lobbyId);
        return { success: "Default lobby updated" };
      }

      case "delete": {
        const lobbyId = formData.get("lobbyId") as string;
        if (!lobbyId) {
          return { error: "Lobby ID required" };
        }

        // Verify lobby belongs to account
        const lobby = await getLobbyById(lobbyId);
        if (!lobby || lobby.accountId !== accountId) {
          return { error: "Lobby not found" };
        }

        // Cannot delete the default lobby
        if (lobby.isDefault) {
          return { error: "Cannot delete the default lobby. Set another lobby as default first." };
        }

        // Must have at least one lobby
        const count = await getLobbyCount(accountId);
        if (count <= 1) {
          return { error: "Cannot delete the last lobby" };
        }

        await deleteLobby(lobbyId);
        return { success: "Lobby deleted" };
      }

      default:
        return { error: "Invalid action" };
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Lobby action error");
    return { error: "Operation failed" };
  }
}

export default function LobbiesPage() {
  const { lobbies, limits } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success) {
      toast.success(actionData.success);
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

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
            <LobbyCard
              key={lobby.id}
              lobby={lobby}
              isSubmitting={isSubmitting}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LobbyCard({
  lobby,
  isSubmitting,
}: {
  lobby: LobbyCard;
  isSubmitting: boolean;
}) {
  return (
    <div className="bg-theme-secondary rounded-xl border border-theme overflow-hidden group">
      {/* Banner / Preview */}
      <div className="h-32 bg-theme-tertiary relative">
        {lobby.bannerUrl ? (
          <img
            src={lobby.bannerUrl}
            alt={lobby.name}
            className="w-full h-full object-cover"
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
        <div className={cn(
          "absolute top-2 right-2 px-2 py-1 text-xs font-medium rounded-full",
          lobby.isPublished
            ? "bg-green-500/20 text-green-400"
            : "bg-yellow-500/20 text-yellow-400"
        )}>
          {lobby.isPublished ? "Published" : "Draft"}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-theme-primary truncate">
          {lobby.title || lobby.name}
        </h3>
        <p className="text-sm text-theme-muted mt-1">
          /{lobby.slug}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          <Link
            to={`/lobby/${lobby.id}`}
            className="flex-1 px-3 py-2 text-sm text-center btn-primary rounded-lg transition cursor-pointer"
          >
            Edit
          </Link>

          <Form method="post" className="contents">
            <input type="hidden" name="intent" value="set-default" />
            <input type="hidden" name="lobbyId" value={lobby.id} />
            <button
              type="submit"
              disabled={lobby.isDefault || isSubmitting}
              className={cn(
                "px-3 py-2 text-sm btn-secondary rounded-lg transition",
                lobby.isDefault
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer"
              )}
              title={lobby.isDefault ? "Already default" : "Set as default"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </Form>

          <Form method="post" className="contents">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="lobbyId" value={lobby.id} />
            <button
              type="submit"
              disabled={lobby.isDefault || isSubmitting}
              className={cn(
                "px-3 py-2 text-sm rounded-lg transition border",
                lobby.isDefault
                  ? "opacity-50 cursor-not-allowed border-theme text-theme-muted"
                  : "cursor-pointer border-red-500/30 text-red-400 hover:border-red-500/50 hover:text-red-300"
              )}
              title={lobby.isDefault ? "Cannot delete default lobby" : "Delete lobby"}
              onClick={(e) => {
                if (!lobby.isDefault && !confirm(`Delete lobby "${lobby.name}"? This cannot be undone.`)) {
                  e.preventDefault();
                }
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
