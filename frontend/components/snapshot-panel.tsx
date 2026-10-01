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

function SnapshotGlyph({ type }: { type?: SnapshotIcon }) {
  if (!type) return null;
  if (type === "lineups") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="8" r="2.6" />
        <circle cx="16" cy="8" r="2.6" />
        <circle cx="12" cy="14.5" r="2.8" />
        <path d="M3.5 19c.5-2.8 2.1-4.3 4.5-4.3M20.5 19c-.5-2.8-2.1-4.3-4.5-4.3M7 20c.5-3.1 2.2-4.8 5-4.8s4.5 1.7 5 4.8" />
      </svg>
    );
  }
  if (type === "ranked") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
      </svg>
    );
  }
  if (type === "predictions") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19V9M12 19V5M19 19v-7" />
        <path d="m4 7 5-3 4 3 7-4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M7 12h10M12 7v10" />
    </svg>
  );
}

export function snapshotGameDetail(total: number, live: number, finals: number) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLive = Math.max(0, Number(live) || 0);
  const safeFinals = Math.max(0, Number(finals) || 0);
  const remaining = Math.max(0, safeTotal - safeLive - safeFinals);
  return `${safeLive} live · ${safeFinals} final · ${remaining} remaining`;
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

export function SnapshotPanel({
  title,
  note,
  metrics,
  alert,
}: {
  title: string;
  note?: string;
  metrics: SnapshotMetric[];
  alert?: SnapshotAlert | null;
}) {
  return (
    <>
      {alert ? <AlertBanner alert={alert} /> : null}
      <section className="ssSnapshotPanel" aria-label={title}>
        <div className="ssSnapshotPanelHead">
          <h2>{title}</h2>
          {note ? <span>{note}</span> : null}
        </div>
        <div className="ssSnapshotPanelGrid">
          {metrics.slice(0, 3).map((metric) => (
            <article className={`ssSnapshotMetric ssSnapshotMetric-${metric.tone || "neutral"}`} key={metric.label}>
              <div className="ssSnapshotGlyph"><SnapshotGlyph type={metric.icon} /></div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
