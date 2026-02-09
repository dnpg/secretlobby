import type { Route } from "./+types/api.switch-lobby";

export async function action({ request }: Route.ActionArgs) {
  const { getSession, updateSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const lobbyId = formData.get("lobbyId") as string;

  if (intent !== "switch-lobby" || !lobbyId) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // Verify lobby belongs to account
  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    return Response.json({ error: "Lobby not found" }, { status: 404 });
  }

  // Update session with new lobby
  const { response } = await updateSession(request, {
    currentLobbyId: lobby.id,
    currentLobbySlug: lobby.slug,
  });

  // Return success with Set-Cookie header from the updateSession response
  return new Response(JSON.stringify({ success: true, lobbyId: lobby.id }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": response.headers.get("Set-Cookie") || "",
    },
  });
}
