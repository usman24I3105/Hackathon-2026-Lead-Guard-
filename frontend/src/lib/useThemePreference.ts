import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

function preferredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const saved = window.localStorage.getItem("leadguard-theme");
  return saved === "light" || saved === "dark" ? saved : "system";
}

function resolvedTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(preferredTheme);

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolvedTheme(preference);
      document.documentElement.style.colorScheme = resolvedTheme(preference);
    };
    apply();
    if (preference !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", apply);
    return () => media?.removeEventListener?.("change", apply);
  }, [preference]);

  function toggle() {
    const next = resolvedTheme(preference) === "dark" ? "light" : "dark";
    window.localStorage.setItem("leadguard-theme", next);
    setPreference(next);
  }

  return { preference, resolved: resolvedTheme(preference), toggle };
}
