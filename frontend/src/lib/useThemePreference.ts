import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

function preferredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const saved = window.localStorage.getItem("leadguard-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function resolvedTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(preferredTheme);

  useEffect(() => {
    const apply = () => {
      const theme = resolvedTheme(preference);
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#121212" : "#f8fafc");
    };
    apply();
    if (preference !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", apply);
    return () => media?.removeEventListener?.("change", apply);
  }, [preference]);

  function toggle() {
    const next = resolvedTheme(preference) === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem("leadguard-theme", next);
    } catch {
      // The current page can still switch themes when browser storage is blocked.
    }
    setPreference(next);
  }

  return { preference, resolved: resolvedTheme(preference), toggle };
}
