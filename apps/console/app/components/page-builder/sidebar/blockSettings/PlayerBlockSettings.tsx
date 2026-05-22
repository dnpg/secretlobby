import { useState } from "react";
import { Link } from "react-router";
import { cn } from "@secretlobby/ui";
import type { ThemeSettings } from "~/lib/theme";
import { useSwatches } from "../../PageBuilderRoot";
import { usePageBuilder } from "../../state/provider";
import type { PlayerBlockContent } from "../../state/types";
import { PlayerThemeFields } from "../PlayerThemeFields";
import { ThemeOverrideAccordion } from "../ThemeOverrideAccordion";

interface PlayerBlockSettingsProps {
  blockId: string;
  content: PlayerBlockContent;
  onUpdate: (content: Partial<PlayerBlockContent>) => void;
}

export function PlayerBlockSettings({
  blockId,
  content,
  onUpdate,
}: PlayerBlockSettingsProps) {
  const { state, dispatch } = usePageBuilder();
  const { playlists, defaultPlaylistId } = state;
  const { swatches, saveSwatch, updateSwatch, deleteSwatch } = useSwatches();

  // Walk to the block — same single-pass lookup CardBlockSettings uses.
  // Cheap; the block-settings panel already iterates this tree.
  const block = (() => {
    for (const section of state.sections) {
      for (const column of section.columns) {
        const b = column.blocks.find((bb) => bb.id === blockId);
        if (b) return b;
      }
    }
    return null;
  })();
  const overrides: Partial<ThemeSettings> = block?.themeOverrides ?? {};
  const hasAnyOverrides = Object.keys(overrides).length > 0;
  // Theme override toggle — when ON, edits in <PlayerThemeFields/> persist
  // into `block.themeOverrides`; when OFF, they write to the global theme.
  // We seed the local state from "is there at least one override" so a
  // block that already has overrides opens in override-mode on first
  // render. Flipping the toggle off clears every override.
  const [overrideActive, setOverrideActive] = useState(hasAnyOverrides);
  const effectiveTheme: ThemeSettings = { ...state.theme, ...overrides };
  const handleThemeChange = (partial: Partial<ThemeSettings>) => {
    if (overrideActive) {
      dispatch({
        type: "updateBlockThemeOverrides",
        blockId,
        overrides: partial,
      });
    } else {
      dispatch({ type: "updateTheme", partial });
    }
  };
  const handleOverrideToggle = (next: boolean) => {
    setOverrideActive(next);
    // Flipping the toggle OFF clears any per-block overrides so the block
    // snaps back to the global theme. Flipping it ON without prior
    // overrides is a no-op until the user edits a field — subsequent
    // edits route through `updateBlockThemeOverrides` automatically.
    if (!next && hasAnyOverrides) {
      dispatch({ type: "clearBlockThemeOverrides", blockId });
    }
  };

  // Effective playlist id for the dropdown. If `content.playlistId` is empty
  // (legacy block) or stale (playlist deleted), fall back to the default so
  // the dropdown reflects what the canvas is actually rendering.
  const effectivePlaylistId =
    content.playlistId && playlists.some((p) => p.id === content.playlistId)
      ? content.playlistId
      : defaultPlaylistId;
  const effectivePlaylist = playlists.find((p) => p.id === effectivePlaylistId);
  // Guard against a stale `autoplayTrackId` whose track was removed from the
  // playlist (or whose playlist changed) — the dropdown should show "First
  // track" rather than a dead value.
  const effectiveAutoplayTrackId =
    content.autoplayTrackId &&
    effectivePlaylist?.tracks.some((t) => t.id === content.autoplayTrackId)
      ? content.autoplayTrackId
      : "";

  // Look up the lobby id from the active playlist so the "Manage playlists"
  // link points back to /lobby/{id}/playlists/{playlistId}. We don't have the
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
            onChange={(e) =>
              onUpdate({
                playlistId: e.target.value,
                // Reset the per-block autoplay-track when the playlist
                // changes — the old track id almost certainly belongs to a
                // different playlist now and would silently fall back to
                // the first track anyway.
                autoplayTrackId: undefined,
              })
            }
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
            to={`/lobby/${lobbyId}/playlists/${effectivePlaylistId}`}
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
            checked={content.showTrackImage ?? false}
            onChange={(e) => onUpdate({ showTrackImage: e.target.checked })}
            className="accent-[var(--color-brand-red)]"
          />
          <span className="text-sm text-theme-secondary">Show track image</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={content.autoplay}
            onChange={(e) =>
              onUpdate({
                autoplay: e.target.checked,
                // Drop the chosen autoplay track when autoplay is turned
                // off so re-enabling later starts from "First track" again
                // rather than silently restoring a stale selection.
                ...(e.target.checked ? {} : { autoplayTrackId: undefined }),
              })
            }
            className="accent-[var(--color-brand-red)]"
          />
          <span className="text-sm text-theme-secondary">Autoplay</span>
        </label>
        {content.autoplay && (
          <div className="pl-6">
            <label
              htmlFor={`player-${blockId}-autoplay-track`}
              className="block text-xs text-theme-secondary mb-1"
            >
              Autoplay track
            </label>
            {effectivePlaylist && effectivePlaylist.tracks.length > 0 ? (
              <select
                id={`player-${blockId}-autoplay-track`}
                value={effectiveAutoplayTrackId}
                onChange={(e) =>
                  onUpdate({
                    autoplayTrackId: e.target.value || undefined,
                  })
                }
                className="w-full px-2 py-2 text-sm rounded-lg border border-theme bg-theme-secondary text-theme-primary cursor-pointer"
              >
                <option value="">First track</option>
                {effectivePlaylist.tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-theme-secondary">
                Add tracks to this playlist to choose an autoplay track.
              </p>
            )}
          </div>
        )}
      </div>
      {/* Theme — global player theme, with a per-player override toggle.
          The accordion chrome + override toggle live in
          ThemeOverrideAccordion so the same component drives
          CardBlockSettings (and any future block that needs the same
          "edit globally OR locally" pattern). */}
      <ThemeOverrideAccordion
        title="Theme"
        hasAnyOverrides={hasAnyOverrides}
        overrideActive={overrideActive}
        onOverrideToggle={handleOverrideToggle}
      >
        <PlayerThemeFields
          value={effectiveTheme}
          onChange={handleThemeChange}
          swatches={swatches}
          saveSwatch={saveSwatch}
          updateSwatch={updateSwatch}
          deleteSwatch={deleteSwatch}
        />
      </ThemeOverrideAccordion>
    </>
  );
}
