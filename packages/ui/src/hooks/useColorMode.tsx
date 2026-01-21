import { useState, useEffect, useCallback, createContext, useContext, useMemo, type ReactNode } from "react";

export type UserColorMode = "dark" | "light" | "system";
export type ResolvedColorMode = "dark" | "light";

const STORAGE_KEY = "user-color-mode";
const COOKIE_NAME = "color-mode";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 1 month in seconds

interface ColorModeContextValue {
  mode: UserColorMode;
  resolvedMode: ResolvedColorMode;
  setMode: (mode: UserColorMode) => void;
  isDark: boolean;
  isLight: boolean;
  allowUserColorMode: boolean;
}

// Context to share color mode state across all components
const ColorModeContext = createContext<ColorModeContextValue | null>(null);

function setCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function getResolvedMode(mode: UserColorMode): ResolvedColorMode {
  if (typeof window === "undefined") {
    // On server, resolve "system" to "dark"
    return mode === "system" ? "dark" : mode;
  }
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

function applyTheme(mode: UserColorMode): void {
  if (typeof document === "undefined") return;
  const resolved = getResolvedMode(mode);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-color-mode", mode);
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(resolved);
}

interface ColorModeProviderProps {
  children: ReactNode;
  initialColorMode?: UserColorMode;
  allowUserColorMode?: boolean;
}

export function ColorModeProvider({
  children,
  initialColorMode = "system",
  allowUserColorMode = true,
}: ColorModeProviderProps) {
  const [mode, setModeState] = useState<UserColorMode>(initialColorMode);
  // Initial state must match server to avoid hydration mismatch
  // Server resolves "system" to "dark" since it can't check user's media query
  const [resolvedMode, setResolvedMode] = useState<ResolvedColorMode>(() =>
    initialColorMode === "system" ? "dark" : initialColorMode
  );

  // Handle "system" mode resolution on client (server defaults to "dark")
  useEffect(() => {
    if (mode === "system") {
      const resolved = getResolvedMode("system");
      setResolvedMode(resolved);
      applyTheme("system");
    }
  }, []);

  // Update resolved mode when mode changes
  useEffect(() => {
    const resolved = getResolvedMode(mode);
    setResolvedMode(resolved);
    applyTheme(mode);
  }, [mode]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (mode === "system") {
        const resolved = getResolvedMode("system");
        setResolvedMode(resolved);
        applyTheme("system");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mode]);

  const setMode = useCallback((newMode: UserColorMode) => {
    if (!allowUserColorMode) return;
    setModeState(newMode);

    // Save to cookie and localStorage
    setCookie(COOKIE_NAME, newMode, COOKIE_MAX_AGE);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      // localStorage not available
    }

    // Apply theme immediately
    applyTheme(newMode);
  }, [allowUserColorMode]);

  const value = useMemo(
    () => ({
      mode,
      resolvedMode,
      setMode,
      isDark: resolvedMode === "dark",
      isLight: resolvedMode === "light",
      allowUserColorMode,
    }),
    [mode, resolvedMode, setMode, allowUserColorMode]
  );

  return (
    <ColorModeContext.Provider value={value}>
      {children}
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const context = useContext(ColorModeContext);

  if (!context) {
    throw new Error("useColorMode must be used within a ColorModeProvider");
  }

  return context;
}
