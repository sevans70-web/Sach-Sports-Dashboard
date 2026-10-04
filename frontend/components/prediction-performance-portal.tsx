"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  PredictionPerformancePanel,
  type PerformanceSport,
} from "./prediction-performance-panel";

const SPORTS = new Set<PerformanceSport>([
  "mlb",
  "nfl",
  "cfb",
  "nba",
  "wnba",
  "nhl",
  "soccer",
  "cbb",
]);

function sportFromPath(pathname: string): PerformanceSport | null {
  const first = pathname.split("/").filter(Boolean)[0] as PerformanceSport | undefined;
  return first && SPORTS.has(first) ? first : null;
}

export function PredictionPerformancePortal() {
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

      const next = document.querySelector(
        "section.performance, section.performanceSection"
      ) as HTMLElement | null;

      if (!next) return false;

      if (current && current !== next) {
        current.classList.remove("ssPerformanceHost");
      }

      current = next;
      current.classList.add("ssPerformanceHost");
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
      current?.classList.remove("ssPerformanceHost");
      setHost(null);
    };
  }, [pathname, sport]);

  if (!sport || !host) return null;

  return createPortal(
    <PredictionPerformancePanel sport={sport} />,
    host
  );
}
