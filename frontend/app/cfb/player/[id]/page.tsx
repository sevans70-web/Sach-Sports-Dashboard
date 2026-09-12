import Link from "next/link";
import { CfbPlayerHistory } from "@/components/cfb-player-history";
import { getCfbAthleteDetails, getEspnCfbSchedule } from "@/lib/cfb-server";

export const dynamic = "force-dynamic";

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatKickoff(value: string) {
  if (!value) return "Kickoff TBD";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Kickoff TBD";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

export default async function CfbPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const qs = await searchParams;

  const [details, schedule] = await Promise.all([
    getCfbAthleteDetails(id),
    getEspnCfbSchedule(),
  ]);

  const get = (k: string) => (typeof qs[k] === "string" ? String(qs[k]) : "");

  const name =
    details.name !== "CFB Player" ? details.name : get("name") || "CFB Player";
  const team = details.teamName || get("team");
  const matchup = get("matchup");
  const img = details.headshot || get("img");
  const gi = get("gi") || "—";
  const prob = get("prob") || "—";
  const line = get("line") || "—";
  const market = get("market") || "Player Intelligence";

  const teamId = String(details.teamId || "");
  const teamKey = norm(team);

  const currentGame =
    schedule.find(
      (g: any) =>
        teamId &&
        (String(g.awayTeamId) === teamId || String(g.homeTeamId) === teamId),
    ) ||
    schedule.find(
      (g: any) =>
        teamKey &&
        (norm(String(g.awayTeam || "")) === teamKey ||
          norm(String(g.homeTeam || "")) === teamKey),
    );

  const state = String(currentGame?.state || "pre").toLowerCase();
  const completed = Boolean(currentGame?.completed) || state === "post";
  const live = state === "in" && !completed;
  const statusLabel = completed ? "FINAL" : live ? "LIVE" : "SCHEDULED";

  const gameDetail = currentGame
    ? live || completed
      ? `${currentGame.awayTeam} ${currentGame.awayScore ?? 0} · ${currentGame.homeTeam} ${currentGame.homeScore ?? 0}`
      : `${currentGame.awayTeam} @ ${currentGame.homeTeam}`
    : matchup || "Matchup pending";

  const statusText = currentGame?.status
    ? String(currentGame.status)
    : currentGame?.date
      ? formatKickoff(String(currentGame.date))
      : "Game status pending";

  return (
    <main className="p">
      <Link href="/" className="playerMenu">
        ▦⌄
      </Link>
      <Link className="back" href="/cfb">
        ← Back to CFB
      </Link>

      <section className="head">
        {img ? <img src={img} alt="" /> : <div className="avatar">CFB</div>}
        <div>
          <h1>{name}</h1>
          <p>
            {team}
            {details.position ? ` · ${details.position}` : ""}
          </p>
          {matchup ? <b>{matchup}</b> : null}
        </div>
      </section>

      <section className={`gameState ${live ? "live" : completed ? "final" : "scheduled"}`}>
        <div>
          <small>GAME STATUS</small>
          <strong>{statusLabel}</strong>
          <span>{statusText}</span>
        </div>
        <div className="gameDetail">{gameDetail}</div>
      </section>

      <section className="strip">
        <b>{market.replaceAll("_", " ")}</b>
        <span>
          GI {gi}
          {prob !== "—" ? ` · ${prob}%` : ""}
        </span>
      </section>

      <div className="metrics">
        <article>
          <span>SPORTSBOOK LINE</span>
          <b>{line}</b>
        </article>
        <article>
          <span>MODEL</span>
          <b>{prob === "—" ? "—" : `${prob}%`}</b>
        </article>
        <article>
          <span>POSITION</span>
          <b>{details.position || "—"}</b>
        </article>
        <article>
          <span>SEASON</span>
          <b>2026</b>
        </article>
      </div>

      <section className="why">
        <h3>Why This Player Ranks Here</h3>
        <p>
          CFB player intelligence uses the available sportsbook market when posted
          and verified ESPN production as supporting context. Missing sportsbook
          lines are never invented.
        </p>
      </section>

      {details.teamId ? (
        <Link
          className="rosterButton"
          href={`/cfb/team/${encodeURIComponent(details.teamId)}?name=${encodeURIComponent(team)}`}
        >
          Open {team} roster →
        </Link>
      ) : null}

      <CfbPlayerHistory playerName={name} market={market.replaceAll("_", " ")} />

      <style>{`
        .p{max-width:780px;margin:0 auto;padding:10px 14px 80px;color:#fff}
        .playerMenu{display:grid;place-items:center;width:58px;height:58px;border:2px solid #20df7f;border-radius:16px;background:#0c0e0d;color:#fff;text-decoration:none}
        .back{display:block;width:max-content;margin:10px 0 20px auto;padding:11px 16px;border:2px solid #34373d;border-radius:14px;background:#101112;color:#fff;text-decoration:none}

        .head{display:grid;grid-template-columns:86px 1fr;gap:16px;align-items:center;border:1px solid #34373d;border-radius:18px;padding:18px;background:#111214}
        .head img,.avatar{width:78px;height:78px;border-radius:50%;border:3px solid #d9b85d;object-fit:cover}
        .avatar{display:grid;place-items:center;color:#d9b85d;font-weight:900}
        .head h1{margin:0;font-size:28px}
        .head p{color:#a9acb3;margin:5px 0}
        .head b{color:#d9b85d}

        .gameState{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center;margin:14px 0 0;border:1.5px solid #34373d;border-radius:13px;padding:12px 14px;background:#0d0f10}
        .gameState.live{border-color:#20df7f;box-shadow:0 0 0 1px rgba(32,223,127,.16),0 0 18px rgba(32,223,127,.08)}
        .gameState.final{border-color:#4b4f55}
        .gameState.scheduled{border-color:rgba(217,184,93,.72)}
        .gameState small{display:block;color:#8f949c;font-size:10px;font-weight:900;letter-spacing:.08em}
        .gameState strong{display:block;margin-top:3px;color:#d9b85d;font-size:14px}
        .gameState.live strong{color:#20df7f}
        .gameState span{display:block;margin-top:3px;color:#a9acb3;font-size:12px}
        .gameDetail{text-align:right;font-size:12px;font-weight:850;line-height:1.35;color:#fff}

        .strip{display:flex;justify-content:space-between;margin:14px 0;border:1px solid #20df7f;border-radius:12px;padding:14px;background:#111214}
        .strip span{color:#d9b85d;font-weight:900}

        .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        .metrics article{border:1px solid #34373d;border-left:4px solid #20df7f;border-radius:12px;padding:12px;background:#111214}
        .metrics span{display:block;color:#9da1a8;font-size:11px}
        .metrics b{display:block;margin-top:6px}

        .why{border:1px solid #d9b85d;border-radius:14px;padding:16px;margin-top:18px;background:#101112}
        .why h3{color:#d9b85d;margin-top:0}
        .why p{line-height:1.5;color:#d7d8db}

        .rosterButton{display:block;margin-top:14px;border:2px solid #34373d;border-radius:14px;padding:13px;text-align:center;color:#fff;text-decoration:none;background:#0d0f10}

        @media(max-width:600px){
          .metrics{grid-template-columns:repeat(2,1fr)}
          .head h1{font-size:23px}
          .gameState{grid-template-columns:1fr}
          .gameDetail{text-align:left}
        }
      `}</style>
    </main>
  );
}
