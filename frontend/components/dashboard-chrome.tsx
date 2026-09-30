"use client";
import Link from "next/link";

type SportKey = "mlb" | "nfl" | "cfb" | "nba" | "wnba" | "nhl" | "soccer" | "cbb";

const SPORTS: Array<{ key: SportKey; label: string; href: string }> = [
  { key: "mlb", label: "MLB", href: "/mlb" },
  { key: "nfl", label: "NFL", href: "/nfl" },
  { key: "cfb", label: "CFB", href: "/cfb" },
  { key: "nba", label: "NBA", href: "/nba" },
  { key: "wnba", label: "WNBA", href: "/wnba" },
  { key: "nhl", label: "NHL", href: "/nhl" },
  { key: "soccer", label: "Soccer", href: "/soccer" },
  { key: "cbb", label: "CBB", href: "/cbb" },
];

export const HERO_COPY: Record<SportKey, { title: string; message: string }> = {
  mlb: {
    title: "MLB Intelligence Center",
    message:
      "Read the matchup before the market moves — lineup status, pitcher tendencies, park factors, contact quality, and recent form all shape the board.",
  },
  nfl: {
    title: "NFL Intelligence Center",
    message:
      "See where opportunity meets matchup — usage, injuries, red-zone role, game script, and defensive weaknesses drive the strongest prop angles.",
  },
  cfb: {
    title: "CFB Intelligence Center",
    message:
      "Navigate a massive Saturday slate with context — player role, opponent strength, pace, team tendencies, and market support help separate signal from noise.",
  },
  nba: {
    title: "NBA Intelligence Center",
    message:
      "Follow the shifts that change a prop fast — minutes, usage, injuries, rotations, pace, and matchup pressure all matter here.",
  },
  wnba: {
    title: "WNBA Intelligence Center",
    message:
      "Track the players creating the biggest edges through role, minutes, matchup quality, recent form, and lineup stability.",
  },
  nhl: {
    title: "NHL Intelligence Center",
    message:
      "Read the ice through workload and opportunity — line combinations, shot volume, goalie usage, matchup quality, and recent form shape the strongest plays.",
  },
  soccer: {
    title: "Soccer Intelligence Center",
    message:
      "Start with who is actually on the pitch — lineup status, role, minutes expectation, opponent quality, and recent form define the strongest player markets.",
  },
  cbb: {
    title: "CBB Intelligence Center",
    message:
      "Cut through a crowded college slate using minutes, role, matchup strength, team style, and game environment to find the clearest player angles.",
  },
};

const HERO_ART: Record<SportKey, string> = {
  mlb: "/hero/mlb.webp",
  nfl: "/hero/nfl.webp",
  cfb: "/hero/cfb.webp",
  nba: "/hero/nba.webp",
  wnba: "/hero/wnba.webp",
  nhl: "/hero/nhl.webp",
  soccer: "/hero/soccer.webp",
  cbb: "/hero/cbb.webp",
};

function BrandBar() {
  return (
    <div className="ssBrand" aria-label="Sach Sports">
      <div className="ssBrandMark">S</div>
      <div className="ssBrandWordmark">
        <span className="gold">SACH</span>
        <span className="white"> SPORTS</span>
      </div>
    </div>
  );
}

export function SportsNav({ active }: { active: SportKey }) {
  return (
    <nav className="ssSportsNav" aria-label="Sports dashboards">
      {SPORTS.map((s) => (
        <Link key={s.key} href={s.href} className={s.key === active ? "active" : ""}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

export function IntelligenceHero({ sport }: { sport: SportKey }) {
  const c = HERO_COPY[sport];

  return (
    <>
      <BrandBar />
      <SportsNav active={sport} />
      <section className={`ssHero ssHero-${sport} ssHeroFinal`} aria-label={`${c.title}. ${c.message}`}>
        <img
          className="ssHeroFinalImage"
          src={HERO_ART[sport]}
          alt={`${c.title}. ${c.message}`}
        />
      </section>
    </>
  );
}

export function UpdatedStamp({ value }: { value?: string | Date | null }) {
  let d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) d = new Date();
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  return (
    <div className="ssUpdated">
      <svg className="ssUpdatedIcon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2.75a9.25 9.25 0 1 0 9.25 9.25A9.25 9.25 0 0 0 12 2.75Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 6.8v5.1l3.45 2.05" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{`Last updated ${date} at ${time} ET`}</span>
    </div>
  );
}
