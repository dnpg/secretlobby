import { useEffect } from "react";
import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.lobby.login";
import { cn } from "@secretlobby/ui";
import { toast } from "sonner";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Login Page - ${data?.lobbyName || "Lobby"} - Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { getLobbyLoginPageSettings } = await import("~/lib/content.server");
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

  const loginPage = await getLobbyLoginPageSettings(lobbyId);
  return { loginPage, lobbyName: lobby.name };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { updateLobbyLoginPageSettings } = await import("~/lib/content.server");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobby-login" });

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
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      buttonLabel: formData.get("buttonLabel") as string,
      bgColor: formData.get("bgColor") as string,
      panelBgColor: formData.get("panelBgColor") as string,
      panelBorderColor: formData.get("panelBorderColor") as string,
      textColor: formData.get("textColor") as string,
    };

    await updateLobbyLoginPageSettings(lobbyId, updates);
    return { success: "Login page updated" };
  } catch (error) {
    logger.error({ error: formatError(error) }, "Login page update error");
    return { error: "Failed to update login page" };
  }
}

export default function LobbyLoginPage() {
  const { loginPage } = useLoaderData<typeof loader>();
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
        <h2 className="text-lg font-semibold mb-4">Login Page Settings</h2>
        <p className="text-sm text-theme-secondary mb-6">
          Customize the password entry page for this lobby.
        </p>

        <Form method="post" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Page Title</label>
              <input
                type="text"
                name="title"
                defaultValue={loginPage.title}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Button Label</label>
              <input
                type="text"
                name="buttonLabel"
                defaultValue={loginPage.buttonLabel}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              name="description"
              defaultValue={loginPage.description}
              rows={3}
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Background</label>
              <input
                type="color"
                name="bgColor"
                defaultValue={loginPage.bgColor}
                className="w-full h-10 rounded border border-theme cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Panel Background</label>
              <input
                type="color"
                name="panelBgColor"
                defaultValue={loginPage.panelBgColor}
                className="w-full h-10 rounded border border-theme cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Panel Border</label>
              <input
                type="color"
                name="panelBorderColor"
                defaultValue={loginPage.panelBorderColor}
                className="w-full h-10 rounded border border-theme cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Text Color</label>
              <input
                type="color"
                name="textColor"
                defaultValue={loginPage.textColor}
                className="w-full h-10 rounded border border-theme cursor-pointer"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", isSubmitting ? "cursor-not-allowed" : "cursor-pointer")}
          >
            {isSubmitting ? "Saving..." : "Save Login Page"}
          </button>
        </Form>
      </section>
    </div>
  );
}
