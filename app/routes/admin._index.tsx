import { Form, useLoaderData, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin._index";
import { getSession } from "~/lib/session.server";
import { getSiteContent, updateSiteContent, updateSitePassword } from "~/lib/content.server";

export function meta() {
  return [{ title: "Content Settings - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (!session.isAdmin) {
    return { content: null };
  }
  const content = await getSiteContent();
  return { content };
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await getSession(request);
  if (!session.isAdmin) {
    return { error: "Unauthorized" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "update-band-info": {
        const bandName = formData.get("bandName") as string;
        const bandDescription = formData.get("bandDescription") as string;
        await updateSiteContent({ bandName, bandDescription });
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

        await updateSitePassword(newPassword);
        return { success: "Site password updated successfully" };
      }
    }
  } catch {
    return { error: "Operation failed" };
  }

  return null;
}

export default function AdminContent() {
  const { content } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (!content) return null;

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
        <h2 className="text-lg font-semibold mb-4">Band Information</h2>
        <p className="text-sm text-theme-secondary mb-4">
          Set your band name and description that will appear on the player page.
        </p>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update-band-info" />
          <div>
            <label className="block text-sm font-medium mb-2">Band Name</label>
            <input
              type="text"
              name="bandName"
              defaultValue={content.bandName || ""}
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="Enter band name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              name="bandDescription"
              defaultValue={content.bandDescription || ""}
              rows={4}
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
              placeholder="Enter band description..."
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50"
          >
            Save Band Info
          </button>
        </Form>
      </section>

      {/* Site Password Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Site Password</h2>
        <p className="text-sm text-theme-secondary mb-4">
          Change the password that users need to enter to access the player.
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
            className="px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50"
          >
            Update Password
          </button>
        </Form>
      </section>
    </div>
  );
}
