// =============================================================================
// LoginPageSettingsPanel
// -----------------------------------------------------------------------------
// Sidebar form rendered when the page-builder is in login-page mode. Replaces
// the layers navigator (sections / columns / blocks) — the login page is a
// fixed template with no block structure.
//
// Every field dispatches `{ type: "updateLoginPage", partial }`, which the
// reducer shallow-merges into `state.loginPage` and flips `loginPageDirty`.
// The autosave fetcher in PageBuilderRoot watches that flag and POSTs the
// merged record on a 600ms debounce.
// =============================================================================

import type { ImageBackground } from "@secretlobby/theme";
import { MediaPicker, type MediaItem } from "@secretlobby/ui";
import type { LoginPageSettings } from "../state/types";
import { usePageBuilder } from "../state/provider";
import {
  HexPickerRow,
  NumberRow,
  SelectRow,
  TextRow,
} from "./ThemeFieldRows";
import { ThemeOverlay } from "./ThemeOverlay";

interface LoginPageSettingsPanelProps {
  /** Driven by the paint-brush button in TopHeader; same prop the layers
   *  navigator (LayersRail) receives. When true the global theme overlay
   *  slides in over this settings form. */
  themeOverlayOpen: boolean;
  onCloseThemeOverlay: () => void;
}

export function LoginPageSettingsPanel({
  themeOverlayOpen,
  onCloseThemeOverlay,
}: LoginPageSettingsPanelProps) {
  const { state, dispatch } = usePageBuilder();
  const lp = state.loginPage;
  const isPreview = state.mode === "preview";

  // Convenience writer — shorthand for the common single-field updateLoginPage
  // dispatch. Centralised here so the form below stays compact.
  const set = <K extends keyof LoginPageSettings>(
    key: K,
    value: LoginPageSettings[K]
  ) => {
    dispatch({ type: "updateLoginPage", partial: { [key]: value } as Partial<LoginPageSettings> });
  };

  // When the user picks a new logo image, persist `media.key` (matches the
  // legacy /lobby/:id/login route) and stage `media.url` into
  // `loginLogoImageUrl` so the canvas preview refreshes without a loader
  // round-trip. logoType is auto-set to "image" so the preview honours the
  // new image immediately.
  const handleLogoSelect = (media: MediaItem) => {
    dispatch({
      type: "updateLoginPage",
      partial: {
        logoType: "image",
        logoImage: media.key,
        logoSvg: "",
      },
    });
    dispatch({ type: "setLoginLogoImageUrl", url: media.url });
  };

  const removeLogo = () => {
    dispatch({
      type: "updateLoginPage",
      partial: { logoType: null, logoImage: "", logoSvg: "" },
    });
    dispatch({ type: "setLoginLogoImageUrl", url: null });
  };

  return (
    <aside className="relative w-85 shrink-0 h-full bg-theme-secondary border-r border-theme flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* ----------------------------------------------------------------- */}
        {/* Copy                                                              */}
        {/* ----------------------------------------------------------------- */}
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-theme-muted font-semibold">
            Copy
          </h3>
          <TextRow
            label="Title"
            value={lp.title}
            onChange={(v) => set("title", v)}
          />
          <TextRow
            label="Description"
            value={lp.description}
            onChange={(v) => set("description", v)}
          />
          <TextRow
            label="Button label"
            value={lp.buttonLabel}
            onChange={(v) => set("buttonLabel", v)}
          />
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Logo                                                              */}
        {/* ----------------------------------------------------------------- */}
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-theme-muted font-semibold">
            Logo
          </h3>
          <SelectRow<"none" | "svg" | "image">
            label="Logo type"
            value={lp.logoType ?? "none"}
            options={[
              { value: "none", label: "None" },
              { value: "svg", label: "Inline SVG" },
              { value: "image", label: "Image" },
            ]}
            onChange={(v) => set("logoType", v === "none" ? null : v)}
          />

          {lp.logoType === "svg" && (
            <div>
              <label className="block text-xs text-theme-secondary mb-1">
                SVG markup
              </label>
              <textarea
                value={lp.logoSvg}
                onChange={(e) => set("logoSvg", e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="<svg ...>...</svg>"
                className="w-full px-2 py-1 text-xs font-mono bg-theme-tertiary border border-theme rounded text-theme-primary"
              />
            </div>
          )}

          {lp.logoType === "image" && (
            <div className="space-y-2">
              <label className="block text-xs text-theme-secondary">
                Image
              </label>
              {state.loginLogoImageUrl ? (
                <div className="space-y-2">
                  <div className="w-full h-24 rounded-lg border border-theme overflow-hidden bg-theme-tertiary flex items-center justify-center">
                    <img
                      src={state.loginLogoImageUrl}
                      alt="Login logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <MediaPicker
                      accept={["image/*"]}
                      tabs={["library", "upload"]}
                      onSelect={handleLogoSelect}
                    >
                      <button
                        type="button"
                        className="flex-1 px-3 py-2 text-xs bg-theme-tertiary border border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary transition-colors cursor-pointer"
                      >
                        Change
                      </button>
                    </MediaPicker>
                    <button
                      type="button"
                      onClick={removeLogo}
                      className="px-3 py-2 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <MediaPicker
                  accept={["image/*"]}
                  tabs={["library", "upload"]}
                  onSelect={handleLogoSelect}
                >
                  <button
                    type="button"
                    className="w-full py-6 border-2 border-dashed border-theme rounded-lg text-theme-muted hover:text-theme-primary hover:border-(--color-brand-red)/50 transition-colors cursor-pointer text-xs"
                  >
                    Choose from Media Library
                  </button>
                </MediaPicker>
              )}
            </div>
          )}

          {lp.logoType && (
            <NumberRow
              label="Logo max width"
              value={lp.logoMaxWidth}
              min={10}
              max={100}
              step={5}
              suffix="%"
              slider
              onChange={(v) => set("logoMaxWidth", v)}
            />
          )}
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Colors                                                            */}
        {/* ----------------------------------------------------------------- */}
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-theme-muted font-semibold">
            Colors
          </h3>
          <HexPickerRow
            label="Background"
            value={lp.bgColor}
            onChange={(v) => set("bgColor", v)}
          />
          {/* Background image — mirrors the lobby template's image-layer
              support. Layers ON TOP of `bgColor` so a transparent / dimmed
              image lets the underlying color show through. When unset, the
              login bg is a flat color; when set we expose size / position /
              repeat knobs that match the lobby's ImageBackground shape. */}
          <BgImageSection
            value={lp.bgImage}
            onChange={(next) => set("bgImage", next)}
          />
          <HexPickerRow
            label="Panel background"
            value={lp.panelBgColor}
            onChange={(v) => set("panelBgColor", v)}
          />
          <HexPickerRow
            label="Panel border"
            value={lp.panelBorderColor}
            onChange={(v) => set("panelBorderColor", v)}
          />
          <HexPickerRow
            label="Text"
            value={lp.textColor}
            onChange={(v) => set("textColor", v)}
          />
        </section>
      </div>

      {/* Global theme overlay — mirrors LayersRail. Driven by the paint-brush
          button in TopHeader. The login template shares the lobby's global
          theme tokens (button colors, text colors, etc.), so the user can
          edit them from either page-kind. Gated on `!isPreview` for the
          same reason as the layers branch: the overlay isn't useful while
          previewing the published lobby. */}
      {!isPreview && themeOverlayOpen && (
        <ThemeOverlay onClose={onCloseThemeOverlay} />
      )}
    </aside>
  );
}

// =============================================================================
// BgImageSection — inline image picker + size/position/repeat knobs. Kept
// local to this file because no other settings panel reuses the exact same
// layout (the global theme uses <BackgroundPicker>, which operates on a full
// ThemeBackground value; the login page intentionally stays on a simpler
// bgColor + optional bgImage split so a designer can flip between "just a
// color" and "color + image" without learning the gradient editor).
//
// Defaults when adding an image — cover / center / no-repeat / scroll —
// match the lobby template's `theme.background.image` defaults so the two
// surfaces feel identical to a designer toggling between them.
// =============================================================================
interface BgImageSectionProps {
  value: ImageBackground | undefined;
  onChange: (next: ImageBackground | undefined) => void;
}

function BgImageSection({ value, onChange }: BgImageSectionProps) {
  const handlePick = (media: MediaItem) => {
    onChange({
      type: "image",
      mediaId: media.id,
      mediaUrl: media.url,
      size: value?.size ?? "cover",
      position: value?.position ?? "center",
      repeat: value?.repeat ?? "no-repeat",
      attachment: value?.attachment ?? "scroll",
    });
  };

  const handleRemove = () => onChange(undefined);

  if (!value) {
    return (
      <div>
        <label className="block text-xs text-theme-secondary mb-1">
          Background image
        </label>
        <MediaPicker
          accept={["image/*"]}
          tabs={["library", "upload"]}
          onSelect={handlePick}
        >
          <button
            type="button"
            className="w-full py-3 border-2 border-dashed border-theme rounded-lg text-theme-muted hover:text-theme-primary hover:border-(--color-brand-red)/50 transition-colors cursor-pointer text-xs"
          >
            + Add background image
          </button>
        </MediaPicker>
      </div>
    );
  }

  // Set helper for the layout knobs — value is guaranteed non-null in this
  // branch, so we can spread it without narrowing each call site.
  const setField = <K extends keyof ImageBackground>(
    key: K,
    next: ImageBackground[K]
  ) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs text-theme-secondary">
        Background image
      </label>
      <div className="w-full h-24 rounded-lg border border-theme overflow-hidden bg-theme-tertiary">
        <img
          src={value.mediaUrl}
          alt="Login background"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex gap-2">
        <MediaPicker
          accept={["image/*"]}
          tabs={["library", "upload"]}
          onSelect={handlePick}
        >
          <button
            type="button"
            className="flex-1 px-3 py-2 text-xs bg-theme-tertiary border border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary transition-colors cursor-pointer"
          >
            Change
          </button>
        </MediaPicker>
        <button
          type="button"
          onClick={handleRemove}
          className="px-3 py-2 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
        >
          Remove
        </button>
      </div>
      <SelectRow
        label="Size"
        value={value.size}
        options={[
          { value: "cover", label: "Cover (fill)" },
          { value: "contain", label: "Contain (fit)" },
          { value: "auto", label: "Auto" },
        ]}
        onChange={(v) => setField("size", v as ImageBackground["size"])}
      />
      <TextRow
        label="Position"
        value={value.position}
        onChange={(v) => setField("position", v)}
      />
      <SelectRow
        label="Repeat"
        value={value.repeat}
        options={[
          { value: "no-repeat", label: "No repeat" },
          { value: "repeat", label: "Repeat" },
          { value: "repeat-x", label: "Repeat X" },
          { value: "repeat-y", label: "Repeat Y" },
        ]}
        onChange={(v) => setField("repeat", v as ImageBackground["repeat"])}
      />
      <SelectRow
        label="Attachment"
        value={value.attachment ?? "scroll"}
        options={[
          { value: "scroll", label: "Scroll" },
          { value: "fixed", label: "Fixed (parallax)" },
        ]}
        onChange={(v) =>
          setField("attachment", v as ImageBackground["attachment"])
        }
      />
    </div>
  );
}
