import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "curate-mind-theme-mode";
const DEFAULT_THEME_MODE: ThemeMode = "dark";
const SYSTEM_QUERY = "(prefers-color-scheme: dark)";

type ThemeModeState = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeModeCtx = createContext<ThemeModeState | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "dark" || value === "light";
}

function getStoredMode(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME_MODE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isThemeMode(stored) ? stored : DEFAULT_THEME_MODE;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(SYSTEM_QUERY).matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode, resolvedTheme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const resolvedTheme = mode === "system" ? systemTheme : mode;

  useEffect(() => {
    applyTheme(mode, resolvedTheme);
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode, resolvedTheme]);

  const value = useMemo(
    () => ({
      mode,
      resolvedTheme,
      setMode: setModeState,
    }),
    [mode, resolvedTheme],
  );

  return <ThemeModeCtx.Provider value={value}>{children}</ThemeModeCtx.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeCtx);
  if (!ctx) throw new Error("useThemeMode must be inside ThemeModeProvider");
  return ctx;
}
