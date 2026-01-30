import { useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/_layout.settings";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Settings - Super Admin" }];
}

// Check if payment gateway environment variables are configured
function getGatewayStatus() {
  return {
    stripe: {
      configured: Boolean(
        process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_PUBLISHABLE_KEY &&
        process.env.STRIPE_WEBHOOK_SECRET
      ),
      hasSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      hasPublishableKey: Boolean(process.env.STRIPE_PUBLISHABLE_KEY),
      hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      hasPrices: Boolean(
        process.env.STRIPE_PRICE_STARTER_MONTHLY &&
        process.env.STRIPE_PRICE_PRO_MONTHLY
      ),
    },
    paypal: {
      configured: Boolean(
        process.env.PAYPAL_CLIENT_ID &&
        process.env.PAYPAL_CLIENT_SECRET
      ),
      hasClientId: Boolean(process.env.PAYPAL_CLIENT_ID),
      hasClientSecret: Boolean(process.env.PAYPAL_CLIENT_SECRET),
    },
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  // Get or create system settings
  let settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
  });

  if (!settings) {
    settings = await prisma.systemSettings.create({
      data: { id: "default" },
    });
  }

  const gatewayStatus = getGatewayStatus();

  return {
    settings: {
      enabledGateways: settings.enabledGateways,
      defaultGateway: settings.defaultGateway,
      platformName: settings.platformName,
      supportEmail: settings.supportEmail,
      allowSignups: settings.allowSignups,
      maintenanceMode: settings.maintenanceMode,
    },
    gatewayStatus,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateGateways") {
    const enabledGateways = formData.getAll("enabledGateways") as string[];
    const defaultGateway = formData.get("defaultGateway") as string;

    await prisma.systemSettings.update({
      where: { id: "default" },
      data: {
        enabledGateways,
        defaultGateway: enabledGateways.includes(defaultGateway)
          ? defaultGateway
          : enabledGateways[0] || "stripe",
      },
    });

    return { success: true, message: "Payment gateways updated" };
  }

  if (intent === "updatePlatform") {
    const platformName = formData.get("platformName") as string;
    const supportEmail = formData.get("supportEmail") as string;
    const allowSignups = formData.get("allowSignups") === "true";
    const maintenanceMode = formData.get("maintenanceMode") === "true";

    await prisma.systemSettings.update({
      where: { id: "default" },
      data: {
        platformName,
        supportEmail,
        allowSignups,
        maintenanceMode,
      },
    });

    return { success: true, message: "Platform settings updated" };
  }

  return { success: false, message: "Unknown action" };
}

export default function SettingsPage() {
  const { settings, gatewayStatus } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const isSubmitting = fetcher.state === "submitting";

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-8">Platform Settings</h2>

      <div className="space-y-8">
        {/* Payment Gateways */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold mb-4">Payment Gateways</h3>
          <p className="text-gray-400 text-sm mb-6">
            Configure which payment gateways are available for subscription billing.
            Gateway credentials must be set in environment variables.
          </p>

          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="updateGateways" />

            <div className="space-y-4">
              {/* Stripe */}
              <div className="p-4 bg-gray-900 rounded-lg border border-gray-700">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      name="enabledGateways"
                      value="stripe"
                      defaultChecked={settings.enabledGateways.includes("stripe")}
                      disabled={!gatewayStatus.stripe.configured}
                      className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Stripe</span>
                        {gatewayStatus.stripe.configured ? (
                          <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                            Configured
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                            Not Configured
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        Accept credit cards, Apple Pay, and Google Pay
                      </p>
                      <div className="mt-2 text-xs space-y-1">
                        <div className={gatewayStatus.stripe.hasSecretKey ? "text-green-400" : "text-gray-500"}>
                          {gatewayStatus.stripe.hasSecretKey ? "✓" : "○"} STRIPE_SECRET_KEY
                        </div>
                        <div className={gatewayStatus.stripe.hasPublishableKey ? "text-green-400" : "text-gray-500"}>
                          {gatewayStatus.stripe.hasPublishableKey ? "✓" : "○"} STRIPE_PUBLISHABLE_KEY
                        </div>
                        <div className={gatewayStatus.stripe.hasWebhookSecret ? "text-green-400" : "text-gray-500"}>
                          {gatewayStatus.stripe.hasWebhookSecret ? "✓" : "○"} STRIPE_WEBHOOK_SECRET
                        </div>
                        <div className={gatewayStatus.stripe.hasPrices ? "text-green-400" : "text-gray-500"}>
                          {gatewayStatus.stripe.hasPrices ? "✓" : "○"} Price IDs configured
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="defaultGateway"
                        value="stripe"
                        defaultChecked={settings.defaultGateway === "stripe"}
                        disabled={!gatewayStatus.stripe.configured}
                        className="h-4 w-4 border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                      />
                      <span className="text-gray-400">Default</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* PayPal */}
              <div className="p-4 bg-gray-900 rounded-lg border border-gray-700">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      name="enabledGateways"
                      value="paypal"
                      defaultChecked={settings.enabledGateways.includes("paypal")}
                      disabled={!gatewayStatus.paypal.configured}
                      className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">PayPal</span>
                        {gatewayStatus.paypal.configured ? (
                          <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                            Configured
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                            Not Configured
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        Accept PayPal and Venmo payments
                      </p>
                      <div className="mt-2 text-xs space-y-1">
                        <div className={gatewayStatus.paypal.hasClientId ? "text-green-400" : "text-gray-500"}>
                          {gatewayStatus.paypal.hasClientId ? "✓" : "○"} PAYPAL_CLIENT_ID
                        </div>
                        <div className={gatewayStatus.paypal.hasClientSecret ? "text-green-400" : "text-gray-500"}>
                          {gatewayStatus.paypal.hasClientSecret ? "✓" : "○"} PAYPAL_CLIENT_SECRET
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="defaultGateway"
                        value="paypal"
                        defaultChecked={settings.defaultGateway === "paypal"}
                        disabled={!gatewayStatus.paypal.configured}
                        className="h-4 w-4 border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                      />
                      <span className="text-gray-400">Default</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save Gateway Settings"}
              </button>
            </div>
          </fetcher.Form>
        </div>

        {/* Platform Settings */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold mb-4">Platform Settings</h3>

          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="updatePlatform" />

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Platform Name
                </label>
                <input
                  type="text"
                  name="platformName"
                  defaultValue={settings.platformName}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Support Email
                </label>
                <input
                  type="email"
                  name="supportEmail"
                  defaultValue={settings.supportEmail}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="allowSignups"
                    value="true"
                    defaultChecked={settings.allowSignups}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                  />
                  <span className="text-sm">Allow new signups</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="maintenanceMode"
                    value="true"
                    defaultChecked={settings.maintenanceMode}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                  />
                  <span className="text-sm">Maintenance mode</span>
                </label>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save Platform Settings"}
              </button>
            </div>
          </fetcher.Form>
        </div>

        {/* Environment Variables Reference */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold mb-4">Environment Variables</h3>
          <p className="text-gray-400 text-sm mb-4">
            Payment gateway credentials must be configured in your environment variables.
            These cannot be set through this interface for security reasons.
          </p>

          <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
            <pre className="text-gray-300">{`# Stripe Configuration
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (from Stripe Dashboard)
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_YEARLY=price_...

# PayPal Configuration (optional)
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
