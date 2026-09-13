"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {NFL_MARKETS,type NflMarketKey} from "@/lib/nfl";

function MenuButton(){return <Link href="/" className="gamesMenu" aria-label="Open sports menu">▦⌄</Link>}

export default function NflGames(){
  const[d,setD]=useState<any>({games:[],filterMode:""});
  const[open,setOpen]=useState("");
  const[intel,setIntel]=useState<Record<string,any>>({});

  useEffect(()=>{
    const run=()=>fetch("/api/nfl/schedule",{cache:"no-store"}).then(r=>r.json()).then(setD).catch(()=>{});
    run();
    const id=setInterval(run,30000);
    return()=>clearInterval(id);
  },[]);

  const games=useMemo(()=>d.games||[],[d]);

  async function toggleGame(x:any){
    if(open===x.id){setOpen("");return}
    setOpen(x.id);
    if(intel[x.id])return;
    const props=(x.availableProps||[]).join(",");
    try{
      const payload=await fetch(`/api/nfl/game/${x.id}?props=${encodeURIComponent(props)}`,{cache:"no-store"}).then(r=>r.json());
      setIntel(v=>({...v,[x.id]:payload.intelligence||{}}));
    }catch{
      setIntel(v=>({...v,[x.id]:{}}));
    }
  }

  return <main className="gamesPage">
    <MenuButton/>
    <Link href="/nfl" className="backButton">← Back to NFL</Link>

    <section className="gamesHero">
      <h1>🏈 This Week&apos;s NFL Games</h1>
      <p>{d.filterMode==="schedule_fallback"?"Player-prop availability is still filling in. The real ESPN slate remains visible so you can open matchups, rosters and Game Intelligence.":"Choose a matchup to open Game Intelligence, team rosters and available player-prop details."}</p>
    </section>

    {games.length===0?<div className="emptyGames">No NFL games are available in the current slate window.</div>:games.map((x:any)=>{
      const live=x.state==="in";
      const pre=x.state==="pre";
      const props:(NflMarketKey[])=(x.availableProps||[]);
      const propNames=props.map((p:string)=>NFL_MARKETS.find(m=>m[0]===p)?.[2]||p);
      const info=intel[x.id]||{};
      const kick=new Date(x.date);
      const dateLabel=Number.isNaN(kick.getTime())?"":kick.toLocaleString("en-US",{month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"});

      return <section key={x.id} className={`gameCard ${live?"live":""}`}>
        <div className="gameStatus">
          <b>{live?x.status:(pre?dateLabel:(x.status||"Final"))}</b>
          <span>{x.venue||"Venue TBD"}</span>
        </div>

        <div className="teamRow">
          {x.awayLogo?<img src={x.awayLogo} alt=""/>:<div/>}
          <div>
            <Link className="teamLink" href={`/nfl/team/${encodeURIComponent(x.awayTeamId)}?name=${encodeURIComponent(x.awayTeam)}&logo=${encodeURIComponent(x.awayLogo||"")}`}>{x.awayTeam}</Link>
            {x.awayRecord?<small>{x.awayRecord}</small>:null}
          </div>
          {!pre?<b>{x.awayScore??""}</b>:<b className="noScore"></b>}
        </div>

        <div className="teamRow">
          {x.homeLogo?<img src={x.homeLogo} alt=""/>:<div/>}
          <div>
            <Link className="teamLink" href={`/nfl/team/${encodeURIComponent(x.homeTeamId)}?name=${encodeURIComponent(x.homeTeam)}&logo=${encodeURIComponent(x.homeLogo||"")}`}>{x.homeTeam}</Link>
            {x.homeRecord?<small>{x.homeRecord}</small>:null}
          </div>
          {!pre?<b>{x.homeScore??""}</b>:<b className="noScore"></b>}
        </div>

        <div className="propLine">{propNames.length?`Player props: ${propNames.join(" · ")}`:"Player-prop availability pending"}</div>

        <button className="viewGame" onClick={()=>toggleGame(x)}>{open===x.id?"Hide Game Intelligence":`View ${x.awayTeam} @ ${x.homeTeam} →`}</button>

        {open===x.id?<div className="gameIntel">
          <b>🔥 Game Intelligence</b>
          <div className="intelGrid">
            <div><span>AWAY</span><strong>{info.away?.record||x.awayRecord||"—"}</strong></div>
            <div><span>HOME</span><strong>{info.home?.record||x.homeRecord||"—"}</strong></div>
            <div><span>VENUE</span><strong>{info.venue||x.venue||"TBD"}</strong></div>
            <div><span>TV</span><strong>{(info.broadcast||[]).join(", ")||"TBD"}</strong></div>
          </div>

          {(info.spread||info.overUnder!=null)?<div className="marketContext">
            <strong>Market context</strong>
            <p>{info.spread?`${info.spread}`:""}{info.overUnder!=null?`${info.spread?" · ":""}O/U ${info.overUnder}`:""}{info.provider?` · ${info.provider}`:""}</p>
          </div>:null}

          {Array.isArray(info.leaders)&&info.leaders.length?<div className="playersToWatch">
            <strong>Players to watch</strong>
            {info.leaders.slice(0,4).map((l:any,i:number)=><Link key={`${l.player?.playerId}-${i}`} href={`/nfl/player/${encodeURIComponent(l.player?.playerId||"")}?market=${encodeURIComponent(l.market)}&name=${encodeURIComponent(l.player?.playerName||"")}&team=${encodeURIComponent(l.player?.teamName||"")}&matchup=${encodeURIComponent(l.player?.matchup||"")}&gi=${l.player?.giScore||0}&prob=${l.player?.modelProbability||0}&line=${l.player?.sportsbookLine??""}&img=${encodeURIComponent(l.player?.headshot||"")}`}>
              {NFL_MARKETS.find(m=>m[0]===l.market)?.[2]||l.market}: {l.player?.playerName} · GI {Number(l.player?.giScore||0).toFixed(1)}
            </Link>)}
          </div>:<p>{propNames.length?`This matchup currently has ${propNames.join(", ")} available. Player rankings and player cards use the same NFL intelligence feed.`:"Sportsbook player props have not posted yet. The matchup, rosters, records, venue and team context remain available without inventing betting lines."}</p>}

          <div className="rosterLinks">
            <Link href={`/nfl/team/${encodeURIComponent(x.awayTeamId)}?name=${encodeURIComponent(x.awayTeam)}&logo=${encodeURIComponent(x.awayLogo||"")}`}>View {x.awayTeam} roster →</Link>
            <Link href={`/nfl/team/${encodeURIComponent(x.homeTeamId)}?name=${encodeURIComponent(x.homeTeam)}&logo=${encodeURIComponent(x.homeLogo||"")}`}>View {x.homeTeam} roster →</Link>
          </div>
        </div>:null}
      </section>
    })}

    <style jsx global>{`
      .gamesPage{max-width:780px;margin:0 auto;padding:10px 14px 80px;color:#fff}
      .gamesMenu{display:grid;place-items:center;width:58px;height:58px;border:2px solid #20df7f;border-radius:16px;background:#0c0e0d;color:#fff!important;text-decoration:none!important;font-size:22px}
      .backButton{display:block;width:max-content;margin:10px 0 24px auto;padding:12px 18px;border:2px solid #34373d;border-radius:16px;background:#101112;color:#fff!important;text-decoration:none!important;font-size:18px}
      .gamesHero{border:2px solid #20df7f;border-radius:18px;padding:20px;background:#101112}
      .gamesHero h1{margin:0;font-size:30px}.gamesHero p{color:#a9acb3;font-size:18px;line-height:1.45;margin-bottom:0}
      .gameCard{margin:24px 0;border:4px solid #34373d;border-radius:22px;background:#101112;overflow:hidden}.gameCard.live{border-color:#20df7f}
      .gameStatus{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid #30343a;padding:14px 18px;color:#9da1a8}.gameStatus b{color:#20df7f}
      .teamRow{display:grid;grid-template-columns:90px 1fr auto;align-items:center;gap:14px;padding:12px 18px}.teamRow img{width:82px;height:82px;object-fit:contain}
      .teamLink{display:block;color:#fff!important;text-decoration:none!important;font-size:24px;font-weight:900}.teamRow small{display:block;color:#9da1a8;margin-top:5px;font-size:15px}.teamRow>b{font-size:28px}.noScore{min-width:20px}
      .propLine{color:#d9b85d;padding:8px 18px 14px}.viewGame{width:100%;background:#0c0d0e;color:#d9b85d;border:0;border-top:2px solid #d9b85d;padding:16px;font-size:19px}
      .gameIntel{border-left:6px solid #20df7f;background:#101112;padding:16px 18px}.gameIntel>b{color:#d9b85d;font-size:20px}.gameIntel p{color:#d8d9dc;line-height:1.45}
      .intelGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:14px 0}.intelGrid div{border:1px solid #34373d;border-radius:12px;padding:10px;background:#0d0f10}.intelGrid span{display:block;color:#9da1a8;font-size:11px}.intelGrid strong{display:block;margin-top:5px}
      .marketContext,.playersToWatch{border-left:4px solid #d9b85d;padding:10px 12px;margin:12px 0;background:#0d0f10}.playersToWatch>a{display:block;color:#fff!important;text-decoration:none!important;margin-top:8px}
      .rosterLinks{display:grid;gap:8px;margin-top:14px}.rosterLinks a{display:block;border:2px solid #34373d;border-radius:12px;padding:12px;color:#fff!important;text-decoration:none!important;background:#0d0f10}
      .emptyGames{margin:28px 0;color:#a9acb3;text-align:center}
      @media(max-width:600px){.gamesMenu{width:52px;height:52px}.gamesHero h1{font-size:26px}.gamesHero p{font-size:16px}.teamRow{grid-template-columns:66px 1fr auto;padding:10px 14px}.teamRow img{width:60px;height:60px}.teamLink{font-size:19px}.teamRow>b{font-size:24px}.backButton{font-size:16px}}
    `}</style>
  </main>;
}
