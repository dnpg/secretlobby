import { useState } from "react";
import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.social";
import { getSession, requireUserAuth } from "@secretlobby/auth";
import { cn } from "@secretlobby/ui";
import { getSocialLinksSettings, updateSocialLinksSettings } from "~/lib/content.server";
import { SOCIAL_PLATFORMS, type SocialLink, type SocialLinksSettings } from "~/lib/social-platforms";

export function meta() {
  return [{ title: "Social Links - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const socialLinks = await getSocialLinksSettings(accountId);

  return { socialLinks };
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
      case "update-social-links": {
        const linksJson = formData.get("links") as string;
        const iconStyle = (formData.get("iconStyle") as "brand" | "mono") || "mono";
        const iconColor = (formData.get("iconColor") as string) || undefined;

        let links: SocialLink[] = [];
        try {
          links = JSON.parse(linksJson || "[]");
        } catch {
          return { error: "Invalid links data" };
        }

        // Filter out empty URLs
        links = links.filter((l) => l.url.trim() !== "");

        const settings: SocialLinksSettings = {
          links,
          iconStyle,
          iconColor: iconColor || undefined,
        };

        await updateSocialLinksSettings(accountId, settings);
        return { success: "Social links updated successfully" };
      }
    }
  } catch (error) {
    console.error("Social links update error:", error);
    return { error: "Operation failed" };
  }

  return null;
}

export default function SocialLinksPage() {
  const { socialLinks } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [links, setLinks] = useState<SocialLink[]>(socialLinks.links);
  const [iconStyle, setIconStyle] = useState<"brand" | "mono">(socialLinks.iconStyle);
  const [iconColor, setIconColor] = useState(socialLinks.iconColor || "");

  function addLink(platformId: string) {
    if (links.some((l) => l.platform === platformId)) return;
    setLinks([...links, { platform: platformId, url: "" }]);
  }

  function removeLink(platform: string) {
    setLinks(links.filter((l) => l.platform !== platform));
  }

  function updateLinkUrl(platform: string, url: string) {
    setLinks(links.map((l) => (l.platform === platform ? { ...l, url } : l)));
  }

  const availablePlatforms = SOCIAL_PLATFORMS.filter(
    (p) => !links.some((l) => l.platform === p.id)
  );

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

      <Form method="post">
        <input type="hidden" name="intent" value="update-social-links" />
        <input type="hidden" name="links" value={JSON.stringify(links)} />
        <input type="hidden" name="iconStyle" value={iconStyle} />
        <input type="hidden" name="iconColor" value={iconColor} />

        {/* Icon Style Section */}
        <section className="bg-theme-secondary rounded-xl p-6 border border-theme mb-6">
          <h2 className="text-lg font-semibold mb-4">Icon Style</h2>
          <p className="text-sm text-theme-secondary mb-4">
            Choose how social media icons appear in your lobby.
          </p>

          <div className="flex gap-3 mb-4">
            <button
              type="button"
              onClick={() => setIconStyle("brand")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition",
                iconStyle === "brand"
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                  : "bg-theme-tertiary text-theme-secondary hover:text-theme-primary"
              )}
            >
              Brand Colors
            </button>
            <button
              type="button"
              onClick={() => setIconStyle("mono")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition",
                iconStyle === "mono"
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-text)]"
                  : "bg-theme-tertiary text-theme-secondary hover:text-theme-primary"
              )}
            >
              Single Color
            </button>
          </div>

          {iconStyle === "mono" && (
            <div>
              <label className="block text-sm font-medium mb-2">Icon Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={iconColor || "#ffffff"}
                  onChange={(e) => setIconColor(e.target.value)}
                  className="w-10 h-10 rounded border border-theme cursor-pointer"
                />
                <input
                  type="text"
                  value={iconColor}
                  onChange={(e) => setIconColor(e.target.value)}
                  placeholder="Leave empty for theme default"
                  className="flex-1 px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
                />
              </div>
              <p className="text-xs text-theme-muted mt-1">
                Leave empty to use the lobby's text color from the theme.
              </p>
            </div>
          )}
        </section>

        {/* Links Section */}
        <section className="bg-theme-secondary rounded-xl p-6 border border-theme mb-6">
          <h2 className="text-lg font-semibold mb-4">Social Links</h2>
          <p className="text-sm text-theme-secondary mb-4">
            Add links to your social media profiles and streaming platforms. These will be displayed in your lobby sidebar.
          </p>

          {/* Current Links */}
          <div className="space-y-3 mb-6">
            {links.length === 0 && (
              <p className="text-sm text-theme-muted py-4 text-center">
                No social links added yet. Add one below.
              </p>
            )}
            {links.map((link) => {
              const platform = SOCIAL_PLATFORMS.find((p) => p.id === link.platform);
              if (!platform) return null;

              return (
                <div key={link.platform} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-32 shrink-0">{platform.label}</span>
                  <input
                    type="text"
                    value={link.url}
                    onChange={(e) => updateLinkUrl(link.platform, e.target.value)}
                    placeholder={platform.placeholder}
                    className="flex-1 px-3 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeLink(link.platform)}
                    className="p-2 text-red-400 hover:text-red-300 transition shrink-0"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add Platform Selector */}
          {availablePlatforms.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Add Platform</label>
              <div className="flex flex-wrap gap-2">
                {availablePlatforms.map((platform) => (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => addLink(platform.id)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-theme-tertiary text-theme-secondary hover:text-theme-primary hover:bg-[var(--color-secondary-hover)] transition"
                  >
                    + {platform.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50",
            { "cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting }
          )}
        >
          {isSubmitting ? "Saving..." : "Save Social Links"}
        </button>
      </Form>
    </div>
  );
}
