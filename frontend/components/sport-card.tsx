import Link from "next/link";
import type { Sport } from "@/lib/sports";

export function SportCard({ sport }: { sport: Sport }) {
  const href = sport.slug === "wnba" ? "/wnba" : `/${sport.slug}`;
  return (
    <Link className={`sportCard ${sport.status}`} href={href}>
      <span className="sportIcon">{sport.icon}</span>
      <span>
        <strong>{sport.league}</strong>
        <small>{sport.name}</small>
      </span>
      <span className="cardArrow">→</span>
    </Link>
  );
}
