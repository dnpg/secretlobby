import { useEffect } from "react";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.settings";
import { toast } from "sonner";

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth, getCsrfToken } = await import("@secretlobby/auth");
  const { getAccountWithDomains } = await import("~/models/queries/account.server");
  const { getGoogleAnalyticsSettings } = await import("~/lib/content.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  // Get account details with domains
  const account = await getAccountWithDomains(accountId);

  if (!account) {
    throw redirect("/login");
  }

  // Use CORE_DOMAIN from environment
  const baseDomain = process.env.CORE_DOMAIN || "secretlobby.co";

  const gaSettings = await getGoogleAnalyticsSettings(accountId);

  const hasVerifiedCustomDomain = account.domains.some(
    (d) => d.status === "VERIFIED"
  );

  const csrfToken = await getCsrfToken(request);

  return {
    account: {
      id: account.id,
      name: account.name,
      slug: account.slug,
      subscriptionTier: account.subscriptionTier,
      defaultLobbyId: account.defaultLobbyId,
    },
    domains: account.domains,
    lobbies: account.lobbies,
    baseDomain,
    gaSettings,
    hasVerifiedCustomDomain,
    csrfToken,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { getAccountBySlug } = await import("~/models/queries/account.server");
  const { getDomainByDomain } = await import("~/models/queries/domain.server");
  const { updateAccountSlug } = await import("~/models/mutations/account.server");
  const { createDomain, deleteDomain } = await import("~/models/mutations/domain.server");
  const { updateGoogleAnalyticsSettings } = await import("~/lib/content.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:settings" });

  const { session } = await getSession(request);
  requireUserAuth(session);

  // Verify CSRF token (uses HMAC validation)
  await csrfProtect(request);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "add_domain") {
      const domain = formData.get("domain");

      if (typeof domain !== "string" || !domain.trim()) {
        return { error: "Domain is required" };
      }

      // Basic domain validation
      const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;
      if (!domainRegex.test(domain)) {
        return { error: "Invalid domain format" };
      }

      // Check if domain already exists
      const existingDomain = await getDomainByDomain(domain);

      if (existingDomain) {
        return { error: "This domain is already registered" };
      }

      // Create domain
      await createDomain(accountId, domain);

      return { success: "Domain added successfully. Please verify your DNS settings." };
    }

    if (intent === "delete_domain") {
      const domainId = formData.get("domainId");

      if (typeof domainId !== "string") {
        return { error: "Invalid domain ID" };
      }

      await deleteDomain(domainId, accountId);

      return { success: "Domain removed successfully" };
    }

    if (intent === "update_slug") {
      const newSlug = formData.get("slug");

      if (typeof newSlug !== "string" || !newSlug.trim()) {
        return { error: "Subdomain is required" };
      }

      // Validate slug format
      const slugRegex = /^[a-z][a-z0-9-]*$/;
      if (!slugRegex.test(newSlug)) {
        return { error: "Subdomain must start with a letter and contain only lowercase letters, numbers, and hyphens" };
      }

      // Check if slug is already taken
      const existingAccount = await getAccountBySlug(newSlug);

      if (existingAccount && existingAccount.id !== accountId) {
        return { error: "This subdomain is already taken" };
      }

      // Update account slug
      await updateAccountSlug(accountId, newSlug);

      return { success: "Subdomain updated successfully" };
    }

    if (intent === "update-ga") {
      const trackingId = (formData.get("trackingId") as string || "").trim();
      const gtmContainerId = (formData.get("gtmContainerId") as string || "").trim();

      // Allow empty string (to clear) or valid GA4/GT measurement IDs
      if (trackingId && !/^G[T]?-[A-Z0-9]+$/i.test(trackingId)) {
        return { error: "Invalid measurement ID format. Expected format: G-XXXXXXXXXX" };
      }

      if (gtmContainerId && !/^GTM-[A-Z0-9]+$/i.test(gtmContainerId)) {
        return { error: "Invalid GTM Container ID format. Expected format: GTM-XXXXXXX" };
      }

      await updateGoogleAnalyticsSettings(accountId, { trackingId, gtmContainerId });
      return { success: "Google Analytics settings saved" };
    }

    return { error: "Invalid action" };
  } catch (error) {
    logger.error({ error: formatError(error) }, "Settings action error");
    return { error: "An error occurred. Please try again." };
  }
}

export default function Settings() {
  const { account, domains, lobbies, baseDomain, gaSettings, hasVerifiedCustomDomain, csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const defaultLobby = lobbies.find((l) => l.isDefault) || lobbies[0];

  useEffect(() => {
    if (actionData?.success) {
      toast.success(actionData.success);
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Domain Settings</h2>
        <p className="text-theme-secondary">
          Configure how visitors access your lobby
        </p>
      </div>

      {/* Subdomain Settings */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Subdomain</h3>

        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update_slug" />
          <input type="hidden" name="_csrf" value={csrfToken} />

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-theme-secondary mb-2">
              Your Subdomain
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                id="slug"
                name="slug"
                defaultValue={account.slug}
                pattern="^[a-z][a-z0-9-]*$"
                required
                className="flex-1 px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-theme-secondary">.{baseDomain}</span>
              <button
                type="submit"
                className="px-4 py-2 btn-primary rounded-lg transition"
              >
                Update
              </button>
            </div>
            <p className="text-xs text-theme-secondary mt-2">
              Your lobby will be accessible at: <strong>{account.slug}.{baseDomain}</strong>
              {defaultLobby && defaultLobby.slug !== "main" && (
                <> or <strong>{account.slug}.{baseDomain}/{defaultLobby.slug}</strong></>
              )}
            </p>
          </div>
        </Form>
      </div>

      {/* Custom Domains - Coming soon (upgrade-style) */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6 relative overflow-hidden">
        <div className="absolute top-3 right-3">
          <span className="px-2 py-1 text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full">
            Coming soon
          </span>
        </div>
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-theme-tertiary border border-theme flex items-center justify-center">
            <svg className="w-5 h-5 text-theme-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-1">Custom Domains</h3>
            <p className="text-sm text-theme-secondary">
              Connect your own domain to your lobby (e.g., music.yourband.com). This feature will be available soon—no upgrade required.
            </p>
          </div>
        </div>
        <div className="py-4 px-4 bg-theme-tertiary/50 border border-theme rounded-lg">
          <p className="text-sm text-theme-muted">
            We're working on bringing custom domains to everyone. Check back later or contact support if you need early access.
          </p>
        </div>
      </div>

      {/* Default Lobby Info */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Default Lobby</h3>
        {defaultLobby ? (
          <div className="text-theme-secondary">
            <p className="mb-2">
              Current default lobby: <strong className="text-theme-primary">{defaultLobby.name}</strong>
            </p>
            <p className="text-sm">
              This lobby will be shown when visitors access your main domain.
            </p>
          </div>
        ) : (
          <p className="text-theme-secondary">No default lobby set</p>
        )}
      </div>

      {/* Google Analytics */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Google Analytics</h3>
        <p className="text-sm text-theme-secondary mb-4">
          Add your GA4 measurement ID to track visitor activity on your lobby.
        </p>

        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update-ga" />
          <input type="hidden" name="_csrf" value={csrfToken} />

          <div>
            <label htmlFor="trackingId" className="block text-sm font-medium text-theme-secondary mb-2">
              Measurement ID
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                id="trackingId"
                name="trackingId"
                defaultValue={gaSettings.trackingId}
                placeholder="G-XXXXXXXXXX"
                className="flex-1 px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder:text-theme-secondary/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-theme-secondary mt-2">
              Find your measurement ID in Google Analytics under Admin &gt; Data Streams. Leave empty to disable tracking.
            </p>
          </div>

          <div>
            <label htmlFor="gtmContainerId" className="block text-sm font-medium text-theme-secondary mb-2">
              GTM Container ID
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                id="gtmContainerId"
                name="gtmContainerId"
                defaultValue={gaSettings.gtmContainerId}
                placeholder="GTM-XXXXXXX"
                disabled={!hasVerifiedCustomDomain}
                className={`flex-1 px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder:text-theme-secondary/50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  !hasVerifiedCustomDomain ? "opacity-50 cursor-not-allowed" : ""
                }`}
              />
              <button
                type="submit"
                className="px-4 py-2 btn-primary rounded-lg transition"
              >
                Save
              </button>
            </div>
            {!hasVerifiedCustomDomain ? (
              <p className="text-xs text-theme-secondary mt-2">
                Google Tag Manager is only available when a custom domain is verified. GTM requires an isolated domain for security.
              </p>
            ) : (
              <p className="text-xs text-theme-secondary mt-2">
                Find your container ID in Google Tag Manager under Admin &gt; Container Settings. Leave empty to disable.
              </p>
            )}
          </div>
        </Form>
      </div>
    </div>
  );
}
