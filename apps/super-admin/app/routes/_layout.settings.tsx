import { useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/_layout.settings";
import { prisma } from "@secretlobby/db";
import { getPublicUrl } from "@secretlobby/storage";
import { useState, useRef } from "react";

interface FaviconConfig {
  sourceKey?: string;
  generatedAt?: string;
  manifestName: string;
  manifestShortName: string;
  themeColor: string;
  bgColor: string;
  display: string;
}

const DEFAULT_CONFIG: FaviconConfig = {
  manifestName: "SecretLobby",
  manifestShortName: "SL",
  themeColor: "#111827",
  bgColor: "#111827",
  display: "standalone",
};

function getConfig(raw: unknown): FaviconConfig {
  const config = (raw && typeof raw === "object" ? raw : {}) as Partial<FaviconConfig>;
  return { ...DEFAULT_CONFIG, ...config };
}

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

export async function loader({}: Route.LoaderArgs) {
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

  // Parse favicon config from JSON
  const faviconConfig = getConfig(settings.faviconConfig);

  // Get favicon URLs if configured
  let faviconSourceUrl: string | null = null;
  let faviconPreviewUrl: string | null = null;
  if (faviconConfig.sourceKey) {
    faviconSourceUrl = getPublicUrl(faviconConfig.sourceKey);
  }
  if (faviconConfig.generatedAt) {
    faviconPreviewUrl = getPublicUrl("system/favicons/favicon-32x32.png");
  }

  return {
    settings: {
      enabledGateways: settings.enabledGateways,
      defaultGateway: settings.defaultGateway,
      platformName: settings.platformName,
      supportEmail: settings.supportEmail,
      allowSignups: settings.allowSignups,
      maintenanceMode: settings.maintenanceMode,
    },
    favicon: {
      sourceKey: faviconConfig.sourceKey || null,
      sourceUrl: faviconSourceUrl,
      previewUrl: faviconPreviewUrl,
      generatedAt: faviconConfig.generatedAt || null,
      manifestName: faviconConfig.manifestName,
      manifestShortName: faviconConfig.manifestShortName,
      themeColor: faviconConfig.themeColor,
      bgColor: faviconConfig.bgColor,
      display: faviconConfig.display,
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

function FaviconSection({ favicon }: { favicon: {
  sourceKey: string | null;
  sourceUrl: string | null;
  previewUrl: string | null;
  generatedAt: string | null;
  manifestName: string;
  manifestShortName: string;
  themeColor: string;
  bgColor: string;
  display: string;
} }) {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingManifest, setSavingManifest] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(favicon.sourceUrl);
  const [previewUrl] = useState(favicon.previewUrl);
  const [generatedAt, setGeneratedAt] = useState(favicon.generatedAt);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [manifestName, setManifestName] = useState(favicon.manifestName);
  const [manifestShortName, setManifestShortName] = useState(favicon.manifestShortName);
  const [themeColor, setThemeColor] = useState(favicon.themeColor);
  const [bgColor, setBgColor] = useState(favicon.bgColor);
  const [display, setDisplay] = useState(favicon.display);

  const handleFileUpload = async (file: File) => {
    setError(null);
    setSuccess(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/favicon/generate", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Upload failed");
        return;
      }

      setSourceUrl(URL.createObjectURL(file));
      setSuccess("Source image uploaded successfully");

      if (!result.isSquare) {
        setError("Warning: Image is not square. It will be cropped to fit.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setError(`Failed to upload image: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleGenerate = async () => {
    setError(null);
    setSuccess(null);
    setGenerating(true);

    try {
      const response = await fetch("/api/favicon/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "generate" }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Generation failed");
        return;
      }

      setGeneratedAt(result.generatedAt);
      // Reload page to get updated preview URL from R2
      window.location.reload();
      setSuccess("Favicons generated successfully!");
    } catch {
      setError("Failed to generate favicons");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveManifest = async () => {
    setError(null);
    setSuccess(null);
    setSavingManifest(true);

    try {
      const response = await fetch("/api/favicon/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "updateManifest",
          manifestName,
          manifestShortName,
          themeColor,
          bgColor,
          display,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Save failed");
        return;
      }

      setSuccess("Manifest settings saved");
    } catch {
      setError("Failed to save manifest settings");
    } finally {
      setSavingManifest(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
      <h3 className="text-lg font-semibold mb-4">Favicon & Web Manifest</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Source Image Upload */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Source Image
        </label>
        <p className="text-gray-500 text-sm mb-3">
          Upload a square PNG, JPG, or SVG (512x512+ recommended)
        </p>

        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-red-500 bg-red-500/10"
              : "border-gray-600 hover:border-gray-500"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          {sourceUrl ? (
            <div className="flex items-center justify-center gap-4">
              <img
                src={sourceUrl}
                alt="Favicon source"
                className="w-24 h-24 object-cover rounded-lg border border-gray-600"
              />
              <div className="text-left">
                <p className="text-gray-300">Source image uploaded</p>
                <p className="text-gray-500 text-sm">Click or drop to replace</p>
              </div>
            </div>
          ) : (
            <div>
              <svg
                className="mx-auto h-12 w-12 text-gray-500"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="mt-2 text-gray-400">
                Drop image here or click to upload
              </p>
            </div>
          )}

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 rounded-lg">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
            </div>
          )}
        </div>
      </div>

      {/* Generate Button */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={handleGenerate}
          disabled={!sourceUrl || generating}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? "Generating..." : "Generate All Favicons"}
        </button>

        {generatedAt && (
          <span className="text-gray-500 text-sm" suppressHydrationWarning>
            Last generated: {new Date(generatedAt).toLocaleString()}
          </span>
        )}

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Generated favicon preview"
            className="w-8 h-8 rounded border border-gray-600"
          />
        )}
      </div>

      <hr className="border-gray-700 my-6" />

      {/* Web Manifest Settings */}
      <h4 className="text-md font-semibold mb-4">Web Manifest Settings</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            App Name
          </label>
          <input
            type="text"
            value={manifestName}
            onChange={(e) => setManifestName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Short Name
          </label>
          <input
            type="text"
            value={manifestShortName}
            onChange={(e) => setManifestShortName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Theme Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              className="w-12 h-10 rounded border border-gray-700 bg-gray-900 cursor-pointer"
            />
            <input
              type="text"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Background Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-12 h-10 rounded border border-gray-700 bg-gray-900 cursor-pointer"
            />
            <input
              type="text"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
            />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-400 mb-1">
          Display Mode
        </label>
        <select
          value={display}
          onChange={(e) => setDisplay(e.target.value)}
          className="w-full md:w-64 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value="standalone">Standalone (app-like)</option>
          <option value="fullscreen">Fullscreen</option>
          <option value="minimal-ui">Minimal UI</option>
          <option value="browser">Browser</option>
        </select>
      </div>

      <button
        onClick={handleSaveManifest}
        disabled={savingManifest}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50"
      >
        {savingManifest ? "Saving..." : "Save Manifest Settings"}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, favicon, gatewayStatus } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const isSubmitting = fetcher.state === "submitting";

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-8">Platform Settings</h2>

      <div className="space-y-8">
        {/* Favicon & Web Manifest */}
        <FaviconSection favicon={favicon} />

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
