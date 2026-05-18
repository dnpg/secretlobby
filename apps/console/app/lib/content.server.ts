import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@secretlobby/db";
import {
  type ColorMode,
  type ImageBackground,
  type ThemeSettings,
  defaultDarkTheme,
  defaultLightTheme,
  defaultTheme,
  generateThemeCSS,
  getCardBgCSS,
  getCardBorderCSS,
  getDefaultThemeForMode,
  normalizeBorderRadius,
  normalizeCSSValue,
  normalizeThemeBackground,
} from "@secretlobby/theme";

// Re-export the package types + helpers so existing
// `import { ThemeSettings, ... } from "~/lib/content.server"` keeps working.
export type { ColorMode, ThemeSettings };
export {
  defaultDarkTheme,
  defaultLightTheme,
  defaultTheme,
  generateThemeCSS,
  getCardBgCSS,
  getCardBorderCSS,
  getDefaultThemeForMode,
  normalizeCSSValue,
};

export interface Track {
  id: string;
  title: string;
  artist: string;
  filename: string;
}

export interface SiteContent {
  background: string;
  backgroundDark?: string;
  banner: string;
  bannerDark?: string;
  profilePic?: string;
  profilePicDark?: string;
  bandName?: string;
  bandDescription?: string;
  playlist: Track[];
  sitePassword?: string;
  theme?: ThemeSettings;
  allowUserColorMode?: boolean;
}

const CONTENT_PATH = join(process.cwd(), "content", "site.json");

export async function getSiteContent(): Promise<SiteContent> {
  try {
    const content = await readFile(CONTENT_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      background: "default-bg.jpg",
      banner: "default-banner.png",
      profilePic: "",
      bandName: "",
      bandDescription: "",
      playlist: [],
    };
  }
}

export async function updateSiteContent(content: Partial<SiteContent>): Promise<void> {
  const current = await getSiteContent();
  const updated = { ...current, ...content };
  await writeFile(CONTENT_PATH, JSON.stringify(updated, null, 2));
}

export async function addTrack(track: Omit<Track, "id">): Promise<Track> {
  const content = await getSiteContent();
  const newTrack: Track = {
    ...track,
    id: Date.now().toString(),
  };
  content.playlist.push(newTrack);
  await updateSiteContent(content);
  return newTrack;
}

export async function removeTrack(id: string): Promise<void> {
  const content = await getSiteContent();
  content.playlist = content.playlist.filter((t) => t.id !== id);
  await updateSiteContent(content);
}

export async function updateTrack(id: string, updates: Partial<Track>): Promise<void> {
  const content = await getSiteContent();
  content.playlist = content.playlist.map((t) =>
    t.id === id ? { ...t, ...updates } : t
  );
  await updateSiteContent(content);
}

export async function getSitePassword(): Promise<string> {
  const content = await getSiteContent();
  return content.sitePassword || process.env.SITE_PASSWORD || "";
}

export async function updateSitePassword(password: string): Promise<void> {
  await updateSiteContent({ sitePassword: password });
}

export interface LoginPageSettings {
  title: string;
  description: string;
  logoType: "svg" | "image" | null;
  logoSvg: string;
  logoImage: string;
  logoMaxWidth: number; // percentage 10-100
  bgColor: string;
  /** Optional background image layered on top of `bgColor`. Same shape the
   *  lobby template's `theme.background.image` uses (see
   *  `@secretlobby/theme#ImageBackground`) so the editor surfaces the same
   *  size / position / repeat / overlay knobs. */
  bgImage?: ImageBackground;
  panelBgColor: string;
  panelBorderColor: string;
  textColor: string;
  buttonLabel: string;
}

export const defaultLoginPageSettings: LoginPageSettings = {
  title: "Console Login",
  description: "",
  logoType: null,
  logoSvg: "",
  logoImage: "",
  logoMaxWidth: 50,
  bgColor: "#111827",
  panelBgColor: "#1f2937",
  panelBorderColor: "#374151",
  textColor: "#ffffff",
  buttonLabel: "Enter Lobby",
};

export type { SocialLink, SocialLinksSettings } from "./social-platforms";
import { defaultSocialLinksSettings, type SocialLinksSettings } from "./social-platforms";
export { defaultSocialLinksSettings, SOCIAL_PLATFORMS } from "./social-platforms";

interface TechnicalInfo {
  title: string;
  content: string;
}

// =============================================================================
// Account Settings (Global - applies to all lobbies)
// =============================================================================

interface AccountSettings {
  googleAnalytics?: GoogleAnalyticsSettings;
  allowUserColorMode?: boolean;
  // Legacy: these will be migrated to lobby.settings
  theme?: ThemeSettings;
  loginPage?: Partial<LoginPageSettings>;
  socialLinks?: SocialLinksSettings;
  technicalInfo?: TechnicalInfo;
  [key: string]: unknown;
}

async function getAccountSettings(accountId: string): Promise<AccountSettings> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { settings: true },
  });
  if (!account?.settings || typeof account.settings !== "object") {
    return {};
  }
  return account.settings as AccountSettings;
}

async function updateAccountSettings(accountId: string, updates: Partial<AccountSettings>): Promise<void> {
  const current = await getAccountSettings(accountId);
  const merged = { ...current, ...updates };
  await prisma.account.update({
    where: { id: accountId },
    data: { settings: JSON.parse(JSON.stringify(merged)) },
  });
}

// =============================================================================
// Lobby Settings (Per-lobby customization)
// =============================================================================

interface LobbySettings {
  theme?: ThemeSettings;
  loginPage?: Partial<LoginPageSettings>;
  socialLinks?: SocialLinksSettings;
  technicalInfo?: TechnicalInfo;
  [key: string]: unknown;
}

async function getLobbySettingsById(lobbyId: string): Promise<LobbySettings> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: { settings: true },
  });
  if (!lobby?.settings || typeof lobby.settings !== "object") {
    return {};
  }
  return lobby.settings as LobbySettings;
}

async function updateLobbySettingsById(lobbyId: string, updates: Partial<LobbySettings>): Promise<void> {
  const current = await getLobbySettingsById(lobbyId);
  const merged = { ...current, ...updates };
  await prisma.lobby.update({
    where: { id: lobbyId },
    data: { settings: JSON.parse(JSON.stringify(merged)) },
  });
}

export async function getThemeSettings(accountId: string): Promise<ThemeSettings> {
  const settings = await getAccountSettings(accountId);
  const theme = { ...defaultTheme, ...settings.theme };
  if (!theme.colorMode) {
    theme.colorMode = "dark";
  }
  return theme;
}

export async function updateThemeSettings(accountId: string, theme: Partial<ThemeSettings>): Promise<void> {
  const currentTheme = await getThemeSettings(accountId);
  await updateAccountSettings(accountId, { theme: { ...currentTheme, ...theme } });
}

export async function resetThemeSettings(accountId: string): Promise<void> {
  await updateAccountSettings(accountId, { theme: defaultTheme });
}

export async function getAllowUserColorMode(accountId: string): Promise<boolean> {
  const settings = await getAccountSettings(accountId);
  return settings.allowUserColorMode !== false;
}

export async function updateAllowUserColorMode(accountId: string, allow: boolean): Promise<void> {
  await updateAccountSettings(accountId, { allowUserColorMode: allow });
}

export async function getLoginPageSettings(accountId: string): Promise<LoginPageSettings> {
  const settings = await getAccountSettings(accountId);
  return { ...defaultLoginPageSettings, ...settings.loginPage };
}

export async function updateLoginPageSettings(accountId: string, updates: Partial<LoginPageSettings>): Promise<void> {
  const current = await getLoginPageSettings(accountId);
  await updateAccountSettings(accountId, { loginPage: { ...current, ...updates } });
}

export async function getSocialLinksSettings(accountId: string): Promise<SocialLinksSettings> {
  const settings = await getAccountSettings(accountId);
  return { ...defaultSocialLinksSettings, ...settings.socialLinks };
}

export async function updateSocialLinksSettings(accountId: string, socialLinks: SocialLinksSettings): Promise<void> {
  await updateAccountSettings(accountId, { socialLinks });
}

export interface TechnicalInfoSettings {
  title: string;
  content: string;
}

export const defaultTechnicalInfoSettings: TechnicalInfoSettings = {
  title: "",
  content: "",
};

export async function getTechnicalInfoSettings(accountId: string): Promise<TechnicalInfoSettings> {
  const settings = await getAccountSettings(accountId);
  return { ...defaultTechnicalInfoSettings, ...settings.technicalInfo };
}

export async function updateTechnicalInfoSettings(accountId: string, technicalInfo: TechnicalInfoSettings): Promise<void> {
  await updateAccountSettings(accountId, { technicalInfo });
}

export interface GoogleAnalyticsSettings {
  trackingId: string;
  gtmContainerId: string;
}

export const defaultGoogleAnalyticsSettings: GoogleAnalyticsSettings = {
  trackingId: "",
  gtmContainerId: "",
};

export async function getGoogleAnalyticsSettings(accountId: string): Promise<GoogleAnalyticsSettings> {
  const settings = await getAccountSettings(accountId);
  return { ...defaultGoogleAnalyticsSettings, ...settings.googleAnalytics };
}

export async function updateGoogleAnalyticsSettings(accountId: string, googleAnalytics: GoogleAnalyticsSettings): Promise<void> {
  await updateAccountSettings(accountId, { googleAnalytics });
}

// =============================================================================
// Lobby-Specific Settings Functions (Per-Lobby with Account Fallback)
// =============================================================================

/**
 * Helper to get lobby with account for fallback settings.
 * Returns lobby settings, account settings, and accountId for legacy cleanup.
 */
async function getLobbyWithAccountSettings(lobbyId: string): Promise<{
  lobbySettings: LobbySettings;
  accountSettings: AccountSettings;
  accountId: string | null;
}> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: {
      settings: true,
      accountId: true,
      account: {
        select: { settings: true },
      },
    },
  });

  const lobbySettings = (lobby?.settings && typeof lobby.settings === "object"
    ? lobby.settings
    : {}) as LobbySettings;

  const accountSettings = (lobby?.account?.settings && typeof lobby.account.settings === "object"
    ? lobby.account.settings
    : {}) as AccountSettings;

  return { lobbySettings, accountSettings, accountId: lobby?.accountId ?? null };
}

/**
 * Remove a legacy setting key from account.settings after it's been migrated to lobby.
 */
async function removeLegacyAccountSetting(accountId: string, key: keyof AccountSettings): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { settings: true },
  });

  if (!account?.settings || typeof account.settings !== "object") return;

  const settings = account.settings as Record<string, unknown>;
  if (!(key in settings)) return;

  // Remove the legacy key
  const { [key]: _, ...cleanedSettings } = settings;

  await prisma.account.update({
    where: { id: accountId },
    data: { settings: JSON.parse(JSON.stringify(cleanedSettings)) },
  });
}

export async function getLobbyThemeSettings(lobbyId: string): Promise<ThemeSettings> {
  const { lobbySettings, accountSettings } = await getLobbyWithAccountSettings(lobbyId);

  // Use lobby settings if available, otherwise fall back to account settings (legacy)
  const themeSource = lobbySettings.theme || accountSettings.theme;
  const theme = { ...defaultTheme, ...themeSource } as ThemeSettings;

  if (!theme.colorMode) {
    theme.colorMode = "dark";
  }
  // Synthesize the unified background from any legacy bgPrimary on read.
  // We always recompute it: defaultTheme already has `background`, but old
  // persisted JSON without a `background` field needs the bgPrimary fallback.
  if (!themeSource || !(themeSource as { background?: unknown }).background) {
    theme.background = normalizeThemeBackground(theme);
  }
  // Coerce border-radius fields so both legacy number JSON and new per-corner
  // object JSON load cleanly. We always run this — `defaultTheme` already has
  // number values which normalize as-is.
  theme.cardBorderRadius = normalizeBorderRadius(theme.cardBorderRadius);
  theme.buttonBorderRadius = normalizeBorderRadius(theme.buttonBorderRadius);
  theme.playButtonBorderRadius = normalizeBorderRadius(
    theme.playButtonBorderRadius
  );
  theme.visualizerBorderRadius = normalizeBorderRadius(
    theme.visualizerBorderRadius
  );
  return theme;
}

export async function updateLobbyThemeSettings(lobbyId: string, theme: Partial<ThemeSettings>): Promise<void> {
  const { accountId } = await getLobbyWithAccountSettings(lobbyId);
  const currentTheme = await getLobbyThemeSettings(lobbyId);
  await updateLobbySettingsById(lobbyId, { theme: { ...currentTheme, ...theme } });
  // Clean up legacy account setting after migration to lobby
  if (accountId) await removeLegacyAccountSetting(accountId, "theme");
}

export async function resetLobbyThemeSettings(lobbyId: string): Promise<void> {
  const { accountId } = await getLobbyWithAccountSettings(lobbyId);
  await updateLobbySettingsById(lobbyId, { theme: defaultTheme });
  // Clean up legacy account setting after migration to lobby
  if (accountId) await removeLegacyAccountSetting(accountId, "theme");
}

export async function getLobbyLoginPageSettings(lobbyId: string): Promise<LoginPageSettings> {
  const { lobbySettings, accountSettings } = await getLobbyWithAccountSettings(lobbyId);

  // Use lobby settings if available, otherwise fall back to account settings (legacy)
  const loginPageSource = lobbySettings.loginPage || accountSettings.loginPage;
  return { ...defaultLoginPageSettings, ...loginPageSource };
}

export async function updateLobbyLoginPageSettings(lobbyId: string, updates: Partial<LoginPageSettings>): Promise<void> {
  const { accountId } = await getLobbyWithAccountSettings(lobbyId);
  const current = await getLobbyLoginPageSettings(lobbyId);
  await updateLobbySettingsById(lobbyId, { loginPage: { ...current, ...updates } });
  // Clean up legacy account setting after migration to lobby
  if (accountId) await removeLegacyAccountSetting(accountId, "loginPage");
}

export async function getLobbySocialLinksSettings(lobbyId: string): Promise<SocialLinksSettings> {
  const { lobbySettings, accountSettings } = await getLobbyWithAccountSettings(lobbyId);

  // Use lobby settings if available, otherwise fall back to account settings (legacy)
  const socialLinksSource = lobbySettings.socialLinks || accountSettings.socialLinks;
  return { ...defaultSocialLinksSettings, ...socialLinksSource };
}

export async function updateLobbySocialLinksSettings(lobbyId: string, updates: Partial<SocialLinksSettings>): Promise<void> {
  const { accountId } = await getLobbyWithAccountSettings(lobbyId);
  const current = await getLobbySocialLinksSettings(lobbyId);
  await updateLobbySettingsById(lobbyId, { socialLinks: { ...current, ...updates } });
  // Clean up legacy account setting after migration to lobby
  if (accountId) await removeLegacyAccountSetting(accountId, "socialLinks");
}

export async function getLobbyTechnicalInfoSettings(lobbyId: string): Promise<TechnicalInfoSettings> {
  const { lobbySettings, accountSettings } = await getLobbyWithAccountSettings(lobbyId);

  // Use lobby settings if available, otherwise fall back to account settings (legacy)
  const technicalInfoSource = lobbySettings.technicalInfo || accountSettings.technicalInfo;
  return { ...defaultTechnicalInfoSettings, ...technicalInfoSource };
}

export async function updateLobbyTechnicalInfoSettings(lobbyId: string, technicalInfo: TechnicalInfoSettings): Promise<void> {
  const { accountId } = await getLobbyWithAccountSettings(lobbyId);
  await updateLobbySettingsById(lobbyId, { technicalInfo });
  // Clean up legacy account setting after migration to lobby
  if (accountId) await removeLegacyAccountSetting(accountId, "technicalInfo");
}
