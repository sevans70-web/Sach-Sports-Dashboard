import Link from "next/link";
import {getNflTeamRoster} from "@/lib/nfl-server";

export const dynamic="force-dynamic";

export default async function NflTeamPage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<Record<string,string|string[]|undefined>>;
}){
  const{id}=await params;
  const qs=await searchParams;
  const roster=await getNflTeamRoster(id);
  const queryName=typeof qs.name==="string"?qs.name:"";
  const queryLogo=typeof qs.logo==="string"?qs.logo:"";
  const name=roster.teamName==="Team Roster"&&queryName?queryName:roster.teamName;
  const logo=roster.teamLogo||queryLogo;

  return <main className="teamPage">
    <div className="topRow">
      <Link href="/" className="teamMenu">▦⌄</Link>
      <Link href="/nfl/games" className="back">← Back to Games</Link>
    </div>

    <section className="teamHead">
      {logo?<img src={logo} alt=""/>:<div className="logoFallback">NFL</div>}
      <div><h1>{name}</h1><p>Team Roster</p></div>
    </section>

    <div className="rosterLabel"><h2>Roster</h2><span>Quarterbacks listed first</span></div>

    {roster.players.length?<div className="roster">
      {roster.players.map(p=><Link className="playerRow" key={p.id} href={`/nfl/player/${encodeURIComponent(p.id)}?name=${encodeURIComponent(p.name)}&team=${encodeURIComponent(name)}&img=${encodeURIComponent(p.headshot||"")}&position=${encodeURIComponent(p.position||"")}`}>
        <div className="photo">{p.headshot?<img src={p.headshot} alt=""/>:<span>{p.position||"NFL"}</span>}</div>
        <div className="playerMain"><strong>{p.name}</strong><p>{p.position||"Position TBD"}{p.jersey?` · #${p.jersey}`:""}</p></div>
        <span className="openArrow">›</span>
      </Link>)}
    </div>:<div className="empty">Roster data is temporarily unavailable.</div>}

    <style>{`
      .teamPage{max-width:780px;margin:0 auto;padding:10px 14px 80px;color:#fff}
      .topRow{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
      .teamMenu{display:grid;place-items:center;width:58px;height:58px;border:2px solid #20df7f;border-radius:16px;background:#0c0e0d;color:#fff;text-decoration:none}
      .back{display:block;border:2px solid #34373d;border-radius:14px;padding:11px 16px;color:#fff;text-decoration:none;background:#101112}
      .teamHead{display:grid;grid-template-columns:100px 1fr;gap:18px;align-items:center;border:2px solid #20df7f;border-radius:22px;padding:20px;background:linear-gradient(110deg,rgba(32,223,127,.08),#101112 48%,rgba(217,184,93,.08))}
      .teamHead img,.logoFallback{width:92px;height:92px;object-fit:contain}.logoFallback{display:grid;place-items:center;border:3px solid #d9b85d;border-radius:50%;color:#d9b85d;font-weight:900}
      .teamHead h1{font-size:31px;margin:0}.teamHead p{color:#a9acb3;margin:6px 0 0;font-size:18px}
      .rosterLabel{display:flex;justify-content:space-between;align-items:end;margin:24px 2px 10px}.rosterLabel h2{font-size:28px;margin:0}.rosterLabel span{color:#9da1a8;font-size:13px}
      .roster{display:grid;gap:8px}
      .playerRow{display:grid;grid-template-columns:58px 1fr 24px;align-items:center;gap:11px;border:1.5px solid #34373d;border-left:6px solid #20df7f;border-radius:14px;padding:9px 11px;background:#111214;color:#fff;text-decoration:none}
      .photo img,.photo span{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #d9b85d}.photo span{display:grid;place-items:center;color:#d9b85d;font-weight:900;font-size:11px}
      .playerMain strong{display:block;font-size:17px}.playerMain>p{margin:3px 0 0;color:#a9acb3;font-size:12px}.openArrow{color:#d9b85d;font-size:26px;text-align:right}.playerRow:hover,.playerRow:focus{border-color:#20df7f}
      .empty{margin-top:30px;text-align:center;color:#a9acb3;border:1px solid #34373d;border-radius:16px;padding:20px;background:#0d0f10}
      @media(max-width:600px){.teamMenu{width:48px;height:48px}.teamHead{grid-template-columns:72px 1fr;padding:14px}.teamHead img,.logoFallback{width:64px;height:64px}.teamHead h1{font-size:23px}.rosterLabel{align-items:flex-start;flex-direction:column;gap:4px}.playerRow{grid-template-columns:52px 1fr 20px;padding:8px 9px}.photo img,.photo span{width:48px;height:48px}.playerMain strong{font-size:16px}}
    `}</style>
  </main>;
}
