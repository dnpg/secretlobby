import { useEffect } from "react";
import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.lobby.password";
import { cn } from "@secretlobby/ui";
import { toast } from "sonner";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Password - ${data?.lobbyName || "Lobby"} - Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");

  const { session } = await getSession(request);
  if (!isAdmin(session) || !session.currentAccountId) {
    throw redirect("/login");
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    throw redirect("/lobbies");
  }

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== session.currentAccountId) {
    throw redirect("/lobbies");
  }

  return {
    lobbyName: lobby.name,
    hasPassword: !!lobby.password,
    password: lobby.password || "",
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { updateLobbyPassword } = await import("~/models/mutations/lobby.server");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobby-password" });

  const { session } = await getSession(request);
  if (!isAdmin(session) || !session.currentAccountId) {
    return { error: "Unauthorized" };
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    return { error: "Lobby ID required" };
  }

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== session.currentAccountId) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "update-password") {
      const password = (formData.get("password") as string) || "";
      await updateLobbyPassword(lobbyId, password);
      return { success: password ? "Password updated" : "Password removed" };
    }

    if (intent === "remove-password") {
      await updateLobbyPassword(lobbyId, "");
      return { success: "Password protection removed" };
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Password update error");
    return { error: "Failed to update password" };
  }

  return null;
}

export default function LobbyPasswordPage() {
  const { lobbyName, hasPassword, password } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success) toast.success(actionData.success);
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData]);

  return (
    <div className="space-y-8">
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Password Protection</h2>
        <p className="text-sm text-theme-secondary mb-6">
          {hasPassword
            ? "This lobby is password protected. Visitors must enter the password to access it."
            : "This lobby is public. Add a password to restrict access."}
        </p>

        <Form method="post" className="space-y-6">
          <input type="hidden" name="intent" value="update-password" />

          <div>
            <label className="block text-sm font-medium mb-2">Lobby Password</label>
            <input
              type="text"
              name="password"
              defaultValue={password}
              placeholder="Enter password (leave empty for no protection)"
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <p className="text-xs text-theme-muted mt-1">
              Leave empty to make this lobby public.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", isSubmitting ? "cursor-not-allowed" : "cursor-pointer")}
            >
              {isSubmitting ? "Saving..." : "Save Password"}
            </button>

            {hasPassword && (
              <Form method="post" className="inline">
                <input type="hidden" name="intent" value="remove-password" />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg transition cursor-pointer disabled:opacity-50"
                >
                  Remove Password
                </button>
              </Form>
            )}
          </div>
        </Form>
      </section>

      {/* Status indicator */}
      <div className={cn(
        "p-4 rounded-lg border",
        hasPassword
          ? "bg-green-500/10 border-green-500/30 text-green-400"
          : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
      )}>
        <div className="flex items-center gap-2">
          {hasPassword ? (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="font-medium">Password Protected</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">Public Access</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
