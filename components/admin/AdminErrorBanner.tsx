"use client";

import type { ReactNode } from "react";

export function AdminErrorBanner({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800">
      <div className="mx-auto max-w-[1600px]">
        <div className="font-semibold">{title}</div>
        <div className="mt-1">{message}</div>
        {children}
      </div>
    </div>
  );
}
