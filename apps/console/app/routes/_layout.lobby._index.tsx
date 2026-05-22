import { useEffect } from "react";
import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.lobby._index";
import { cn, RichTextEditor } from "@secretlobby/ui";
import { toast } from "sonner";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.lobby?.name || "Lobby"} Content - Admin` }];
}

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

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  return {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      title: lobby.title,
      description: lobby.description,
    },
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { updateLobbyContent } = await import("~/models/mutations/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobby-content" });

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

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "update-band-info": {
        const title = formData.get("bandName") as string;
        const description = formData.get("bandDescription") as string;
        await updateLobbyContent(lobbyId, {
          title: title || null,
          description: description || null,
        });
        return { success: "Lobby info updated successfully" };
      }

      default:
        return { error: "Invalid action" };
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Lobby content update error");
    return { error: "Operation failed" };
  }
}

export default function LobbyContentPage() {
  const { lobby } = useLoaderData<typeof loader>();
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
        <h2 className="text-lg font-semibold mb-4">Lobby Information</h2>
        <p className="text-sm text-theme-secondary mb-4">
          Set your lobby title and description that will appear to visitors.
        </p>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update-band-info" />
          <div>
            <label className="block text-sm font-medium mb-2">Lobby Title</label>
            <input
              type="text"
              name="bandName"
              defaultValue={lobby.title || ""}
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="Enter lobby title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <RichTextEditor
              name="bandDescription"
              defaultValue={lobby.description || ""}
              placeholder="Enter lobby description..."
              features={["bold", "italic", "underline", "textAlign", "heading", "bulletList", "orderedList", "link", "blockquote", "htmlSource"]}
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50",
              isSubmitting ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            Save Lobby Info
          </button>
        </Form>
      </section>
    </div>
  );
}
