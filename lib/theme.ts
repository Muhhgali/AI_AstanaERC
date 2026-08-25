export type ThemeName = "light" | "dark";

export const THEME_STORAGE_KEY = "astana_erc_theme";
export const DEFAULT_THEME: ThemeName = "light";

export function isThemeName(value: unknown): value is ThemeName {
  return value === "light" || value === "dark";
}

export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute("data-theme", theme);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore private-mode storage failures */
  }
}

export function readStoredTheme(): ThemeName {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeName(value)) {
      return value;
    }
  } catch {
    /* ignore */
  }

  return DEFAULT_THEME;
}

export function readDomTheme(): ThemeName {
  if (typeof document === "undefined") {
    return DEFAULT_THEME;
  }

  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

export const THEME_BOOTSTRAP_SCRIPT = `(()=>{try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t!=="light"&&t!=="dark")t=${JSON.stringify(
  DEFAULT_THEME
)};document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme",${JSON.stringify(
  DEFAULT_THEME
)});}})();`;
