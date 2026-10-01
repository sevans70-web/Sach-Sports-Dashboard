"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type SportKey = "mlb" | "nfl" | "cfb" | "nba" | "wnba" | "nhl" | "soccer" | "cbb";

type PreviewGame = {
  id: string;
  href: string;
  date: string;
  awayTeam: string;
  awayAbbr: string;
  awayLogo?: string | null;
  awayScore?: number | string | null;
  homeTeam: string;
  homeAbbr: string;
  homeLogo?: string | null;
  homeScore?: number | string | null;
  state: "pre" | "in" | "post";
  status: string;
};

type GamesPreviewResponse = {
  success: boolean;
  sport: SportKey;
  title: string;
  viewAllHref: string;
  games: PreviewGame[];
  updatedAt?: string;
  error?: string;
};

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
      <img
        className="ssBrandLogo"
        src="/brand/sach-sports-crown-logo.png"
        alt=""
        aria-hidden="true"
      />
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
      <section
        className={`ssHero ssHero-${sport} ssHeroFinal`}
        aria-label={`${c.title}. ${c.message}`}
        data-sach-sport={sport}
      >
        <img
          className="ssHeroFinalImage"
          src={HERO_ART[sport]}
          alt={`${c.title}. ${c.message}`}
        />
      </section>
    </>
  );
}

function localWhen(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: "Date TBA", time: "Time TBA" };
  return {
    date: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(d),
    time: `${new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d)} ET`,
  };
}

function TeamLogo({
  src,
  abbr,
}: {
  src?: string | null;
  abbr: string;
}) {
  if (src) {
    return <img className="ssGameTeamLogo" src={src} alt="" aria-hidden="true" />;
  }
  return <span className="ssGameTeamFallback">{abbr.slice(0, 2)}</span>;
}

function statusText(game: PreviewGame) {
  const hasScore = game.awayScore !== null && game.awayScore !== undefined &&
    game.homeScore !== null && game.homeScore !== undefined;
  const score = hasScore ? `${game.awayScore} – ${game.homeScore}` : "";
  if (game.state === "post") return score ? `Final  ${score}` : "Final";
  if (game.state === "in") return score ? `Live  ${score}` : "Live";
  return "Scheduled";
}

function GamesPreviewCard({ game }: { game: PreviewGame }) {
  const when = localWhen(game.date);
  return (
    <Link className="ssGamePreviewCard" href={game.href}>
      <div className="ssGameMatchup">
        <div className="ssGameTeam">
          <TeamLogo src={game.awayLogo} abbr={game.awayAbbr} />
          <strong>{game.awayAbbr}</strong>
        </div>
        <span className="ssGameAt">@</span>
        <div className="ssGameTeam">
          <TeamLogo src={game.homeLogo} abbr={game.homeAbbr} />
          <strong>{game.homeAbbr}</strong>
        </div>
      </div>
      <div className="ssGameWhen">
        <span>{when.date}</span>
        <span>{when.time}</span>
      </div>
      <div className={`ssGameStatus ssGameStatus-${game.state}`}>
        {game.state === "in" ? <i aria-hidden="true" /> : null}
        {statusText(game)}
      </div>
    </Link>
  );
}

function GamesPreview({ sport }: { sport: SportKey }) {
  const [league, setLeague] = useState("eng.1");
  const [payload, setPayload] = useState<GamesPreviewResponse | null>(null);
  const [soccerMount, setSoccerMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (sport !== "soccer") return;

    const select = document.querySelector<HTMLSelectElement>(".soccerLeagueRow select");
    if (select) {
      setLeague(select.value || "eng.1");
      const onChange = () => setLeague(select.value || "eng.1");
      select.addEventListener("change", onChange);

      const stamp = document.querySelector<HTMLElement>(".ssUpdated");
      const leagueRow = document.querySelector<HTMLElement>(".soccerLeagueRow");
      let anchor: HTMLElement | null = leagueRow || stamp;
      if (stamp && leagueRow) {
        const stampBeforeLeague = Boolean(
          stamp.compareDocumentPosition(leagueRow) & Node.DOCUMENT_POSITION_FOLLOWING
        );
        anchor = stampBeforeLeague ? leagueRow : stamp;
      }

      let mount = document.querySelector<HTMLElement>(".ssSoccerGamesMount");
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "ssSoccerGamesMount";
        anchor?.insertAdjacentElement("afterend", mount);
      }
      setSoccerMount(mount);

      return () => {
        select.removeEventListener("change", onChange);
      };
    }
  }, [sport]);

  useEffect(() => {
    let live = true;
    let controller: AbortController | null = null;

    const load = () => {
      controller?.abort();
      controller = new AbortController();
      const params = new URLSearchParams({ sport });
      if (sport === "soccer") params.set("league", league);
      fetch(`/api/games-preview?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data) => {
          if (live) setPayload(data);
        })
        .catch(() => {});
    };

    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      live = false;
      controller?.abort();
      window.clearInterval(id);
    };
  }, [sport, league]);

  const viewAllHref =
    payload?.viewAllHref ||
    (sport === "soccer"
      ? `/soccer/games?league=${encodeURIComponent(league)}`
      : `/${sport}/games`);

  const content = (
    <section className="ssGamesPreview" aria-label={payload?.title || "Games"}>
      <div className="ssGamesPreviewHead">
        <h2>{payload?.title || (sport === "nfl" ? "NFL GAMES" : sport === "cfb" ? "THIS WEEK’S CFB GAMES" : `${sport.toUpperCase()} GAMES`)}</h2>
        <Link href={viewAllHref}>View All <span aria-hidden="true">›</span></Link>
      </div>

      <div className="ssGamesPreviewGrid">
        {payload?.games?.length ? (
          payload.games.slice(0, 3).map((game) => (
            <GamesPreviewCard game={game} key={game.id} />
          ))
        ) : (
          <div className="ssGamesPreviewEmpty">
            {payload?.error ? "Schedule temporarily unavailable." : "Checking the next slate…"}
          </div>
        )}
      </div>
    </section>
  );

  if (sport === "soccer" && soccerMount) {
    return createPortal(content, soccerMount);
  }
  if (sport === "soccer") return null;
  return content;
}

function AutoGamesPreview() {
  const [sport, setSport] = useState<SportKey | null>(null);

  useEffect(() => {
    const hero = document.querySelector<HTMLElement>(".ssHeroFinal[data-sach-sport]");
    const value = hero?.dataset.sachSport as SportKey | undefined;
    if (value) setSport(value);
  }, []);

  return sport ? <GamesPreview sport={sport} /> : null;
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
    <>
      <div className="ssUpdated">
        <svg className="ssUpdatedIcon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 2.75a9.25 9.25 0 1 0 9.25 9.25A9.25 9.25 0 0 0 12 2.75Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 6.8v5.1l3.45 2.05" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{`Last updated ${date} at ${time} ET`}</span>
      </div>
      <AutoGamesPreview />
    </>
  );
}
