"use client";

import { Bell, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AdminNotification, AdminPrimaryNav } from "./types";

const NAV_ITEMS: { id: AdminPrimaryNav; label: string }[] = [
  { id: "command", label: "Командный центр" },
  { id: "knowledge", label: "База знаний" },
  { id: "dialogs", label: "Диалоги" },
  { id: "review", label: "Проверка" },
  { id: "analytics", label: "Аналитика" },
  { id: "settings", label: "Настройки" },
];

type AdminTopNavProps = {
  active: AdminPrimaryNav;
  isAdminUser: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  notifications: AdminNotification[];
  userLabel: string;
  userRole: string;
  onNavigate: (id: AdminPrimaryNav) => void;
  onLogout: () => void;
};

export function AdminTopNav({
  active,
  isAdminUser,
  search,
  onSearchChange,
  onSearchSubmit,
  notifications,
  userLabel,
  userRole,
  onNavigate,
  onLogout,
}: AdminTopNavProps) {
  const [openNotifications, setOpenNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setOpenNotifications(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const visibleNav = isAdminUser
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.id === "settings");

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/80 bg-white/92 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark size="sm" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-neutral-950">
              AI Assistant
            </div>
            <div className="truncate text-xs text-neutral-500">Астана-ЕРЦ</div>
          </div>
        </div>

        <nav className="hidden min-w-0 flex-1 items-stretch justify-center gap-1 xl:flex">
          {visibleNav.map((item) => {
            const isActive = item.id === active;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative h-16 px-3 text-sm font-medium transition ${
                  isActive
                    ? "text-blue-700"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {item.label}
                {isActive ? (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue-600" />
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAdminUser ? (
            <label className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onSearchSubmit();
                  }
                }}
                className="h-9 w-56 rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-12 text-sm outline-none transition focus:border-blue-500 focus:bg-white lg:w-72"
                placeholder="Поиск по базе знаний"
                aria-label="Глобальный поиск"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                ⌘K
              </span>
            </label>
          ) : null}

          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setOpenNotifications((open) => !open)}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              aria-label="Уведомления"
            >
              <Bell className="h-4 w-4" />
              {notifications.length > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-on-accent">
                  {notifications.length > 9 ? "9+" : notifications.length}
                </span>
              ) : null}
            </button>

            {openNotifications ? (
              <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
                <div className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold">
                  Требует внимания
                </div>
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-neutral-500">
                    Очередь пустая.
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setOpenNotifications(false);
                          item.onOpen();
                        }}
                        className="block w-full border-b border-neutral-100 px-4 py-3 text-left last:border-b-0 hover:bg-neutral-50"
                      >
                        <div className="text-sm font-medium text-neutral-900">
                          {item.title}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {item.hint}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <ThemeToggle compact />

          <div className="hidden items-center gap-2 pl-1 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
              {userLabel.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="max-w-[140px] truncate text-sm font-medium">
                {userLabel}
              </div>
              <div className="text-xs text-neutral-500">{userRole}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Выйти
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-neutral-100 px-4 py-2 xl:hidden">
        {visibleNav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`h-8 shrink-0 rounded-full px-3 text-sm font-medium ${
              item.id === active
                ? "bg-blue-50 text-blue-700"
                : "text-neutral-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
}
