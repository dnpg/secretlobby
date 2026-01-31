import { useState } from "react";
import { Form, useLoaderData, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_layout.theme";
import { getSession, isAdmin } from "@secretlobby/auth";
import { createLogger, formatError } from "@secretlobby/logger";
import {
  getThemeSettings,
  updateThemeSettings,
  getAllowUserColorMode,
  updateAllowUserColorMode,
  type ThemeSettings,
} from "~/lib/content.server";

const logger = createLogger({ service: "console:theme" });
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
      return { success: allow ? "User color mode toggle enabled" : "User color mode toggle disabled" };
    }

    if (intent === "update-theme") {
      const themeUpdate: Partial<ThemeSettings> = {};

      // Simple color fields
      const colorFields = [
        "bgPrimary",
        "textPrimary",
        "primary",
        "primaryHover",
        "primaryText",
        "accent",
        "visualizerBg",
        "visualizerBar",
        "visualizerBarAlt",
        "visualizerGlow",
        "cardHeadingColor",
        "cardContentColor",
        "cardMutedColor",
        "cardBgColor",
        "cardBgGradientFrom",
        "cardBgGradientTo",
        "cardBorderColor",
        "cardBorderGradientFrom",
        "cardBorderGradientTo",
      ] as const;

      for (const field of colorFields) {
        const value = formData.get(field) as string;
        if (value) {
          themeUpdate[field] = value;
        }
      }

      // Card bg type
      const cardBgType = formData.get("cardBgType") as string;
      if (cardBgType === "solid" || cardBgType === "gradient") {
        themeUpdate.cardBgType = cardBgType;
      }

      // Card bg opacity
      const cardBgOpacity = formData.get("cardBgOpacity") as string;
      if (cardBgOpacity) {
        themeUpdate.cardBgOpacity = parseInt(cardBgOpacity, 10);
      }

      // Card bg gradient angle
      const cardBgGradientAngle = formData.get("cardBgGradientAngle") as string;
      if (cardBgGradientAngle) {
        themeUpdate.cardBgGradientAngle = parseInt(cardBgGradientAngle, 10);
      }

      // Card border show
      const cardBorderShow = formData.get("cardBorderShow") as string;
      themeUpdate.cardBorderShow = cardBorderShow === "true";

      // Card border type
      const cardBorderType = formData.get("cardBorderType") as string;
      if (cardBorderType === "solid" || cardBorderType === "gradient") {
        themeUpdate.cardBorderType = cardBorderType;
      }

      // Card border opacity
      const cardBorderOpacity = formData.get("cardBorderOpacity") as string;
      if (cardBorderOpacity) {
        themeUpdate.cardBorderOpacity = parseInt(cardBorderOpacity, 10);
      }

      // Card border gradient angle
      const cardBorderGradientAngle = formData.get("cardBorderGradientAngle") as string;
      if (cardBorderGradientAngle) {
        themeUpdate.cardBorderGradientAngle = parseInt(cardBorderGradientAngle, 10);
      }

      // Card border width
      const cardBorderWidth = formData.get("cardBorderWidth") as string;
      if (cardBorderWidth) {
        themeUpdate.cardBorderWidth = cardBorderWidth.trim();
      }

      // Border radius
      const cardBorderRadius = formData.get("cardBorderRadius") as string;
      if (cardBorderRadius) {
        themeUpdate.cardBorderRadius = parseInt(cardBorderRadius, 10);
      }
      const buttonBorderRadius = formData.get("buttonBorderRadius") as string;
      if (buttonBorderRadius) {
        themeUpdate.buttonBorderRadius = parseInt(buttonBorderRadius, 10);
      }
      const playButtonBorderRadius = formData.get("playButtonBorderRadius") as string;
      if (playButtonBorderRadius) {
        themeUpdate.playButtonBorderRadius = parseInt(playButtonBorderRadius, 10);
      }

      // Visualizer bg opacity
      const visualizerBgOpacity = formData.get("visualizerBgOpacity") as string;
      if (visualizerBgOpacity) {
        themeUpdate.visualizerBgOpacity = parseInt(visualizerBgOpacity, 10);
      }

      // Visualizer use card bg
      const visualizerUseCardBg = formData.get("visualizerUseCardBg") as string;
      themeUpdate.visualizerUseCardBg = visualizerUseCardBg === "true";

      // Visualizer border
      const visualizerBorderShow = formData.get("visualizerBorderShow") as string;
      themeUpdate.visualizerBorderShow = visualizerBorderShow === "true";

      const visualizerBorderColor = formData.get("visualizerBorderColor") as string;
      if (visualizerBorderColor) {
        themeUpdate.visualizerBorderColor = visualizerBorderColor;
      }

      const visualizerBorderRadius = formData.get("visualizerBorderRadius") as string;
      if (visualizerBorderRadius) {
        themeUpdate.visualizerBorderRadius = parseInt(visualizerBorderRadius, 10);
      }

      // Visualizer blend mode
      const visualizerBlendMode = formData.get("visualizerBlendMode") as string;
      if (visualizerBlendMode) {
        themeUpdate.visualizerBlendMode = visualizerBlendMode;
      }

      // Visualizer type
      const visualizerType = formData.get("visualizerType") as string;
      if (visualizerType === "equalizer" || visualizerType === "waveform") {
        themeUpdate.visualizerType = visualizerType;
      }

      // Sync legacy fields for backward compatibility
      if (themeUpdate.bgPrimary) {
        themeUpdate.bgSecondary = themeUpdate.cardBgColor || themeUpdate.bgPrimary;
        themeUpdate.bgTertiary = themeUpdate.cardBgColor || themeUpdate.bgPrimary;
        themeUpdate.border = themeUpdate.cardBorderColor || themeUpdate.bgPrimary;
        themeUpdate.secondary = themeUpdate.cardBgColor || themeUpdate.bgPrimary;
        themeUpdate.secondaryHover = themeUpdate.cardBorderColor || themeUpdate.bgPrimary;
        themeUpdate.secondaryText = themeUpdate.cardHeadingColor || "#ffffff";
      }
      // Also sync text fields
      if (themeUpdate.cardContentColor) {
        themeUpdate.textSecondary = themeUpdate.cardContentColor;
      }
      if (themeUpdate.cardMutedColor) {
        themeUpdate.textMuted = themeUpdate.cardMutedColor;
      }

      await updateThemeSettings(accountId, themeUpdate);
      return { success: "Theme updated successfully" };
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Theme update error");
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

export default function AdminTheme() {
  const { theme, allowUserColorMode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [cardBgType, setCardBgType] = useState<"solid" | "gradient">(theme?.cardBgType || "solid");
  const [cardBorderShow, setCardBorderShow] = useState(theme?.cardBorderShow ?? true);
  const [cardBorderType, setCardBorderType] = useState<"solid" | "gradient">(theme?.cardBorderType || "solid");
  const [cardBgOpacity, setCardBgOpacity] = useState(theme?.cardBgOpacity ?? 50);
  const [cardBgGradientAngle, setCardBgGradientAngle] = useState(theme?.cardBgGradientAngle ?? 135);
  const [cardBorderOpacity, setCardBorderOpacity] = useState(theme?.cardBorderOpacity ?? 100);
  const [cardBorderWidth, setCardBorderWidth] = useState(theme?.cardBorderWidth ?? "1px");
  const [cardBorderGradientAngle, setCardBorderGradientAngle] = useState(theme?.cardBorderGradientAngle ?? 135);
  const [cardBorderRadius, setCardBorderRadius] = useState(theme?.cardBorderRadius ?? 12);
  const [buttonBorderRadius, setButtonBorderRadius] = useState(theme?.buttonBorderRadius ?? 24);
  const [playButtonBorderRadius, setPlayButtonBorderRadius] = useState(theme?.playButtonBorderRadius ?? 50);
  const [visualizerBgOpacity, setVisualizerBgOpacity] = useState(theme?.visualizerBgOpacity ?? 0);
  const [visualizerBorderShow, setVisualizerBorderShow] = useState(theme?.visualizerBorderShow ?? false);
  const [visualizerBorderRadius, setVisualizerBorderRadius] = useState(theme?.visualizerBorderRadius ?? 8);
  const [visualizerType, setVisualizerType] = useState<"equalizer" | "waveform">(theme?.visualizerType || "equalizer");

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
          Allow users to switch between light and dark modes on the front page.
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
            {allowUserColorMode ? "Enabled" : "Disabled"}
          </span>
        </Form>
      </section>

      {/* Theme Settings */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-4">Color Customization</h2>
        <p className="text-sm text-theme-secondary mb-6">
          Customize the colors of your lobby. Changes apply to the player page.
        </p>

        <Form method="post" className="space-y-8">
          <input type="hidden" name="intent" value="update-theme" />

          {/* Background */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Background
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorInput
                label="Page Background"
                name="bgPrimary"
                value={theme.bgPrimary}
                description="Main page background color (used when no image is set)"
              />
            </div>
          </div>

          {/* Cards */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Cards
            </h3>
            <p className="text-xs text-theme-muted mb-4">
              Panels like the playlist, visualizer, and info sections.
            </p>

            {/* Card Text */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <ColorInput
                label="Heading"
                name="cardHeadingColor"
                value={theme.cardHeadingColor}
                description="Titles and headings"
              />
              <ColorInput
                label="Content"
                name="cardContentColor"
                value={theme.cardContentColor}
                description="Body text and labels"
              />
              <ColorInput
                label="Muted"
                name="cardMutedColor"
                value={theme.cardMutedColor}
                description="Timestamps and hints"
              />
            </div>

            {/* Card Background */}
            <div className="mb-6 p-4 bg-theme-tertiary rounded-lg border border-theme">
              <h4 className="text-sm font-medium mb-3">Card Background</h4>
              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cardBgType"
                    value="solid"
                    checked={cardBgType === "solid"}
                    onChange={() => setCardBgType("solid")}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="text-sm">Solid</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cardBgType"
                    value="gradient"
                    checked={cardBgType === "gradient"}
                    onChange={() => setCardBgType("gradient")}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="text-sm">Gradient</span>
                </label>
              </div>

              {cardBgType === "solid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ColorInput label="Color" name="cardBgColor" value={theme.cardBgColor} />
                  <div>
                    <label className="block text-sm font-medium mb-1">Opacity ({cardBgOpacity}%)</label>
                    <input
                      type="range"
                      name="cardBgOpacity"
                      min="0"
                      max="100"
                      value={cardBgOpacity}
                      onChange={(e) => setCardBgOpacity(Number(e.target.value))}
                      className="w-full accent-[var(--color-accent)]"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <ColorInput label="From" name="cardBgGradientFrom" value={theme.cardBgGradientFrom} />
                    <ColorInput label="To" name="cardBgGradientTo" value={theme.cardBgGradientTo} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Opacity ({cardBgOpacity}%)</label>
                      <input
                        type="range"
                        name="cardBgOpacity"
                        min="0"
                        max="100"
                        value={cardBgOpacity}
                        onChange={(e) => setCardBgOpacity(Number(e.target.value))}
                        className="w-full accent-[var(--color-accent)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Angle ({cardBgGradientAngle}°)</label>
                      <input
                        type="range"
                        name="cardBgGradientAngle"
                        min="0"
                        max="360"
                        value={cardBgGradientAngle}
                        onChange={(e) => setCardBgGradientAngle(Number(e.target.value))}
                        className="w-full accent-[var(--color-accent)]"
                      />
                    </div>
                  </div>
                </>
              )}
              {/* Hidden fields to preserve values when type is toggled */}
              {cardBgType === "solid" && (
                <>
                  <input type="hidden" name="cardBgGradientFrom" value={theme.cardBgGradientFrom} />
                  <input type="hidden" name="cardBgGradientTo" value={theme.cardBgGradientTo} />
                  <input type="hidden" name="cardBgGradientAngle" value={theme.cardBgGradientAngle} />
                </>
              )}
              {cardBgType === "gradient" && (
                <input type="hidden" name="cardBgColor" value={theme.cardBgColor} />
              )}
            </div>

            {/* Card Border */}
            <div className="p-4 bg-theme-tertiary rounded-lg border border-theme">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">Card Border</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="cardBorderShow"
                    value="true"
                    checked={cardBorderShow}
                    onChange={(e) => setCardBorderShow(e.target.checked)}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="text-sm">Show border</span>
                </label>
              </div>

              {cardBorderShow && (
                <>
                  <div className="flex gap-4 mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="cardBorderType"
                        value="solid"
                        checked={cardBorderType === "solid"}
                        onChange={() => setCardBorderType("solid")}
                        className="accent-[var(--color-accent)]"
                      />
                      <span className="text-sm">Solid</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="cardBorderType"
                        value="gradient"
                        checked={cardBorderType === "gradient"}
                        onChange={() => setCardBorderType("gradient")}
                        className="accent-[var(--color-accent)]"
                      />
                      <span className="text-sm">Gradient</span>
                    </label>
                  </div>

                  {cardBorderType === "solid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ColorInput label="Color" name="cardBorderColor" value={theme.cardBorderColor} />
                      <div>
                        <label className="block text-sm font-medium mb-1">Opacity ({cardBorderOpacity}%)</label>
                        <input
                          type="range"
                          name="cardBorderOpacity"
                          min="0"
                          max="100"
                          value={cardBorderOpacity}
                          onChange={(e) => setCardBorderOpacity(Number(e.target.value))}
                          className="w-full accent-[var(--color-accent)]"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <ColorInput label="From" name="cardBorderGradientFrom" value={theme.cardBorderGradientFrom} />
                        <ColorInput label="To" name="cardBorderGradientTo" value={theme.cardBorderGradientTo} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Opacity ({cardBorderOpacity}%)</label>
                          <input
                            type="range"
                            name="cardBorderOpacity"
                            min="0"
                            max="100"
                            value={cardBorderOpacity}
                            onChange={(e) => setCardBorderOpacity(Number(e.target.value))}
                            className="w-full accent-[var(--color-accent)]"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Angle ({cardBorderGradientAngle}°)</label>
                          <input
                            type="range"
                            name="cardBorderGradientAngle"
                            min="0"
                            max="360"
                            value={cardBorderGradientAngle}
                            onChange={(e) => setCardBorderGradientAngle(Number(e.target.value))}
                            className="w-full accent-[var(--color-accent)]"
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {/* Border Width */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-1">Width</label>
                    <input
                      type="text"
                      name="cardBorderWidth"
                      value={cardBorderWidth}
                      onChange={(e) => setCardBorderWidth(e.target.value)}
                      placeholder="1px"
                      className="w-full px-3 py-1.5 bg-theme-secondary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
                    />
                    <p className="text-xs text-theme-secondary mt-1">e.g. 1px, 2px, 0.5rem, 1%</p>
                  </div>

                  {/* Hidden fields to preserve values when type is toggled */}
                  {cardBorderType === "solid" && (
                    <>
                      <input type="hidden" name="cardBorderGradientFrom" value={theme.cardBorderGradientFrom} />
                      <input type="hidden" name="cardBorderGradientTo" value={theme.cardBorderGradientTo} />
                      <input type="hidden" name="cardBorderGradientAngle" value={theme.cardBorderGradientAngle} />
                    </>
                  )}
                  {cardBorderType === "gradient" && (
                    <input type="hidden" name="cardBorderColor" value={theme.cardBorderColor} />
                  )}
                </>
              )}
            </div>

            {/* Border Radius */}
            <div className="mt-6 p-4 bg-theme-tertiary rounded-lg border border-theme">
              <h4 className="text-sm font-medium mb-4">Border Radius</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Cards ({cardBorderRadius}px)</label>
                  <input
                    type="range"
                    name="cardBorderRadius"
                    min="0"
                    max="24"
                    value={cardBorderRadius}
                    onChange={(e) => setCardBorderRadius(Number(e.target.value))}
                    className="w-full accent-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Buttons ({buttonBorderRadius}px)</label>
                  <input
                    type="range"
                    name="buttonBorderRadius"
                    min="0"
                    max="50"
                    value={buttonBorderRadius}
                    onChange={(e) => setButtonBorderRadius(Number(e.target.value))}
                    className="w-full accent-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Play Button ({playButtonBorderRadius}%)</label>
                  <input
                    type="range"
                    name="playButtonBorderRadius"
                    min="0"
                    max="50"
                    value={playButtonBorderRadius}
                    onChange={(e) => setPlayButtonBorderRadius(Number(e.target.value))}
                    className="w-full accent-[var(--color-accent)]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Player Controls */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Player Controls
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorInput label="Play Button" name="primary" value={theme.primary} description="Play button background" />
              <ColorInput label="Button Hover" name="primaryHover" value={theme.primaryHover} />
              <ColorInput label="Button Text" name="primaryText" value={theme.primaryText} description="Icon color on play button" />
            </div>
          </div>

          {/* Accent */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Accent & Progress
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorInput label="Accent" name="accent" value={theme.accent} description="Progress bar and highlights" />
              <ColorInput label="Primary Text" name="textPrimary" value={theme.textPrimary} description="Main text color" />
            </div>
          </div>

          {/* Visualizer */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-theme-secondary uppercase tracking-wide">
              Audio Visualizer
            </h3>

            <div className="mb-6 p-4 bg-theme-tertiary rounded-lg border border-theme">
              <h4 className="text-sm font-medium mb-3">Visualizer Type</h4>
              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="visualizerType"
                    value="equalizer"
                    checked={visualizerType === "equalizer"}
                    onChange={() => setVisualizerType("equalizer")}
                    className="accent-[var(--color-accent)] mt-1"
                  />
                  <div>
                    <span className="text-sm font-medium">Equalizer</span>
                    <p className="text-xs text-theme-muted">Real-time frequency bars powered by Web Audio API</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="visualizerType"
                    value="waveform"
                    checked={visualizerType === "waveform"}
                    onChange={() => setVisualizerType("waveform")}
                    className="accent-[var(--color-accent)] mt-1"
                  />
                  <div>
                    <span className="text-sm font-medium">Waveform Progress</span>
                    <p className="text-xs text-theme-muted">Pre-computed waveform bars that fill as playback progresses. Best compatibility with Safari/iOS (no Web Audio needed)</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="visualizerUseCardBg"
                  value="true"
                  defaultChecked={theme.visualizerUseCardBg}
                  className="accent-[var(--color-accent)]"
                />
                <span className="text-sm">Use card styling for wrapper</span>
              </label>
              <p className="text-xs text-theme-muted mt-1">Apply card background and border to the visualizer container</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <ColorInput label="Canvas Background" name="visualizerBg" value={theme.visualizerBg} description="Background color of the equalizer canvas" />
              <div>
                <label className="block text-sm font-medium mb-1">Background Opacity ({visualizerBgOpacity}%)</label>
                <p className="text-xs text-theme-muted mb-2">Set to 0 for transparent</p>
                <input
                  type="range"
                  name="visualizerBgOpacity"
                  min="0"
                  max="100"
                  value={visualizerBgOpacity}
                  onChange={(e) => setVisualizerBgOpacity(Number(e.target.value))}
                  className="w-full accent-[var(--color-accent)]"
                />
              </div>
            </div>

            <h4 className="text-sm font-medium mb-3">Bar Colors</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <ColorInput label="Primary" name="visualizerBar" value={theme.visualizerBar} description="Main bar color" />
              <ColorInput label="Secondary" name="visualizerBarAlt" value={theme.visualizerBarAlt} description="Gradient mid-point" />
              <ColorInput label="Glow" name="visualizerGlow" value={theme.visualizerGlow} description="Peak highlights" />
            </div>

            {/* Canvas Border & Radius */}
            <div className="p-4 bg-theme-tertiary rounded-lg border border-theme mb-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">Canvas Border</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="visualizerBorderShow"
                    value="true"
                    checked={visualizerBorderShow}
                    onChange={(e) => setVisualizerBorderShow(e.target.checked)}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="text-sm">Show border</span>
                </label>
              </div>

              {visualizerBorderShow && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <ColorInput label="Border Color" name="visualizerBorderColor" value={theme.visualizerBorderColor} />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Border Radius ({visualizerBorderRadius}px)</label>
                  <input
                    type="range"
                    name="visualizerBorderRadius"
                    min="0"
                    max="24"
                    value={visualizerBorderRadius}
                    onChange={(e) => setVisualizerBorderRadius(Number(e.target.value))}
                    className="w-full accent-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Blend Mode</label>
                  <select
                    name="visualizerBlendMode"
                    defaultValue={theme.visualizerBlendMode}
                    className="w-full px-3 py-2 bg-theme-secondary rounded-lg border border-theme text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    <option value="normal">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="darken">Darken</option>
                    <option value="lighten">Lighten</option>
                    <option value="color-dodge">Color Dodge</option>
                    <option value="color-burn">Color Burn</option>
                    <option value="hard-light">Hard Light</option>
                    <option value="soft-light">Soft Light</option>
                    <option value="difference">Difference</option>
                    <option value="exclusion">Exclusion</option>
                    <option value="hue">Hue</option>
                    <option value="saturation">Saturation</option>
                    <option value="color">Color</option>
                    <option value="luminosity">Luminosity</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
            >
              Save Theme
            </button>
          </div>
        </Form>
      </section>
    </div>
  );
}
