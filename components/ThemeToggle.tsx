"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  readDomTheme,
  type ThemeName,
} from "@/lib/theme";

type ThemeToggleProps = {
  compact?: boolean;
};

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeName>(() => readDomTheme());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === THEME_STORAGE_KEY &&
        (event.newValue === "light" || event.newValue === "dark")
      ) {
        applyTheme(event.newValue);
        setTheme(event.newValue);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = (next: ThemeName) => {
    applyTheme(next);
    setTheme(next);
  };

  return (
    <div
      className={`flex items-center rounded-md border border-neutral-200 bg-neutral-50 ${
        compact ? "p-0.5" : "p-1"
      }`}
      role="group"
      aria-label="Тема оформления"
    >
      <button
        type="button"
        onClick={() => setMode("light")}
        aria-label="Светлая тема"
        aria-pressed={theme === "light"}
        title="Светлая тема"
        className={`${
          compact ? "h-7 w-7" : "h-8 px-2.5"
        } inline-flex items-center justify-center gap-1.5 rounded text-xs font-semibold transition ${
          theme === "light"
            ? "bg-blue-600 text-on-accent shadow-sm"
            : "text-neutral-500 hover:bg-white hover:text-neutral-800"
        }`}
      >
        <Sun size={compact ? 13 : 15} />
        {compact ? null : <span className="hidden sm:inline">Светлая</span>}
      </button>
      <button
        type="button"
        onClick={() => setMode("dark")}
        aria-label="Тёмная тема"
        aria-pressed={theme === "dark"}
        title="Тёмная тема"
        className={`${
          compact ? "h-7 w-7" : "h-8 px-2.5"
        } inline-flex items-center justify-center gap-1.5 rounded text-xs font-semibold transition ${
          theme === "dark"
            ? "bg-blue-600 text-on-accent shadow-sm"
            : "text-neutral-500 hover:bg-white hover:text-neutral-800"
        }`}
      >
        <Moon size={compact ? 13 : 15} />
        {compact ? null : <span className="hidden sm:inline">Тёмная</span>}
      </button>
    </div>
  );
}
