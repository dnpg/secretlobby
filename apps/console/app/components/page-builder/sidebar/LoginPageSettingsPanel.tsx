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

import { MediaPicker, type MediaItem } from "@secretlobby/ui";
import type { LoginPageSettings } from "../state/types";
import { usePageBuilder } from "../state/provider";
import {
  HexPickerRow,
  NumberRow,
  SelectRow,
  TextRow,
} from "./ThemeFieldRows";

export function LoginPageSettingsPanel() {
  const { state, dispatch } = usePageBuilder();
  const lp = state.loginPage;

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
    </aside>
  );
}
