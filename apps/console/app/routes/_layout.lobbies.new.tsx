import { useState, useEffect } from "react";
import { Form, useActionData, useLoaderData, useNavigation, redirect, Link } from "react-router";
import type { Route } from "./+types/_layout.lobbies.new";
import { cn } from "@secretlobby/ui";
import { toast } from "sonner";

export function meta() {
  return [{ title: "Create Lobby - Admin" }];
}

interface ExistingLobby {
  id: string;
  name: string;
  slug: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getLobbiesByAccountId } = await import("~/models/queries/lobby.server");
  const { canCreateMoreLobbies } = await import("~/models/queries/subscription.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const [canCreate, lobbies] = await Promise.all([
    canCreateMoreLobbies(accountId),
    getLobbiesByAccountId(accountId),
  ]);

  if (!canCreate.allowed) {
    // Redirect back to lobbies list if they can't create more
    throw redirect("/lobbies");
  }

  const existingLobbies: ExistingLobby[] = lobbies.map((l) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
  }));

  return {
    existingLobbies,
    limits: {
      current: canCreate.current,
      max: canCreate.max,
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { getSession, requireUserAuth, updateSession } = await import("@secretlobby/auth");
  const { createLobby, duplicateLobby } = await import("~/models/mutations/lobby.server");
  const { getLobbyBySlug, getLobbyById } = await import("~/models/queries/lobby.server");
  const { canCreateMoreLobbies } = await import("~/models/queries/subscription.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobbies" });

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  // Check limits
  const canCreate = await canCreateMoreLobbies(accountId);
  if (!canCreate.allowed) {
    return { error: "Lobby limit reached. Upgrade your plan to create more lobbies." };
  }

  const formData = await request.formData();
  const name = (formData.get("name") as string)?.trim();
  const slug = (formData.get("slug") as string)?.trim().toLowerCase();
  const copyFromId = formData.get("copyFrom") as string | null;

  // Validate inputs
  if (!name || name.length < 2) {
    return { error: "Name must be at least 2 characters" };
  }

  if (!slug || slug.length < 2) {
    return { error: "Slug must be at least 2 characters" };
  }

  // Validate slug format (alphanumeric and hyphens only)
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Slug can only contain lowercase letters, numbers, and hyphens" };
  }

  // Check for duplicate slug
  const existing = await getLobbyBySlug(accountId, slug);
  if (existing) {
    return { error: "A lobby with this slug already exists" };
  }

  try {
    let lobby;

    if (copyFromId && copyFromId !== "blank") {
      // Verify source lobby belongs to account
      const sourceLobby = await getLobbyById(copyFromId);
      if (!sourceLobby || sourceLobby.accountId !== accountId) {
        return { error: "Source lobby not found" };
      }

      lobby = await duplicateLobby(copyFromId, name, slug);
      logger.info({ lobbyId: lobby.id, sourceLobbyId: copyFromId }, "Lobby duplicated");
    } else {
      lobby = await createLobby({
        accountId,
        name,
        slug,
        title: name,
        isPublished: false,
      });
      logger.info({ lobbyId: lobby.id }, "Lobby created");
    }

    // Update session to switch to the new lobby
    await updateSession(request, {
      currentLobbyId: lobby.id,
      currentLobbySlug: lobby.slug,
    });

    // Redirect to the new lobby's edit page
    return redirect(`/lobby/${lobby.id}`);
  } catch (error) {
    logger.error({ error: formatError(error) }, "Failed to create lobby");
    return { error: "Failed to create lobby" };
  }
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export default function NewLobbyPage() {
  const { existingLobbies, limits } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [copyFrom, setCopyFrom] = useState("blank");

  // Auto-generate slug from name unless manually edited
  useEffect(() => {
    if (!slugEdited && name) {
      setSlug(generateSlug(name));
    }
  }, [name, slugEdited]);

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          to="/lobbies"
          className="text-sm text-theme-secondary hover:text-theme-primary transition"
        >
          &larr; Back to Lobbies
        </Link>
      </div>

      <div className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h1 className="text-2xl font-bold mb-2">Create New Lobby</h1>
        <p className="text-sm text-theme-secondary mb-6">
          Create a new lobby with its own content, theme, and settings.
          {limits.max !== -1 && (
            <span className="ml-1">
              ({limits.current + 1} of {limits.max} lobbies)
            </span>
          )}
        </p>

        <Form method="post" className="space-y-6">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Lobby Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="My New Lobby"
              required
              minLength={2}
              maxLength={100}
            />
            <p className="text-xs text-theme-muted mt-1">
              This is the internal name for your lobby.
            </p>
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="slug" className="block text-sm font-medium mb-2">
              URL Slug
            </label>
            <div className="flex items-center">
              <span className="px-3 py-2 bg-theme-tertiary border border-r-0 border-theme rounded-l-lg text-theme-muted text-sm">
                /
              </span>
              <input
                type="text"
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase());
                  setSlugEdited(true);
                }}
                className="flex-1 px-4 py-2 bg-theme-tertiary rounded-r-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                placeholder="my-new-lobby"
                required
                minLength={2}
                maxLength={50}
                pattern="[a-z0-9-]+"
              />
            </div>
            <p className="text-xs text-theme-muted mt-1">
              This will be part of your lobby URL. Use only lowercase letters, numbers, and hyphens.
            </p>
          </div>

          {/* Copy Settings From */}
          {existingLobbies.length > 0 && (
            <div>
              <label htmlFor="copyFrom" className="block text-sm font-medium mb-2">
                Start From
              </label>
              <select
                id="copyFrom"
                name="copyFrom"
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                <option value="blank">Blank lobby</option>
                <optgroup label="Copy settings from">
                  {existingLobbies.map((lobby) => (
                    <option key={lobby.id} value={lobby.id}>
                      {lobby.name} (/{lobby.slug})
                    </option>
                  ))}
                </optgroup>
              </select>
              <p className="text-xs text-theme-muted mt-1">
                Copy theme, social links, and other settings from an existing lobby.
              </p>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-4 pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !name || !slug}
              className={cn(
                "px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50",
                isSubmitting ? "cursor-not-allowed" : "cursor-pointer"
              )}
            >
              {isSubmitting ? "Creating..." : "Create Lobby"}
            </button>
            <Link
              to="/lobbies"
              className="px-6 py-2 btn-secondary rounded-lg transition cursor-pointer"
            >
              Cancel
            </Link>
          </div>
        </Form>
      </div>
    </div>
  );
}
