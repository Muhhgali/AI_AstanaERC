"use client";

import type { ReactNode } from "react";

export function ModuleFrame({
  title,
  subtitle,
  actions,
  tabs,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-6 py-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-950">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {tabs ? <div className="mb-6">{tabs}</div> : null}
      {children}
    </div>
  );
}

export function ModuleTabs({
  items,
  active,
  onChange,
}: {
  items: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-neutral-200">
      {items.map((item) => {
        const isActive = item.id === active;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`relative h-11 px-3 text-sm font-medium transition ${
              isActive ? "text-blue-700" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span className="ml-2 text-xs text-neutral-400">{item.count}</span>
            ) : null}
            {isActive ? (
              <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue-600" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
