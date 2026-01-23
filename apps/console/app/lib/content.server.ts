import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@secretlobby/db";

export interface Track {
  id: string;
  title: string;
  artist: string;
  filename: string;
}

export type ColorMode = "dark" | "light" | "system";

export interface ThemeSettings {
  colorMode: ColorMode;
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryHover: string;
  primaryText: string;
  secondary: string;
  secondaryHover: string;
  secondaryText: string;
  accent: string;
  visualizerBg: string;
  visualizerBgOpacity: number;
  visualizerBar: string;
  visualizerBarAlt: string;
  visualizerGlow: string;
  visualizerUseCardBg: boolean;
  visualizerBorderShow: boolean;
  visualizerBorderColor: string;
  visualizerBorderRadius: number;
  visualizerBlendMode: string;
  // Card settings
  cardHeadingColor: string;
  cardContentColor: string;
  cardMutedColor: string;
  cardBgType: "solid" | "gradient";
  cardBgColor: string;
  cardBgGradientFrom: string;
  cardBgGradientTo: string;
  cardBgGradientAngle: number;
  cardBgOpacity: number;
  cardBorderShow: boolean;
  cardBorderType: "solid" | "gradient";
  cardBorderColor: string;
  cardBorderGradientFrom: string;
  cardBorderGradientTo: string;
  cardBorderGradientAngle: number;
  cardBorderOpacity: number;
  cardBorderWidth: string;
  cardBorderRadius: number;
  buttonBorderRadius: number;
  playButtonBorderRadius: number;
}

export const defaultDarkTheme: ThemeSettings = {
  colorMode: "dark",
  bgPrimary: "#030712",
  bgSecondary: "#111827",
  bgTertiary: "#1f2937",
  textPrimary: "#ffffff",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  border: "#374151",
  primary: "#ffffff",
  primaryHover: "#e5e7eb",
  primaryText: "#111827",
  secondary: "#1f2937",
  secondaryHover: "#374151",
  secondaryText: "#ffffff",
  accent: "#ffffff",
  visualizerBg: "#111827",
  visualizerBgOpacity: 0,
  visualizerBar: "#ffffff",
  visualizerBarAlt: "#9ca3af",
  visualizerGlow: "#ffffff",
  visualizerUseCardBg: false,
  visualizerBorderShow: false,
  visualizerBorderColor: "#374151",
  visualizerBorderRadius: 8,
  visualizerBlendMode: "normal",
  cardHeadingColor: "#ffffff",
  cardContentColor: "#9ca3af",
  cardMutedColor: "#6b7280",
  cardBgType: "solid",
  cardBgColor: "#111827",
  cardBgGradientFrom: "#1f2937",
  cardBgGradientTo: "#111827",
  cardBgGradientAngle: 135,
  cardBgOpacity: 50,
  cardBorderShow: true,
  cardBorderType: "solid",
  cardBorderColor: "#374151",
  cardBorderGradientFrom: "#374151",
  cardBorderGradientTo: "#1f2937",
  cardBorderGradientAngle: 135,
  cardBorderOpacity: 100,
  cardBorderWidth: "1px",
  cardBorderRadius: 12,
  buttonBorderRadius: 24,
  playButtonBorderRadius: 50,
};

export const defaultLightTheme: ThemeSettings = {
  colorMode: "light",
  bgPrimary: "#ffffff",
  bgSecondary: "#f3f4f6",
  bgTertiary: "#e5e7eb",
  textPrimary: "#111827",
  textSecondary: "#4b5563",
  textMuted: "#9ca3af",
  border: "#d1d5db",
  primary: "#111827",
  primaryHover: "#374151",
  primaryText: "#ffffff",
  secondary: "#e5e7eb",
  secondaryHover: "#d1d5db",
  secondaryText: "#111827",
  accent: "#111827",
  visualizerBg: "#e5e7eb",
  visualizerBgOpacity: 0,
  visualizerBar: "#111827",
  visualizerBarAlt: "#4b5563",
  visualizerGlow: "#111827",
  visualizerUseCardBg: false,
  visualizerBorderShow: false,
  visualizerBorderColor: "#d1d5db",
  visualizerBorderRadius: 8,
  visualizerBlendMode: "normal",
  cardHeadingColor: "#111827",
  cardContentColor: "#4b5563",
  cardMutedColor: "#9ca3af",
  cardBgType: "solid",
  cardBgColor: "#f3f4f6",
  cardBgGradientFrom: "#e5e7eb",
  cardBgGradientTo: "#f3f4f6",
  cardBgGradientAngle: 135,
  cardBgOpacity: 50,
  cardBorderShow: true,
  cardBorderType: "solid",
  cardBorderColor: "#d1d5db",
  cardBorderGradientFrom: "#d1d5db",
  cardBorderGradientTo: "#e5e7eb",
  cardBorderGradientAngle: 135,
  cardBorderOpacity: 100,
  cardBorderWidth: "1px",
  cardBorderRadius: 12,
  buttonBorderRadius: 24,
  playButtonBorderRadius: 50,
};

export const defaultTheme: ThemeSettings = defaultDarkTheme;

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
  bgColor: string;
  panelBgColor: string;
  panelBorderColor: string;
  textColor: string;
}

export const defaultLoginPageSettings: LoginPageSettings = {
  title: "Console Login",
  description: "",
  logoType: null,
  logoSvg: "",
  logoImage: "",
  bgColor: "#111827",
  panelBgColor: "#1f2937",
  panelBorderColor: "#374151",
  textColor: "#ffffff",
};

interface AccountSettings {
  theme?: ThemeSettings;
  allowUserColorMode?: boolean;
  loginPage?: Partial<LoginPageSettings>;
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

export function getCardBgCSS(theme: ThemeSettings): string {
  const opacity = (theme.cardBgOpacity ?? 50) / 100;
  if (theme.cardBgType === "gradient") {
    // For gradient with opacity, we use a gradient with alpha colors
    const from = hexToRgba(theme.cardBgGradientFrom, opacity);
    const to = hexToRgba(theme.cardBgGradientTo, opacity);
    return `linear-gradient(${theme.cardBgGradientAngle ?? 135}deg, ${from}, ${to})`;
  }
  return hexToRgba(theme.cardBgColor || theme.bgSecondary, opacity);
}

export function normalizeCSSValue(value: string | number | undefined, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  const str = String(value).trim();
  if (!str) return fallback;
  // If it's purely numeric, append "px"
  if (/^[\d.]+$/.test(str)) return `${str}px`;
  return str;
}

export function getCardBorderCSS(theme: ThemeSettings): { style: string; borderImage?: string } {
  if (!theme.cardBorderShow) {
    return { style: "none" };
  }
  const opacity = (theme.cardBorderOpacity ?? 100) / 100;
  const width = normalizeCSSValue(theme.cardBorderWidth, "1px");
  if (theme.cardBorderType === "gradient") {
    const from = hexToRgba(theme.cardBorderGradientFrom, opacity);
    const to = hexToRgba(theme.cardBorderGradientTo, opacity);
    return {
      style: `${width} solid transparent`,
      borderImage: `linear-gradient(${theme.cardBorderGradientAngle ?? 135}deg, ${from}, ${to}) 1`,
    };
  }
  return { style: `${width} solid ${hexToRgba(theme.cardBorderColor || theme.border, opacity)}` };
}

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
  }
  return `rgba(0, 0, 0, ${alpha})`;
}

export function generateThemeCSS(theme: ThemeSettings): string {
  const colorScheme = theme.colorMode === "light" ? "light" : "dark";
  return [
    `color-scheme: ${colorScheme}`,
    `--color-mode: ${theme.colorMode}`,
    `--color-bg-primary: ${theme.bgPrimary}`,
    `--color-bg-secondary: ${theme.bgSecondary}`,
    `--color-bg-tertiary: ${theme.bgTertiary}`,
    `--color-text-primary: ${theme.textPrimary}`,
    `--color-text-secondary: ${theme.textSecondary}`,
    `--color-text-muted: ${theme.textMuted}`,
    `--color-border: ${theme.border}`,
    `--color-border-light: ${theme.border}`,
    `--color-primary: ${theme.primary}`,
    `--color-primary-hover: ${theme.primaryHover}`,
    `--color-primary-active: ${theme.primaryHover}`,
    `--color-primary-text: ${theme.primaryText}`,
    `--color-secondary: ${theme.secondary}`,
    `--color-secondary-hover: ${theme.secondaryHover}`,
    `--color-secondary-active: ${theme.secondaryHover}`,
    `--color-secondary-text: ${theme.secondaryText}`,
    `--color-accent: ${theme.accent}`,
    `--color-accent-muted: ${theme.accent}33`,
    `--color-visualizer-bar: ${theme.visualizerBar}`,
    `--color-visualizer-bar-alt: ${theme.visualizerBarAlt}`,
    `--color-visualizer-glow: ${theme.visualizerGlow}`,
  ].join("; ");
}

export function getDefaultThemeForMode(mode: ColorMode): ThemeSettings {
  return mode === "light" ? defaultLightTheme : defaultDarkTheme;
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
