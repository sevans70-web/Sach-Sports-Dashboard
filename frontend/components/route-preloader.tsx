"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ROUTES = [
  "/mlb",
  "/nfl",
  "/cfb",
  "/nba",
  "/wnba",
  "/nhl",
  "/soccer",
  "/cbb",
];

export function RoutePreloader() {
  const router = useRouter();

  useEffect(() => {
    let index = 0;

    const timer = window.setInterval(() => {
      const route = ROUTES[index];
      if (!route) {
        window.clearInterval(timer);
        return;
      }

      router.prefetch(route);
      index += 1;
    }, 220);

    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
