import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout._index";
import { getSession, requireUserAuth } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { cn } from "@secretlobby/ui";

export function meta() {
  return [{ title: "Content Settings - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  // Get the default lobby for this account
  const lobby = await prisma.lobby.findFirst({
    where: {
      accountId,
      isDefault: true,
    },
  });

  if (!lobby) {
    return { lobby: null };
  }

  return {
    lobby: {
      id: lobby.id,
      title: lobby.title,
      description: lobby.description,
      password: lobby.password,
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    // Get the default lobby for this account
    const lobby = await prisma.lobby.findFirst({
      where: {
        accountId,
        isDefault: true,
      },
    });

    if (!lobby) {
      return { error: "No default lobby found" };
    }

    switch (intent) {
      case "update-band-info": {
        const title = formData.get("bandName") as string;
        const description = formData.get("bandDescription") as string;

        await prisma.lobby.update({
          where: { id: lobby.id },
          data: {
            title: title || null,
            description: description || null,
          },
        });

        return { success: "Band info updated successfully" };
      }

      case "update-password": {
        const newPassword = formData.get("newPassword") as string;
        const confirmPassword = formData.get("confirmPassword") as string;

        if (!newPassword || newPassword.length < 4) {
          return { error: "Password must be at least 4 characters" };
        }
        if (newPassword !== confirmPassword) {
          return { error: "Passwords do not match" };
        }

        await prisma.lobby.update({
          where: { id: lobby.id },
          data: {
            password: newPassword,
          },
        });

        return { success: "Lobby password updated successfully" };
      }
    }
  } catch (error) {
    console.error("Content update error:", error);
    return { error: "Operation failed" };
  }

  return null;
}

export default function AdminContent() {
  const { lobby } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (!lobby) {
    return (
      <div className="text-center py-8">
        <p className="text-theme-secondary">No lobby found. Please contact support.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Status Messages */}
      {actionData?.success && (
        <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400">
          {actionData.success}
        </div>
      )}
      {actionData?.error && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
          {actionData.error}
        </div>
      )}

      {/* Band Info Section */}
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
            <textarea
              name="bandDescription"
              defaultValue={lobby.description || ""}
              rows={4}
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
              placeholder="Enter lobby description..."
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
          >
            Save Lobby Info
          </button>
        </Form>
      </section>

      {/* Lobby Password Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Lobby Password</h2>
        <p className="text-sm text-theme-secondary mb-4">
          {lobby.password
            ? "Change or remove the password protection for your lobby."
            : "Add password protection to your lobby (optional)."}
        </p>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update-password" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">New Password</label>
              <input
                type="password"
                name="newPassword"
                required
                minLength={4}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                placeholder="Enter new password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                required
                minLength={4}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                placeholder="Confirm new password"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
          >
            Update Password
          </button>
        </Form>
      </section>
    </div>
  );
}
