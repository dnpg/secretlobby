import { useState, useEffect } from "react";
import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.lobby.theme";
import type { ThemeSettings } from "~/lib/content.server";
import { cn } from "@secretlobby/ui";
import { toast } from "sonner";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Theme - ${data?.lobbyName || "Lobby"} - Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { getLobbyThemeSettings } = await import("~/lib/content.server");
  const { getLobbyById } = await import("~/models/queries/lobby.server");

  const { session } = await getSession(request);
  if (!isAdmin(session) || !session.currentAccountId) {
    throw redirect("/login");
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    throw redirect("/lobbies");
  }

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== session.currentAccountId) {
    throw redirect("/lobbies");
  }

  const theme = await getLobbyThemeSettings(lobbyId);
  return { theme, lobbyName: lobby.name };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, isAdmin } = await import("@secretlobby/auth");
  const { updateLobbyThemeSettings, resetLobbyThemeSettings } = await import("~/lib/content.server");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobby-theme" });

  const { session } = await getSession(request);
  if (!isAdmin(session) || !session.currentAccountId) {
    return { error: "Unauthorized" };
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    return { error: "Lobby ID required" };
  }

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== session.currentAccountId) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "reset-theme") {
      await resetLobbyThemeSettings(lobbyId);
      return { success: "Theme reset to defaults" };
    }

    if (intent === "update-theme") {
      const themeUpdate: Partial<ThemeSettings> = {};

      const colorFields = [
        "bgPrimary", "textPrimary", "primary", "primaryHover", "primaryText",
        "accent", "visualizerBg", "visualizerBar", "visualizerBarAlt", "visualizerGlow",
        "cardHeadingColor", "cardContentColor", "cardMutedColor", "cardBgColor",
        "cardBgGradientFrom", "cardBgGradientTo", "cardBorderColor",
        "cardBorderGradientFrom", "cardBorderGradientTo",
      ] as const;

      for (const field of colorFields) {
        const value = formData.get(field) as string;
        if (value) themeUpdate[field] = value;
      }

      const cardBgType = formData.get("cardBgType") as string;
      if (cardBgType === "solid" || cardBgType === "gradient") themeUpdate.cardBgType = cardBgType;

      const cardBgOpacity = formData.get("cardBgOpacity") as string;
      if (cardBgOpacity) themeUpdate.cardBgOpacity = parseInt(cardBgOpacity, 10);

      const cardBgGradientAngle = formData.get("cardBgGradientAngle") as string;
      if (cardBgGradientAngle) themeUpdate.cardBgGradientAngle = parseInt(cardBgGradientAngle, 10);

      const cardBorderShow = formData.get("cardBorderShow") as string;
      themeUpdate.cardBorderShow = cardBorderShow === "true";

      const cardBorderType = formData.get("cardBorderType") as string;
      if (cardBorderType === "solid" || cardBorderType === "gradient") themeUpdate.cardBorderType = cardBorderType;

      const cardBorderOpacity = formData.get("cardBorderOpacity") as string;
      if (cardBorderOpacity) themeUpdate.cardBorderOpacity = parseInt(cardBorderOpacity, 10);

      const cardBorderGradientAngle = formData.get("cardBorderGradientAngle") as string;
      if (cardBorderGradientAngle) themeUpdate.cardBorderGradientAngle = parseInt(cardBorderGradientAngle, 10);

      const cardBorderWidth = formData.get("cardBorderWidth") as string;
      if (cardBorderWidth) themeUpdate.cardBorderWidth = cardBorderWidth.trim();

      const cardBorderRadius = formData.get("cardBorderRadius") as string;
      if (cardBorderRadius) themeUpdate.cardBorderRadius = parseInt(cardBorderRadius, 10);

      const buttonBorderRadius = formData.get("buttonBorderRadius") as string;
      if (buttonBorderRadius) themeUpdate.buttonBorderRadius = parseInt(buttonBorderRadius, 10);

      const playButtonBorderRadius = formData.get("playButtonBorderRadius") as string;
      if (playButtonBorderRadius) themeUpdate.playButtonBorderRadius = parseInt(playButtonBorderRadius, 10);

      const visualizerBgOpacity = formData.get("visualizerBgOpacity") as string;
      if (visualizerBgOpacity) themeUpdate.visualizerBgOpacity = parseInt(visualizerBgOpacity, 10);

      const visualizerUseCardBg = formData.get("visualizerUseCardBg") as string;
      themeUpdate.visualizerUseCardBg = visualizerUseCardBg === "true";

      const visualizerBorderShow = formData.get("visualizerBorderShow") as string;
      themeUpdate.visualizerBorderShow = visualizerBorderShow === "true";

      const visualizerBorderColor = formData.get("visualizerBorderColor") as string;
      if (visualizerBorderColor) themeUpdate.visualizerBorderColor = visualizerBorderColor;

      const visualizerBorderRadius = formData.get("visualizerBorderRadius") as string;
      if (visualizerBorderRadius) themeUpdate.visualizerBorderRadius = parseInt(visualizerBorderRadius, 10);

      const visualizerBlendMode = formData.get("visualizerBlendMode") as string;
      if (visualizerBlendMode) themeUpdate.visualizerBlendMode = visualizerBlendMode;

      const visualizerType = formData.get("visualizerType") as string;
      if (visualizerType === "equalizer" || visualizerType === "waveform") themeUpdate.visualizerType = visualizerType;

      await updateLobbyThemeSettings(lobbyId, themeUpdate);
      return { success: "Theme updated" };
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Theme update error");
    return { error: "Failed to update theme" };
  }

  return null;
}

function ColorInput({ name, value, label }: { name: string; value: string; label: string }) {
  return (
    <div>
      <label className="block text-xs text-theme-secondary mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="color"
          name={name}
          defaultValue={value}
          className="w-10 h-10 rounded border border-theme cursor-pointer"
        />
        <input
          type="text"
          defaultValue={value}
          className="flex-1 px-2 py-1 text-sm bg-theme-tertiary border border-theme rounded"
          readOnly
        />
      </div>
    </div>
  );
}

export default function LobbyThemePage() {
  const { theme, lobbyName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success) toast.success(actionData.success);
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData]);

  if (!theme) {
    return <div className="text-center py-8 text-theme-secondary">Unable to load theme settings</div>;
  }

  return (
    <div className="space-y-8">
      <Form method="post" className="space-y-6">
        <input type="hidden" name="intent" value="update-theme" />

        {/* Primary Colors */}
        <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
          <h2 className="text-lg font-semibold mb-4">Primary Colors</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ColorInput name="bgPrimary" value={theme.bgPrimary} label="Background" />
            <ColorInput name="textPrimary" value={theme.textPrimary} label="Text" />
            <ColorInput name="primary" value={theme.primary} label="Primary" />
            <ColorInput name="accent" value={theme.accent} label="Accent" />
          </div>
        </section>

        {/* Card Settings */}
        <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
          <h2 className="text-lg font-semibold mb-4">Card Appearance</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ColorInput name="cardBgColor" value={theme.cardBgColor} label="Card Background" />
            <ColorInput name="cardHeadingColor" value={theme.cardHeadingColor} label="Card Heading" />
            <ColorInput name="cardContentColor" value={theme.cardContentColor} label="Card Content" />
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Background Opacity</label>
              <input
                type="range"
                name="cardBgOpacity"
                min="0"
                max="100"
                defaultValue={theme.cardBgOpacity}
                className="w-full"
              />
            </div>
          </div>
        </section>

        {/* Visualizer Settings */}
        <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
          <h2 className="text-lg font-semibold mb-4">Visualizer</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ColorInput name="visualizerBar" value={theme.visualizerBar} label="Bar Color" />
            <ColorInput name="visualizerBarAlt" value={theme.visualizerBarAlt} label="Alt Bar Color" />
            <ColorInput name="visualizerGlow" value={theme.visualizerGlow} label="Glow Color" />
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Type</label>
              <select
                name="visualizerType"
                defaultValue={theme.visualizerType}
                className="w-full px-2 py-2 bg-theme-tertiary border border-theme rounded"
              >
                <option value="equalizer">Equalizer</option>
                <option value="waveform">Waveform</option>
              </select>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn("px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50", isSubmitting ? "cursor-not-allowed" : "cursor-pointer")}
          >
            {isSubmitting ? "Saving..." : "Save Theme"}
          </button>
        </div>
      </Form>

      {/* Reset Theme */}
      <Form method="post">
        <input type="hidden" name="intent" value="reset-theme" />
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg transition cursor-pointer disabled:opacity-50"
        >
          Reset to Defaults
        </button>
      </Form>
    </div>
  );
}
