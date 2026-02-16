import { useEffect } from "react";
import { Outlet, redirect, useLoaderData, Form, useNavigation, useActionData, Link } from "react-router";
import type { Route } from "./+types/_layout.lobby";
import { cn } from "@secretlobby/ui";
import { toast } from "sonner";

// Designer icon (paintbrush)
function DesignerIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
    </svg>
  );
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireUserAuth, updateSession, generatePreviewToken } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { getAccountWithBasicInfo } = await import("~/models/queries/account.server");

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

  // Fetch the lobby and account info
  const [lobby, account] = await Promise.all([
    getLobbyById(lobbyId),
    getAccountWithBasicInfo(accountId),
  ]);

  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  if (!account) {
    throw redirect("/login");
  }

  // Update session with current lobby if different
  if (session.currentLobbyId !== lobbyId) {
    await updateSession(request, {
      currentLobbyId: lobby.id,
      currentLobbySlug: lobby.slug,
    });
  }

  // Generate preview token for unpublished lobbies
  const previewToken = !lobby.isPublished
    ? generatePreviewToken(lobby.id, accountId)
    : null;

  // Build lobby URL
  const baseDomain = process.env.CORE_DOMAIN || "secretlobby.io";
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const isLocalDev = hostname.includes("localhost") || hostname.includes(".local") || hostname.startsWith("127.0.0.1");
  const protocol = isLocalDev ? "http" : "https";

  // Build the lobby URL (with lobby slug for non-default lobbies)
  let lobbyUrl = `${protocol}://${account.slug}.${baseDomain}`;
  if (!lobby.isDefault) {
    lobbyUrl += `/${lobby.slug}`;
  }

  // Add preview token for unpublished lobbies
  if (previewToken) {
    lobbyUrl += `?preview=${previewToken}`;
  }

  return {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      slug: lobby.slug,
      title: lobby.title,
      isDefault: lobby.isDefault,
      isPublished: lobby.isPublished,
    },
    lobbyUrl,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { updateLobby } = await import("~/models/mutations/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobby" });

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    return { error: "Lobby ID required" };
  }

  // Verify lobby belongs to account
  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "publish": {
        await updateLobby(lobbyId, { isPublished: true });
        return { success: "Lobby published successfully" };
      }

      case "unpublish": {
        await updateLobby(lobbyId, { isPublished: false });
        return { success: "Lobby unpublished" };
      }

      default:
        return { error: "Invalid action" };
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Lobby action error");
    return { error: "Operation failed" };
  }
}

// External link icon
function ExternalIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

// Eye icon for preview
function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export default function LobbyLayout() {
  const { lobby, lobbyUrl } = useLoaderData<typeof loader>();
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
      {/* Lobby Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{lobby.title || lobby.name}</h1>
            {lobby.isDefault && (
              <span className="badge-brand">Default</span>
            )}
            <span
              className={cn(
                "px-2 py-1 text-xs font-medium rounded-full",
                lobby.isPublished
                  ? "bg-green-500/15 text-green-500"
                  : "bg-yellow-500/15 text-yellow-500"
              )}
            >
              {lobby.isPublished ? "Published" : "Draft"}
            </span>
          </div>
          <p className="text-sm text-theme-muted mt-1">/{lobby.slug}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Designer Mode Button */}
          <Link
            to={`/designer/${lobby.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition cursor-pointer border border-theme text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
          >
            <DesignerIcon />
            Designer
          </Link>

          {/* View / Preview Button */}
          <a
            href={lobbyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition cursor-pointer",
              lobby.isPublished
                ? "btn-secondary"
                : "border border-theme text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
            )}
          >
            {lobby.isPublished ? (
              <>
                <ExternalIcon />
                View
              </>
            ) : (
              <>
                <EyeIcon />
                Preview
              </>
            )}
          </a>

          {/* Publish / Unpublish Button */}
          <Form method="post">
            {lobby.isPublished ? (
              <>
                <input type="hidden" name="intent" value="unpublish" />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-lg transition",
                    "border border-yellow-500/30 text-yellow-500 hover:border-yellow-500/50 hover:bg-yellow-500/10",
                    isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  )}
                >
                  {isSubmitting ? "Saving..." : "Unpublish"}
                </button>
              </>
            ) : (
              <>
                <input type="hidden" name="intent" value="publish" />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-lg transition btn-primary",
                    isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  )}
                >
                  {isSubmitting ? "Publishing..." : "Publish Lobby"}
                </button>
              </>
            )}
          </Form>
        </div>
      </div>

      {/* Draft Notice */}
      {!lobby.isPublished && (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-yellow-500">This lobby is in draft mode</p>
              <p className="text-sm text-yellow-500/80 mt-1">
                Visitors cannot see this lobby until you publish it. Use the "Preview" button to see how it looks. The preview link is only valid for 1 hour.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Lobby Content */}
      <Outlet context={{ lobby }} />
    </div>
  );
}

// Export a type-safe hook for child routes to access lobby context
export interface LobbyContext {
  lobby: {
    id: string;
    name: string;
    slug: string;
    title: string | null;
    isDefault: boolean;
    isPublished: boolean;
  };
}
