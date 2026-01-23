import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.login";
import { getSession, requireUserAuth } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { uploadFile, deleteFile, getPublicUrl } from "@secretlobby/storage";
import { cn } from "@secretlobby/ui";
import {
  getLoginPageSettings,
  updateLoginPageSettings,
  type LoginPageSettings,
} from "~/lib/content.server";

export function meta() {
  return [{ title: "Login Page Settings - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const loginSettings = await getLoginPageSettings(accountId);

  // Get lobby password
  const lobby = await prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
    select: { password: true },
  });

  return {
    loginSettings,
    logoImageUrl: loginSettings.logoImage ? getPublicUrl(loginSettings.logoImage) : null,
    lobbyPassword: lobby?.password || null,
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
    switch (intent) {
      case "update-login-appearance": {
        const title = (formData.get("title") as string) || "";
        const description = (formData.get("description") as string) || "";
        const bgColor = (formData.get("bgColor") as string) || "#111827";
        const panelBgColor = (formData.get("panelBgColor") as string) || "#1f2937";
        const panelBorderColor = (formData.get("panelBorderColor") as string) || "#374151";
        const textColor = (formData.get("textColor") as string) || "#ffffff";

        await updateLoginPageSettings(accountId, {
          title,
          description,
          bgColor,
          panelBgColor,
          panelBorderColor,
          textColor,
        });

        return { success: "Login page appearance updated" };
      }

      case "update-login-logo": {
        const logoType = formData.get("logoType") as string;

        if (logoType === "svg") {
          const logoSvg = (formData.get("logoSvg") as string) || "";
          // Remove old image if switching from image to SVG
          const current = await getLoginPageSettings(accountId);
          if (current.logoImage) {
            try { await deleteFile(current.logoImage); } catch {}
          }
          await updateLoginPageSettings(accountId, {
            logoType: "svg",
            logoSvg,
            logoImage: "",
          });
          return { success: "SVG logo updated" };
        }

        if (logoType === "image") {
          const file = formData.get("logoFile") as File | null;
          if (!file || file.size === 0) {
            return { error: "Please select an image file" };
          }

          const ext = file.name.split(".").pop() || "png";
          const key = `${accountId}/login/logo-${Date.now()}.${ext}`;
          const buffer = Buffer.from(await file.arrayBuffer());
          await uploadFile(key, buffer, file.type || "image/png");

          // Remove old image
          const current = await getLoginPageSettings(accountId);
          if (current.logoImage) {
            try { await deleteFile(current.logoImage); } catch {}
          }

          await updateLoginPageSettings(accountId, {
            logoType: "image",
            logoImage: key,
            logoSvg: "",
          });
          return { success: "Logo image uploaded" };
        }

        return { error: "Invalid logo type" };
      }

      case "remove-login-logo": {
        const current = await getLoginPageSettings(accountId);
        if (current.logoImage) {
          try { await deleteFile(current.logoImage); } catch {}
        }
        await updateLoginPageSettings(accountId, {
          logoType: null,
          logoSvg: "",
          logoImage: "",
        });
        return { success: "Logo removed" };
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

        const lobby = await prisma.lobby.findFirst({
          where: { accountId, isDefault: true },
        });

        if (!lobby) {
          return { error: "No default lobby found" };
        }

        await prisma.lobby.update({
          where: { id: lobby.id },
          data: { password: newPassword },
        });

        return { success: "Lobby password updated successfully" };
      }
    }
  } catch (error) {
    console.error("Login page settings error:", error);
    return { error: "Operation failed" };
  }

  return null;
}

interface ColorInputProps {
  label: string;
  name: string;
  value: string;
  description?: string;
}

function ColorInput({ label, name, value, description }: ColorInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-theme-primary">
        {label}
      </label>
      {description && (
        <p className="text-xs text-theme-muted mb-2">{description}</p>
      )}
      <div className="flex gap-2">
        <input
          type="color"
          name={name}
          defaultValue={value}
          className="w-12 h-10 rounded cursor-pointer bg-transparent border border-theme"
        />
        <input
          type="text"
          defaultValue={value}
          onChange={(e) => {
            const colorInput = e.target.previousElementSibling as HTMLInputElement;
            if (colorInput && /^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
              colorInput.value = e.target.value;
            }
          }}
          className="flex-1 px-3 py-2 bg-theme-tertiary rounded-lg border border-theme text-theme-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

export default function AdminLogin() {
  const { loginSettings, logoImageUrl, lobbyPassword } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

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

      {/* Logo Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Login Page Logo</h2>
        <p className="text-sm text-theme-secondary mb-4">
          Add a logo that appears above the login form title.
        </p>

        {/* Current logo preview */}
        {loginSettings.logoType === "svg" && loginSettings.logoSvg && (
          <div className="mb-4 p-4 bg-theme-tertiary rounded-lg border border-theme">
            <p className="text-xs text-theme-muted mb-2">Current SVG logo:</p>
            <div
              className="max-w-[200px] max-h-[80px] [&>svg]:max-w-full [&>svg]:max-h-[80px]"
              dangerouslySetInnerHTML={{ __html: loginSettings.logoSvg }}
            />
          </div>
        )}
        {loginSettings.logoType === "image" && logoImageUrl && (
          <div className="mb-4 p-4 bg-theme-tertiary rounded-lg border border-theme">
            <p className="text-xs text-theme-muted mb-2">Current image logo:</p>
            <img src={logoImageUrl} alt="Login logo" className="max-w-[200px] max-h-[80px] object-contain" />
          </div>
        )}

        {/* SVG Logo Form */}
        <details className="mb-4" open={loginSettings.logoType === "svg"}>
          <summary className="cursor-pointer text-sm font-medium text-theme-secondary hover:text-theme-primary transition">
            Use SVG Code
          </summary>
          <Form method="post" className="mt-3 space-y-3">
            <input type="hidden" name="intent" value="update-login-logo" />
            <input type="hidden" name="logoType" value="svg" />
            <textarea
              name="logoSvg"
              rows={4}
              defaultValue={loginSettings.logoSvg}
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none font-mono text-sm"
              placeholder="<svg>...</svg>"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
            >
              Save SVG Logo
            </button>
          </Form>
        </details>

        {/* Image Logo Form */}
        <details className="mb-4" open={loginSettings.logoType === "image"}>
          <summary className="cursor-pointer text-sm font-medium text-theme-secondary hover:text-theme-primary transition">
            Upload Image
          </summary>
          <Form method="post" encType="multipart/form-data" className="mt-3 space-y-3">
            <input type="hidden" name="intent" value="update-login-logo" />
            <input type="hidden" name="logoType" value="image" />
            <input
              type="file"
              name="logoFile"
              accept="image/*"
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-[var(--color-primary-text)] file:cursor-pointer"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
            >
              Upload Logo Image
            </button>
          </Form>
        </details>

        {/* Remove Logo */}
        {loginSettings.logoType && (
          <Form method="post">
            <input type="hidden" name="intent" value="remove-login-logo" />
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn("px-4 py-2 text-sm btn-secondary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
            >
              Remove Logo
            </button>
          </Form>
        )}
      </section>

      {/* Title, Description & Colors Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Appearance</h2>
        <p className="text-sm text-theme-secondary mb-6">
          Customize the title, description, and colors of the login page.
        </p>

        <Form method="post" className="space-y-6">
          <input type="hidden" name="intent" value="update-login-appearance" />

          {/* Title & Description */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <input
                type="text"
                name="title"
                defaultValue={loginSettings.title}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                placeholder="Console Login"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <input
                type="text"
                name="description"
                defaultValue={loginSettings.description}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                placeholder="Sign in to manage your account"
              />
            </div>
          </div>

          {/* Colors */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Colors
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorInput
                label="Page Background"
                name="bgColor"
                value={loginSettings.bgColor}
                description="Main page background color"
              />
              <ColorInput
                label="Panel Background"
                name="panelBgColor"
                value={loginSettings.panelBgColor}
                description="Login card background"
              />
              <ColorInput
                label="Panel Border"
                name="panelBorderColor"
                value={loginSettings.panelBorderColor}
                description="Login card border color"
              />
              <ColorInput
                label="Text Color"
                name="textColor"
                value={loginSettings.textColor}
                description="Heading and label text"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
          >
            Save Appearance
          </button>
        </Form>
      </section>

      {/* Lobby Password Section */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Lobby Password</h2>
        <p className="text-sm text-theme-secondary mb-4">
          {lobbyPassword
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
