import Link from "next/link";
import { getCfbTeamRoster } from "@/lib/cfb-server";

export const dynamic="force-dynamic";

export default async function CfbTeamPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {id}=await params;
  const qs=await searchParams;
  const roster=await getCfbTeamRoster(id);
  const queryName=typeof qs.name==="string"?qs.name:"";
  const queryLogo=typeof qs.logo==="string"?qs.logo:"";
  const name=roster.teamName==="Team Roster"&&queryName?queryName:roster.teamName;
  const logo=roster.teamLogo||queryLogo;

  return <main className="teamPage">
    <Link href="/" className="teamMenu">▦⌄</Link>
    <Link href="/cfb/games" className="back">← Back to CFB Games</Link>

    <section className="teamHead">
      {logo?<img src={logo} alt=""/>:<div className="logoFallback">CFB</div>}
      <div><h1>{name}</h1><p>Team Roster</p></div>
    </section>

    {roster.players.length?<div className="roster">
      {roster.players.map(p=><Link className="playerRow" key={p.id} href={`/cfb/player/${encodeURIComponent(p.id)}?name=${encodeURIComponent(p.name)}&team=${encodeURIComponent(name)}&img=${encodeURIComponent(p.headshot||"")}`}>
        <div className="photo">{p.headshot?<img src={p.headshot} alt=""/>:<span>{p.position||"CFB"}</span>}</div>
        <div><strong>{p.name}</strong><p>{p.position}{p.jersey?` · #${p.jersey}`:""}{p.className?` · ${p.className}`:""}</p></div>
        <span className="arrow">›</span>
      </Link>)}
    </div>:<div className="empty">Roster data is temporarily unavailable from ESPN.</div>}

    <style>{`
      .teamPage{max-width:780px;margin:0 auto;padding:10px 14px 80px;color:#fff}.teamMenu{display:grid;place-items:center;width:58px;height:58px;border:2px solid #20df7f;border-radius:16px;background:#0c0e0d;color:#fff;text-decoration:none}.back{display:block;width:max-content;margin:10px 0 20px auto;border:2px solid #34373d;border-radius:14px;padding:11px 16px;color:#fff;text-decoration:none;background:#101112}
      .teamHead{display:grid;grid-template-columns:92px 1fr;gap:16px;align-items:center;border:2px solid #20df7f;border-radius:20px;padding:18px;background:#101112}.teamHead img,.logoFallback{width:84px;height:84px;object-fit:contain}.logoFallback{display:grid;place-items:center;border:2px solid #d9b85d;border-radius:50%;color:#d9b85d}.teamHead h1{font-size:30px;margin:0}.teamHead p{color:#a9acb3;margin:6px 0 0}
      .roster{display:grid;gap:10px;margin-top:20px}.playerRow{display:grid;grid-template-columns:64px 1fr auto;gap:14px;align-items:center;border:2px solid #34373d;border-radius:16px;padding:12px;background:#111214;color:#fff;text-decoration:none}.photo img,.photo span{width:58px;height:58px;border-radius:50%;object-fit:cover;border:2px solid #d9b85d}.photo span{display:grid;place-items:center;color:#d9b85d}.playerRow strong{font-size:18px}.playerRow p{margin:4px 0 0;color:#a9acb3}.arrow{font-size:28px;color:#d9b85d}.empty{margin-top:30px;text-align:center;color:#a9acb3}
    `}</style>
  </main>;
}
