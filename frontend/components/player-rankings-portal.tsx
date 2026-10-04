"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  PlayerRankingsPanel,
  type RankingsSport,
} from "./player-rankings-panel";

const SPORTS = new Set<RankingsSport>([
  "mlb",
  "nfl",
  "cfb",
  "nba",
  "wnba",
  "nhl",
  "soccer",
  "cbb",
]);

function sportFromPath(pathname: string): RankingsSport | null {
  const first = pathname.split("/").filter(Boolean)[0] as RankingsSport | undefined;
  return first && SPORTS.has(first) ? first : null;
}

function cfbLegacyRankingHost() {
  const sections = Array.from(
    document.querySelectorAll("section")
  ) as HTMLElement[];

  return (
    sections.find((section) => section.querySelector(".rankHeader")) ||
    sections.find((section) =>
      /player rankings/i.test(
        section.querySelector("h2")?.textContent || ""
      )
    ) ||
    null
  );
}

export function PlayerRankingsPortal() {
  const pathname = usePathname();
  const sport = sportFromPath(pathname);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!sport) {
      setHost(null);
      return;
    }

    let current: HTMLElement | null = null;
    let observer: MutationObserver | null = null;
    let stopped = false;

    const findHost = () => {
      if (stopped) return false;

      const next =
        (document.querySelector(
          "section.rankings"
        ) as HTMLElement | null) ||
        (sport === "cfb" ? cfbLegacyRankingHost() : null);

      if (!next) return false;

      if (current && current !== next) {
        current.classList.remove("ssRankingsHost");
      }

      current = next;
      current.classList.add("ssRankingsHost");
      setHost(current);
      return true;
    };

    if (!findHost()) {
      observer = new MutationObserver(() => {
        if (findHost()) observer?.disconnect();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      stopped = true;
      observer?.disconnect();
      current?.classList.remove("ssRankingsHost");
      setHost(null);
    };
  }, [pathname, sport]);

  if (!sport || !host) return null;

  return createPortal(
    <PlayerRankingsPanel sport={sport} />,
    host
  );
}
