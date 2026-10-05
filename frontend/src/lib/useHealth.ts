"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { Health } from "./types";

export function useHealth(intervalMs = 30_000) {
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Health>("/api/health")
        .then((h) => alive && (setHealth(h), setOffline(false)))
        .catch(() => alive && setOffline(true));
    load();
    const t = window.setInterval(load, intervalMs);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [intervalMs]);
  return { health, offline };
}
