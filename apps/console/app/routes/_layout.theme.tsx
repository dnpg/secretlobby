import { Form, useLoaderData, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_layout.theme";
import { getSession, isAdmin } from "@secretlobby/auth";
import {
  getThemeSettings,
  updateThemeSettings,
  getDefaultThemeForMode,
  getAllowUserColorMode,
  updateAllowUserColorMode,
  type ThemeSettings,
  type ColorMode,
} from "~/lib/content.server";
import { cn } from "@secretlobby/ui";

export function meta() {
  return [{ title: "Theme Settings - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (!isAdmin(session) || !session.currentAccountId) {
    return { theme: null, allowUserColorMode: true };
  }
  const theme = await getThemeSettings(session.currentAccountId);
  const allowUserColorMode = await getAllowUserColorMode(session.currentAccountId);
  return { theme, allowUserColorMode };
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await getSession(request);
  if (!isAdmin(session) || !session.currentAccountId) {
    return { error: "Unauthorized" };
  }

  const accountId = session.currentAccountId;
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "toggle-user-color-mode") {
      const allow = formData.get("allow") === "true";
      await updateAllowUserColorMode(accountId, allow);
      return { success: allow ? "User color mode toggle enabled" : "User color mode toggle disabled (light mode only)" };
    }

    if (intent === "change-color-mode") {
      const colorMode = formData.get("colorMode") as ColorMode;
      if (colorMode && ["dark", "light", "system"].includes(colorMode)) {
        if (colorMode !== "system") {
          const defaultColors = getDefaultThemeForMode(colorMode);
          await updateThemeSettings(accountId, { ...defaultColors, colorMode });
        } else {
          await updateThemeSettings(accountId, { colorMode });
        }
        return { success: `Color mode changed to ${colorMode}` };
      }
    }

    if (intent === "update-theme") {
      const themeUpdate: Partial<Omit<ThemeSettings, "colorMode">> = {};
      const colorFields = [
        "bgPrimary",
        "bgSecondary",
        "bgTertiary",
        "textPrimary",
        "textSecondary",
        "textMuted",
        "border",
        "primary",
        "primaryHover",
        "primaryText",
        "secondary",
        "secondaryHover",
        "secondaryText",
        "accent",
        "visualizerBar",
        "visualizerBarAlt",
        "visualizerGlow",
      ] as const;

      for (const field of colorFields) {
        const value = formData.get(field) as string;
        if (value) {
          themeUpdate[field] = value;
        }
      }

      await updateThemeSettings(accountId, themeUpdate);
      return { success: "Theme updated successfully" };
    }
  } catch (error){
    console.error(error);
    return { error: "Operation failed", data: error };
  }

  return null;
}

interface ColorInputProps {
  label: string;
  name: Exclude<keyof ThemeSettings, "colorMode">;
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

export default function AdminTheme() {
  const { theme, allowUserColorMode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (!theme) return null;

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

      {/* Allow User Color Mode Toggle */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">User Color Mode Toggle</h2>
        <p className="text-sm text-theme-secondary mb-4">
          Allow users to switch between light and dark modes on the front page. When disabled, the site will always use light mode.
        </p>
        <Form method="post" className="flex items-center gap-4">
          <input type="hidden" name="intent" value="toggle-user-color-mode" />
          <input type="hidden" name="allow" value={allowUserColorMode ? "false" : "true"} />
          <button
            type="submit"
            disabled={isSubmitting}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer border ${
              allowUserColorMode ? "bg-green-500 border-green-500" : "bg-theme-tertiary border-theme"
            } disabled:opacity-50`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                allowUserColorMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm text-theme-primary">
            {allowUserColorMode ? "Enabled" : "Disabled (Light mode only)"}
          </span>
        </Form>
      </section>

      {/* Color Mode */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Default Color Mode</h2>
        <p className="text-sm text-theme-secondary mb-4">
          Set the default color mode for new visitors. {allowUserColorMode ? "Users can override this with the toggle in the player header." : "This setting is ignored when user toggle is disabled."}
        </p>
        <Form method="post" className="flex flex-wrap gap-3">
          <input type="hidden" name="intent" value="change-color-mode" />
          {(["dark", "light", "system"] as const).map((mode) => (
            <button
              key={mode}
              type="submit"
              name="colorMode"
              value={mode}
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-lg transition capitalize cursor-pointer ${
                theme.colorMode === mode
                  ? "btn-primary"
                  : "btn-secondary"
              } disabled:opacity-50`}
            >
              {mode === "system" ? "System Default" : `${mode} Mode`}
            </button>
          ))}
        </Form>
        <p className="text-xs text-theme-muted mt-3">
          Current: <span className="font-medium">{theme.colorMode || "dark"}</span>
          {theme.colorMode === "system" && " (follows user's browser/OS setting)"}
        </p>
      </section>

      {/* Theme Settings */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Color Customization</h2>
        <p className="text-sm text-theme-secondary mb-6">
          Fine-tune the colors of your site. Changes apply site-wide.
        </p>

        <Form method="post" className="space-y-6">
          <input type="hidden" name="intent" value="update-theme" />

          {/* Background Colors */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Background Colors
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorInput
                label="Primary Background"
                name="bgPrimary"
                value={theme.bgPrimary}
                description="Main page background"
              />
              <ColorInput
                label="Secondary Background"
                name="bgSecondary"
                value={theme.bgSecondary}
                description="Cards and sections"
              />
              <ColorInput
                label="Tertiary Background"
                name="bgTertiary"
                value={theme.bgTertiary}
                description="Inputs and nested elements"
              />
            </div>
          </div>

          {/* Text Colors */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Text Colors
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorInput
                label="Primary Text"
                name="textPrimary"
                value={theme.textPrimary}
                description="Main text color"
              />
              <ColorInput
                label="Secondary Text"
                name="textSecondary"
                value={theme.textSecondary}
                description="Subtitles and labels"
              />
              <ColorInput
                label="Muted Text"
                name="textMuted"
                value={theme.textMuted}
                description="Placeholders and hints"
              />
            </div>
          </div>

          {/* Primary Button */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Primary Button
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorInput label="Background" name="primary" value={theme.primary} />
              <ColorInput label="Hover" name="primaryHover" value={theme.primaryHover} />
              <ColorInput label="Text" name="primaryText" value={theme.primaryText} />
            </div>
          </div>

          {/* Secondary Button */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Secondary Button
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorInput label="Background" name="secondary" value={theme.secondary} />
              <ColorInput label="Hover" name="secondaryHover" value={theme.secondaryHover} />
              <ColorInput label="Text" name="secondaryText" value={theme.secondaryText} />
            </div>
          </div>

          {/* Visualizer */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Audio Visualizer
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorInput
                label="Bar Color"
                name="visualizerBar"
                value={theme.visualizerBar}
                description="Primary bar color"
              />
              <ColorInput
                label="Bar Alt Color"
                name="visualizerBarAlt"
                value={theme.visualizerBarAlt}
                description="Secondary bar color"
              />
              <ColorInput
                label="Glow Color"
                name="visualizerGlow"
                value={theme.visualizerGlow}
                description="Glow effect color"
              />
            </div>
          </div>

          {/* Other */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Other
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorInput
                label="Border"
                name="border"
                value={theme.border}
                description="Border color"
              />
              <ColorInput
                label="Accent"
                name="accent"
                value={theme.accent}
                description="Focus rings and highlights"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50",{"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
            >
              Save Theme
            </button>
          </div>
        </Form>
      </section>
    </div>
  );
}
