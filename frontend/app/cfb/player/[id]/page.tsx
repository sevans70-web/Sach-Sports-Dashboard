import Link from "next/link";
import { getCfbAthleteDetails } from "@/lib/cfb-server";

export const dynamic="force-dynamic";

export default async function CfbPlayerPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {id}=await params;
  const qs=await searchParams;
  const details=await getCfbAthleteDetails(id);

  const get=(k:string)=>typeof qs[k]==="string"?String(qs[k]):"";
  const name=details.name!=="CFB Player"?details.name:(get("name")||"CFB Player");
  const team=details.teamName||get("team");
  const matchup=get("matchup");
  const img=details.headshot||get("img");
  const gi=get("gi")||"—";
  const prob=get("prob")||"—";
  const line=get("line")||"—";
  const market=get("market")||"Player Intelligence";

  return <main className="p">
    <Link href="/" className="playerMenu">▦⌄</Link>
    <Link className="back" href="/cfb">← Back to CFB</Link>

    <section className="head">
      {img?<img src={img} alt=""/>:<div className="avatar">CFB</div>}
      <div><h1>{name}</h1><p>{team}{details.position?` · ${details.position}`:""}</p>{matchup?<b>{matchup}</b>:null}</div>
    </section>

    <section className="strip"><b>{market.replaceAll("_"," ")}</b><span>GI {gi}{prob!=="—"?` · ${prob}%`:""}</span></section>

    <div className="metrics">
      <article><span>SPORTSBOOK LINE</span><b>{line}</b></article>
      <article><span>MODEL</span><b>{prob==="—"?"—":`${prob}%`}</b></article>
      <article><span>POSITION</span><b>{details.position||"—"}</b></article>
      <article><span>SEASON</span><b>2026</b></article>
    </div>

    <section className="why">
      <h3>Why This Player Ranks Here</h3>
      <p>CFB player intelligence uses the available sportsbook market when posted and verified ESPN production as supporting context. Missing sportsbook lines are never invented.</p>
    </section>

    {details.teamId?<Link className="rosterButton" href={`/cfb/team/${encodeURIComponent(details.teamId)}?name=${encodeURIComponent(team)}`}>Open {team} roster →</Link>:null}

    <div className="history"><button>Last 5</button><button className="active">Last 10</button><button>Last 20</button></div>
    <p className="note">Verified game-by-game history will appear here when available for this player and market.</p>

    <style>{`
      .p{max-width:780px;margin:0 auto;padding:10px 14px 80px;color:#fff}.playerMenu{display:grid;place-items:center;width:58px;height:58px;border:2px solid #20df7f;border-radius:16px;background:#0c0e0d;color:#fff;text-decoration:none}.back{display:block;width:max-content;margin:10px 0 20px auto;padding:11px 16px;border:2px solid #34373d;border-radius:14px;background:#101112;color:#fff;text-decoration:none}
      .head{display:grid;grid-template-columns:86px 1fr;gap:16px;align-items:center;border:1px solid #34373d;border-radius:18px;padding:18px;background:#111214}.head img,.avatar{width:78px;height:78px;border-radius:50%;border:3px solid #d9b85d;object-fit:cover}.avatar{display:grid;place-items:center;color:#d9b85d;font-weight:900}.head h1{margin:0;font-size:28px}.head p{color:#a9acb3;margin:5px 0}.head b{color:#d9b85d}.strip{display:flex;justify-content:space-between;margin:14px 0;border:1px solid #20df7f;border-radius:12px;padding:14px;background:#111214}.strip span{color:#d9b85d;font-weight:900}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.metrics article{border:1px solid #34373d;border-left:4px solid #20df7f;border-radius:12px;padding:12px;background:#111214}.metrics span{display:block;color:#9da1a8;font-size:11px}.metrics b{display:block;margin-top:6px}.why{border:1px solid #d9b85d;border-radius:14px;padding:16px;margin-top:18px;background:#101112}.why h3{color:#d9b85d;margin-top:0}.why p{line-height:1.5;color:#d7d8db}.rosterButton{display:block;margin-top:14px;border:2px solid #34373d;border-radius:14px;padding:13px;text-align:center;color:#fff;text-decoration:none;background:#0d0f10}.history{display:flex;margin-top:18px}.history button{background:#111319;color:#fff;border:1px solid #383b42;padding:12px 18px}.history .active{color:#fff;border-color:#f04f5f;background:#351015}.note{color:#9da1a8}@media(max-width:600px){.metrics{grid-template-columns:repeat(2,1fr)}.head h1{font-size:23px}}
    `}</style>
  </main>;
}
