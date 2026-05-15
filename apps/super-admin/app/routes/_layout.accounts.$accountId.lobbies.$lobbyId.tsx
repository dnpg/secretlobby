import { useEffect, useState } from "react";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/_layout.accounts.$accountId.lobbies.$lobbyId";
import { prisma } from "@secretlobby/db";
import { cn } from "@secretlobby/ui";
import { toast } from "sonner";

export function meta({ data }: Route.MetaArgs) {
  const lobby = data?.lobby;
  return [{ title: lobby ? `${lobby.name} – Lobby Config – Super Admin` : "Lobby Config – Super Admin" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { accountId, lobbyId } = params;
  if (!accountId || !lobbyId) {
    throw new Response("Missing params", { status: 400 });
  }

  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: {
      _count: { select: { tracks: true } },
    },
  });

  if (!lobby || lobby.accountId !== accountId) {
    throw new Response("Lobby not found", { status: 404 });
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { slug: true, defaultLobbyId: true },
  });

  const baseDomain = process.env.CORE_DOMAIN || "secretlobby.co";
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const isLocalDev = hostname.includes("localhost") || hostname.includes(".local");
  const protocol = isLocalDev ? "http" : "https";

  const lobbyUrl = lobby.isDefault
    ? `${protocol}://${account?.slug}.${baseDomain}`
    : `${protocol}://${account?.slug}.${baseDomain}/${lobby.slug}`;

  return {
    lobby,
    accountSlug: account?.slug ?? "",
    accountDefaultLobbyId: account?.defaultLobbyId ?? null,
    lobbyUrl,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const { accountId, lobbyId } = params;
  if (!accountId || !lobbyId) {
    return { error: "Missing params" };
  }

  const { updateLobbyCore, setAsDefaultLobby } = await import(
    "~/models/lobbies/mutations.server"
  );

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update-core") {
    const result = await updateLobbyCore(lobbyId, accountId, {
      name: (formData.get("name") as string) ?? "",
      slug: (formData.get("slug") as string) ?? "",
      title: (formData.get("title") as string) || null,
      description: (formData.get("description") as string) || null,
      isPublished: formData.get("isPublished") === "on",
      requiresAuth: formData.get("requiresAuth") === "on",
      password: (formData.get("password") as string) || null,
    });
    if ("error" in result) return { error: result.error, intent };
    return { success: "Lobby updated.", intent };
  }

  if (intent === "set-default") {
    const result = await setAsDefaultLobby(accountId, lobbyId);
    if ("error" in result) return { error: result.error, intent };
    return { success: "Set as default lobby.", intent };
  }

  return { error: "Unknown action" };
}

export default function LobbyConfig() {
  const { lobby, lobbyUrl, accountDefaultLobbyId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!actionData) return;
    if ("error" in actionData && actionData.error) toast.error(actionData.error);
    if ("success" in actionData && actionData.success) toast.success(actionData.success);
  }, [actionData]);

  const settingsJson = JSON.stringify(lobby.settings ?? {}, null, 2);
  const isCurrentDefault = lobby.id === accountDefaultLobbyId;

  return (
    <div className="space-y-6">
      {/* Header / breadcrumb back to lobbies list */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            to=".."
            className="text-theme-secondary hover:text-theme-primary transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h3 className="text-lg font-semibold">{lobby.name}</h3>
          {lobby.isDefault && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-(--color-brand-red-muted) text-(--color-brand-red)">
              Default
            </span>
          )}
          <span
            className={cn(
              "px-2 py-0.5 text-xs rounded-full",
              lobby.isPublished
                ? "bg-green-500/20 text-green-400"
                : "bg-yellow-500/20 text-yellow-400"
            )}
          >
            {lobby.isPublished ? "Published" : "Draft"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={lobbyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="link-primary transition text-sm cursor-pointer"
          >
            View public site
          </a>
        </div>
      </div>

      {/* Core fields form */}
      <div className="card p-6">
        <h4 className="text-base font-semibold mb-4">Core Fields</h4>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update-core" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-theme-secondary mb-1">
                Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={lobby.name}
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              />
              <p className="mt-1 text-xs text-theme-muted">Internal identifier shown in console.</p>
            </div>

            <div>
              <label htmlFor="slug" className="block text-sm font-medium text-theme-secondary mb-1">
                Slug *
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                required
                defaultValue={lobby.slug}
                pattern="[a-z0-9\-]+"
                className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary font-mono text-sm focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              />
              <p className="mt-1 text-xs text-theme-muted">Lowercase letters, numbers, hyphens. Used in URL.</p>
            </div>
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-theme-secondary mb-1">
              Public title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              defaultValue={lobby.title ?? ""}
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-theme-secondary mb-1">
              Public description
            </label>
            <textarea
              id="description"
              name="description"
              defaultValue={lobby.description ?? ""}
              rows={3}
              className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-theme-secondary mb-1">
              Lobby password
            </label>
            <div className="flex items-center gap-2">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                defaultValue={lobby.password ?? ""}
                placeholder="Leave empty for no password"
                className="flex-1 min-w-0 px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="shrink-0 px-3 py-2 rounded-lg border border-theme text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition cursor-pointer"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1 text-xs text-theme-muted">Stored as plaintext (matches console behavior).</p>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isPublished"
                defaultChecked={lobby.isPublished}
                className="rounded border-theme bg-theme-tertiary text-(--color-brand-red) focus:ring-(--color-brand-red)"
              />
              <span className="text-sm text-theme-secondary">Published</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="requiresAuth"
                defaultChecked={lobby.requiresAuth}
                className="rounded border-theme bg-theme-tertiary text-(--color-brand-red) focus:ring-(--color-brand-red)"
              />
              <span className="text-sm text-theme-secondary">Requires auth</span>
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition cursor-pointer"
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </Form>
      </div>

      {/* Default lobby control */}
      <div className="card p-6">
        <h4 className="text-base font-semibold mb-2">Default Lobby</h4>
        {isCurrentDefault ? (
          <p className="text-sm text-theme-secondary">
            This is the default lobby for the account. Promote a different lobby to change the default.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-theme-secondary">
              This lobby is not currently the default. Promoting it will demote any existing default.
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="set-default" />
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 btn-secondary disabled:opacity-50 rounded-lg text-sm font-medium transition cursor-pointer"
              >
                Set as default
              </button>
            </Form>
          </div>
        )}
      </div>

      {/* Read-only metadata + media + settings */}
      <div className="card p-6">
        <h4 className="text-base font-semibold mb-4">Metadata</h4>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-theme-secondary">Lobby ID</dt>
            <dd className="font-mono break-all">{lobby.id}</dd>
          </div>
          <div>
            <dt className="text-theme-secondary">Account ID</dt>
            <dd className="font-mono break-all">{lobby.accountId}</dd>
          </div>
          <div>
            <dt className="text-theme-secondary">Tracks</dt>
            <dd>{lobby._count.tracks}</dd>
          </div>
          <div>
            <dt className="text-theme-secondary">Created</dt>
            <dd>{new Date(lobby.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-theme-secondary">Updated</dt>
            <dd>{new Date(lobby.updatedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-theme-secondary">Published at</dt>
            <dd>{lobby.publishedAt ? new Date(lobby.publishedAt).toLocaleString() : "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="card p-6">
        <h4 className="text-base font-semibold mb-4">Media References</h4>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {[
            ["Background (light)", lobby.backgroundMediaId],
            ["Background (dark)", lobby.backgroundMediaDarkId],
            ["Banner (light)", lobby.bannerMediaId],
            ["Banner (dark)", lobby.bannerMediaDarkId],
            ["Profile (light)", lobby.profileMediaId],
            ["Profile (dark)", lobby.profileMediaDarkId],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-theme-secondary">{label}</dt>
              <dd className="font-mono break-all">{value || <span className="text-theme-muted">—</span>}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-base font-semibold">Settings JSON (read-only)</h4>
          <span className="text-xs text-theme-muted">Edit via the console UI</span>
        </div>
        <pre className="bg-theme-tertiary p-4 rounded-lg overflow-auto text-xs font-mono max-h-96">
          {settingsJson}
        </pre>
      </div>
    </div>
  );
}
