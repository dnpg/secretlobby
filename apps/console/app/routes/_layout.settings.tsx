import { useEffect } from "react";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.settings";
import { toast } from "sonner";
import { createLogger, formatError } from "@secretlobby/logger";

const logger = createLogger({ service: "console:settings" });

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
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
  const baseDomain = process.env.CORE_DOMAIN || "secretlobby.io";

  const gaSettings = await getGoogleAnalyticsSettings(accountId);

  const hasVerifiedCustomDomain = account.domains.some(
    (d) => d.status === "VERIFIED"
  );

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
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getAccountBySlug } = await import("~/models/queries/account.server");
  const { getDomainByDomain } = await import("~/models/queries/domain.server");
  const { updateAccountSlug } = await import("~/models/mutations/account.server");
  const { createDomain, deleteDomain } = await import("~/models/mutations/domain.server");
  const { updateGoogleAnalyticsSettings } = await import("~/lib/content.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

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
  const { account, domains, lobbies, baseDomain, gaSettings, hasVerifiedCustomDomain } = useLoaderData<typeof loader>();
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

      {/* Custom Domains */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Custom Domains</h3>
        <p className="text-sm text-theme-secondary mb-4">
          Connect your own domain to your lobby (e.g., music.yourband.com)
        </p>

        {/* Add Domain Form */}
        <Form method="post" className="mb-6">
          <input type="hidden" name="intent" value="add_domain" />
          <div className="flex gap-2">
            <input
              type="text"
              name="domain"
              placeholder="music.yourband.com"
              pattern="^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$"
              required
              className="flex-1 px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary placeholder:text-theme-secondary/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-2 btn-primary rounded-lg transition"
            >
              Add Domain
            </button>
          </div>
        </Form>

        {/* Domains List */}
        {domains.length > 0 ? (
          <div className="space-y-3">
            {domains.map((domain) => (
              <div
                key={domain.id}
                className="flex items-center justify-between p-4 bg-theme-tertiary border border-theme rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium">{domain.domain}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        domain.status === "VERIFIED"
                          ? "bg-green-500/20 text-green-400"
                          : domain.status === "FAILED"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {domain.status}
                    </span>
                    {domain.status === "PENDING" && (
                      <span className="text-xs text-theme-secondary">
                        Verification token: {domain.verificationToken}
                      </span>
                    )}
                  </div>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete_domain" />
                  <input type="hidden" name="domainId" value={domain.id} />
                  <button
                    type="submit"
                    className="px-3 py-1 text-sm text-red-400 hover:text-red-300 transition"
                  >
                    Remove
                  </button>
                </Form>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-theme-secondary">
            No custom domains added yet
          </div>
        )}

        {/* DNS Instructions */}
        {domains.some((d) => d.status === "PENDING") && (
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <h4 className="font-semibold text-blue-400 mb-2">DNS Setup Instructions</h4>
            <ol className="text-sm text-theme-secondary space-y-2 list-decimal list-inside">
              <li>Add a CNAME record pointing to: <code className="bg-theme-tertiary px-2 py-0.5 rounded">lobby.{baseDomain}</code></li>
              <li>Add a TXT record with the verification token shown above</li>
              <li>Wait up to 24 hours for DNS propagation</li>
              <li>We'll automatically verify your domain once DNS is configured</li>
            </ol>
          </div>
        )}
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
