"use client";

import { useEffect, useState } from "react";
import type { ResidentRequestSettings } from "./residentRequests";

const ALL_OFF: ResidentRequestSettings = {
  appeals: false,
  appointments: false,
  operator: false,
};

// Which request forms the chat may offer; until the answer arrives, none.
export function useResidentRequestSettings() {
  const [settings, setSettings] = useState<ResidentRequestSettings>(ALL_OFF);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { residentRequests?: ResidentRequestSettings } | null) => {
        if (!cancelled && data?.residentRequests) {
          setSettings(data.residentRequests);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
