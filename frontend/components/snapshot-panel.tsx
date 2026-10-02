"use client";

import Link from "next/link";

export type SnapshotTone = "green" | "neutral" | "gold";
export type SnapshotIcon = "games" | "lineups" | "ranked" | "predictions";

export type SnapshotMetric = {
  label: string;
  value: string | number;
  detail: string;
  tone?: SnapshotTone;
  icon?: SnapshotIcon;
};

export type SnapshotAlert = {
  title: string;
  detail?: string;
  href?: string;
};

type SnapshotSport = "mlb" | "nfl" | "cfb" | "nba" | "wnba" | "nhl" | "soccer" | "cbb" | "generic";

function sportFromTitle(title: string): SnapshotSport {
  const value = title.toLowerCase();
  if (value.includes("wnba")) return "wnba";
  if (value.includes("nba")) return "nba";
  if (value.includes("mlb")) return "mlb";
  if (value.includes("nfl")) return "nfl";
  if (value.includes("cfb")) return "cfb";
  if (value.includes("nhl")) return "nhl";
  if (value.includes("soccer")) return "soccer";
  if (value.includes("cbb")) return "cbb";
  return "generic";
}

function sportBall(sport: SnapshotSport) {
  if (sport === "mlb") return "⚾";
  if (sport === "nfl" || sport === "cfb") return "🏈";
  if (sport === "nba" || sport === "wnba" || sport === "cbb") return "🏀";
  if (sport === "nhl") return "🏒";
  if (sport === "soccer") return "⚽";
  return "●";
}

function SnapshotGlyph({ type, sport }: { type?: SnapshotIcon; sport: SnapshotSport }) {
  if (!type) return null;

  if (type === "games") {
    return <span className="ssSnapshotSportBall" aria-hidden="true">{sportBall(sport)}</span>;
  }

  if (type === "lineups") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="8" r="2.35" />
        <circle cx="16" cy="8" r="2.35" />
        <circle cx="12" cy="6.2" r="2.6" />
        <path d="M3.6 18.6c.4-2.7 1.9-4.1 4.4-4.1" />
        <path d="M20.4 18.6c-.4-2.7-1.9-4.1-4.4-4.1" />
        <path d="M6.8 20c.5-3.4 2.3-5.1 5.2-5.1s4.7 1.7 5.2 5.1" />
      </svg>
    );
  }

  if (type === "ranked" || type === "predictions") {
    return <span className="ssSnapshotStar" aria-hidden="true">★</span>;
  }

  return null;
}

export function snapshotGameDetail(total: number, live: number, finals: number) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLive = Math.max(0, Number(live) || 0);
  const safeFinals = Math.max(0, Number(finals) || 0);
  const remaining = Math.max(0, safeTotal - safeLive - safeFinals);
  return `${safeLive} live · ${safeFinals} final · ${remaining} remaining`;
}

function SnapshotDetail({ detail }: { detail: string }) {
  const parts = detail.split(" · ");
  return (
    <small className="ssSnapshotMetricDetail">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 ? <i aria-hidden="true">·</i> : null}
          <b>{part}</b>
        </span>
      ))}
    </small>
  );
}

function AlertBanner({ alert }: { alert: SnapshotAlert }) {
  const body = (
    <>
      <span className="ssSnapshotAlertIcon" aria-hidden="true">!</span>
      <strong>ALERT</strong>
      <span className="ssSnapshotAlertText">
        <b>{alert.title}</b>
        {alert.detail ? <small>{alert.detail}</small> : null}
      </span>
      {alert.href ? <span className="ssSnapshotAlertAction">View Details <i aria-hidden="true">›</i></span> : null}
    </>
  );
  return alert.href ? (
    <Link className="ssSnapshotAlert" href={alert.href}>{body}</Link>
  ) : (
    <div className="ssSnapshotAlert" role="status">{body}</div>
  );
}

export function SnapshotPanel(props: {
  title: string;
  note?: string;
  metrics: SnapshotMetric[];
  alert?: SnapshotAlert | null;
}) {
  const { title, metrics, alert } = props;
  const sport = sportFromTitle(title);
  const helperText = "Always confirm starting lineup";

  return (
    <>
      {alert ? <AlertBanner alert={alert} /> : null}
      <section className="ssSnapshotPanel" aria-label={title}>
        <div className="ssSnapshotPanelHead">
          <h2>{title}</h2>
          <span>{helperText}</span>
        </div>
        <div className="ssSnapshotPanelGrid">
          {metrics.slice(0, 3).map((metric) => (
            <article className={`ssSnapshotMetric ssSnapshotMetric-${metric.tone || "neutral"}`} key={metric.label}>
              <div className="ssSnapshotGlyph"><SnapshotGlyph type={metric.icon} sport={sport} /></div>
              <div className="ssSnapshotMetricLabel">{metric.label}</div>
              <div className="ssSnapshotMetricValue">{metric.value}</div>
              <SnapshotDetail detail={metric.detail} />
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
