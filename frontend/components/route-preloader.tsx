"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { warmDefaultRankingCaches } from "@/components/player-rankings-panel";

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
    // Warm the ranking API cache before the user opens another sport.
    // CFB All Day is intentionally first inside warmDefaultRankingCaches().
    warmDefaultRankingCaches();

    let index = 0;

    const timer = window.setInterval(() => {
      const route = ROUTES[index];

      if (!route) {
        window.clearInterval(timer);
        return;
      }

      router.prefetch(route);
      index += 1;
    }, 180);

    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
