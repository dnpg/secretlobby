import { Link } from "react-router";
import { cn } from "@secretlobby/ui";
import { usePageBuilder } from "../../state/provider";
import type { PlayerBlockContent } from "../../state/types";
import {
  BlockColorOverrides,
  type FieldDescriptor,
} from "./BlockColorOverrides";

interface PlayerBlockSettingsProps {
  blockId: string;
  content: PlayerBlockContent;
  onUpdate: (content: Partial<PlayerBlockContent>) => void;
}

// Theme tokens that affect a player block. Includes the cardBg/cardBorder
// because the player typically renders inside a card (visualizerUseCardBg).
const PLAYER_OVERRIDE_FIELDS: FieldDescriptor[] = [
  { key: "visualizerBg", label: "Visualizer background", kind: { kind: "color" } },
  {
    key: "visualizerBgOpacity",
    label: "Visualizer bg opacity",
    kind: { kind: "number", min: 0, max: 100, slider: true, suffix: "%" },
  },
  { key: "visualizerBar", label: "Bar color", kind: { kind: "color" } },
  { key: "visualizerBarAlt", label: "Bar alt color", kind: { kind: "color" } },
  { key: "visualizerGlow", label: "Glow color", kind: { kind: "color" } },
  {
    key: "visualizerUseCardBg",
    label: "Use card background",
    kind: { kind: "toggle" },
  },
  {
    key: "visualizerBorderShow",
    label: "Show border",
    kind: { kind: "toggle" },
  },
  {
    key: "visualizerBorderColor",
    label: "Border color",
    kind: { kind: "color" },
  },
  {
    key: "visualizerBorderRadius",
    label: "Border radius",
    kind: { kind: "number", min: 0, max: 64, suffix: "px" },
  },
  {
    key: "visualizerBlendMode",
    label: "Blend mode",
    kind: {
      kind: "select",
      options: [
        { value: "normal", label: "Normal" },
        { value: "multiply", label: "Multiply" },
        { value: "screen", label: "Screen" },
        { value: "overlay", label: "Overlay" },
        { value: "lighten", label: "Lighten" },
        { value: "darken", label: "Darken" },
      ],
    },
  },
  {
    key: "visualizerType",
    label: "Visualizer type",
    kind: {
      kind: "select",
      options: [
        { value: "equalizer", label: "Equalizer" },
        { value: "waveform", label: "Waveform" },
      ],
    },
  },
  {
    key: "playButtonBorderRadius",
    label: "Play button radius",
    kind: { kind: "number", min: 0, max: 64, suffix: "px" },
  },
  // Card tokens — player typically renders inside a card.
  { key: "cardBgColor", label: "Card background", kind: { kind: "color" } },
  { key: "cardBorderColor", label: "Card border color", kind: { kind: "color" } },
];

export function PlayerBlockSettings({
  blockId,
  content,
  onUpdate,
}: PlayerBlockSettingsProps) {
  const { state } = usePageBuilder();
  const { playlists, defaultPlaylistId } = state;

  // Effective playlist id for the dropdown. If `content.playlistId` is empty
  // (legacy block) or stale (playlist deleted), fall back to the default so
  // the dropdown reflects what the canvas is actually rendering.
  const effectivePlaylistId =
    content.playlistId && playlists.some((p) => p.id === content.playlistId)
      ? content.playlistId
      : defaultPlaylistId;

  // Look up the lobby id from the active playlist so the "Manage playlists"
  // link points back to /lobby/{id}/playlist?playlistId=. We don't have the
  // lobby id directly in builder state, so we read it off LeftRail's parent
  // route via document.location (avoiding extra prop drilling). The build
  // route for the playlist manager is the same console origin.
  // For convenience: lobby id is encoded in the URL as page-builder/{lobbyId}.
  // We pluck it client-side; fall back gracefully if the URL doesn't match.
  const lobbyId =
    typeof window !== "undefined"
      ? window.location.pathname.match(/page-builder\/([^/?#]+)/)?.[1] ?? ""
      : "";

  return (
    <>
      <div>
        <label
          htmlFor={`player-${blockId}-playlist`}
          className="block text-sm font-medium text-theme-primary mb-2"
        >
          Playlist
        </label>
        {playlists.length === 0 ? (
          <p className="text-xs text-theme-secondary">
            No playlists yet — create one from the playlist manager.
          </p>
        ) : (
          <select
            id={`player-${blockId}-playlist`}
            value={effectivePlaylistId}
            onChange={(e) => onUpdate({ playlistId: e.target.value })}
            className="w-full px-2 py-2 text-sm rounded-lg border border-theme bg-theme-secondary text-theme-primary cursor-pointer"
          >
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? " (default)" : ""} · {p.tracks.length} track
                {p.tracks.length === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        )}
        {lobbyId && (
          <Link
            to={`/lobby/${lobbyId}/playlist?playlistId=${effectivePlaylistId}`}
            className="inline-block mt-2 text-xs text-[var(--color-brand-red)] hover:underline cursor-pointer"
          >
            Manage playlists →
          </Link>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-2">Variant</label>
        <div className="flex gap-2">
          {(["full", "compact", "minimal"] as const).map((variant) => (
            <button
              key={variant}
              type="button"
              onClick={() => onUpdate({ variant })}
              className={cn(
                "flex-1 px-2 py-2 text-xs rounded-lg border transition-colors cursor-pointer capitalize",
                content.variant === variant
                  ? "bg-[var(--color-brand-red-muted)] border-[var(--color-brand-red)] text-[var(--color-brand-red)]"
                  : "border-theme text-theme-secondary hover:bg-theme-tertiary"
              )}
            >
              {variant}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={content.showVisualizer}
            onChange={(e) => onUpdate({ showVisualizer: e.target.checked })}
            className="accent-[var(--color-brand-red)]"
          />
          <span className="text-sm text-theme-secondary">Show Visualizer</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={content.showPlaylist}
            onChange={(e) => onUpdate({ showPlaylist: e.target.checked })}
            className="accent-[var(--color-brand-red)]"
          />
          <span className="text-sm text-theme-secondary">Show Playlist</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={content.autoplay}
            onChange={(e) => onUpdate({ autoplay: e.target.checked })}
            className="accent-[var(--color-brand-red)]"
          />
          <span className="text-sm text-theme-secondary">Autoplay</span>
        </label>
      </div>
      <BlockColorOverrides blockId={blockId} fields={PLAYER_OVERRIDE_FIELDS} />
    </>
  );
}
