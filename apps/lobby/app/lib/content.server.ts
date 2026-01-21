import { readFile } from "fs/promises";
import { join } from "path";

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
  visualizerBar: string;
  visualizerBarAlt: string;
  visualizerGlow: string;
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
  visualizerBar: "#ffffff",
  visualizerBarAlt: "#9ca3af",
  visualizerGlow: "#ffffff",
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
  visualizerBar: "#111827",
  visualizerBarAlt: "#4b5563",
  visualizerGlow: "#111827",
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

export async function getSitePassword(): Promise<string> {
  const content = await getSiteContent();
  return content.sitePassword || process.env.SITE_PASSWORD || "";
}

export async function getThemeSettings(): Promise<ThemeSettings> {
  const content = await getSiteContent();
  const theme = content.theme || defaultTheme;
  if (!theme.colorMode) {
    theme.colorMode = "dark";
  }
  return theme;
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

export async function getAllowUserColorMode(): Promise<boolean> {
  const content = await getSiteContent();
  return content.allowUserColorMode !== false;
}
