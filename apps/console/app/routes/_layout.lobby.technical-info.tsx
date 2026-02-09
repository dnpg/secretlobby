import { useEffect } from "react";
import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.lobby.technical-info";
import { cn, RichTextEditor } from "@secretlobby/ui";
import { toast } from "sonner";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Technical Info - ${data?.lobbyName || "Lobby"} - Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { getLobbyTechnicalInfoSettings } = await import("~/lib/content.server");
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

  const technicalInfo = await getLobbyTechnicalInfoSettings(lobbyId);
  return { technicalInfo, lobbyName: lobby.name };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { updateLobbyTechnicalInfoSettings } = await import("~/lib/content.server");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobby-technical-info" });

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

  try {
    const updates = {
      title: (formData.get("title") as string) || "",
      content: (formData.get("content") as string) || "",
    };

    await updateLobbyTechnicalInfoSettings(lobbyId, updates);
    return { success: "Technical info updated" };
  } catch (error) {
    logger.error({ error: formatError(error) }, "Technical info update error");
    return { error: "Failed to update technical info" };
  }
}

export default function LobbyTechnicalInfoPage() {
  const { technicalInfo } = useLoaderData<typeof loader>();
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
        <h2 className="text-lg font-semibold mb-4">Technical Information</h2>
        <p className="text-sm text-theme-secondary mb-6">
          Add technical rider information, equipment lists, or other details for venue operators.
        </p>

        <Form method="post" className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Section Title</label>
            <input
              type="text"
              name="title"
              defaultValue={technicalInfo.title}
              placeholder="e.g., Technical Rider"
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Content</label>
            <RichTextEditor
              name="content"
              defaultValue={technicalInfo.content}
              placeholder="Enter technical information..."
              features={["bold", "italic", "underline", "heading", "bulletList", "orderedList", "link", "blockquote", "htmlSource"]}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", isSubmitting ? "cursor-not-allowed" : "cursor-pointer")}
          >
            {isSubmitting ? "Saving..." : "Save Technical Info"}
          </button>
        </Form>
      </section>
    </div>
  );
}
