import Link from "next/link";
import {loadNbaOverview,type NbaGame} from "@/lib/nba";

export const dynamic="force-dynamic";

function day(v:string|null){
 if(!v)return"";
 return new Intl.DateTimeFormat("en-CA",{
  timeZone:"America/Toronto"
 }).format(new Date(v));
}

function dayLabel(v:string|null){
 if(!v)return"Upcoming";
 return new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Toronto",
  weekday:"long",
  month:"long",
  day:"numeric"
 }).format(new Date(v));
}

function when(v:string|null){
 if(!v)return"Time TBD";
 return new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Toronto",
  hour:"numeric",
  minute:"2-digit",
  timeZoneName:"short"
 }).format(new Date(v));
}

function GameCard({g}:{g:NbaGame}){
 return(
  <Link
   href={`/nba/games/${g.gameId}`}
   style={{color:"inherit",textDecoration:"none"}}
  >
   <article style={{
    border:"1.5px solid #34373d",
    borderLeft:"7px solid #20df7f",
    borderRadius:15,
    padding:14,
    background:"#111214"
   }}>
    <div style={{
     display:"flex",
     justifyContent:"space-between",
     gap:8,
     color:"#d9b85d",
     fontWeight:800,
     fontSize:12
    }}>
     <span>{when(g.tipoff)}</span>
     <span>{g.status}</span>
    </div>

    <div style={{
     display:"flex",
     alignItems:"center",
     gap:8,
     marginTop:10
    }}>
     {g.awayLogo?
      <img
       src={g.awayLogo}
       alt=""
       style={{width:28,height:28,objectFit:"contain"}}
      />
      :null}
     <span style={{fontWeight:800}}>{g.awayAbbr}</span>
     <span>@</span>
     {g.homeLogo?
      <img
       src={g.homeLogo}
       alt=""
       style={{width:28,height:28,objectFit:"contain"}}
      />
      :null}
     <span style={{fontWeight:800}}>{g.homeAbbr}</span>
    </div>

    <h3 style={{margin:"8px 0 5px"}}>
     {g.awayTeam}
     {g.state!=="pre"&&g.awayScore!=null?` ${g.awayScore}`:""}
     {" @ "}
     {g.homeTeam}
     {g.state!=="pre"&&g.homeScore!=null?` ${g.homeScore}`:""}
    </h3>

    <div style={{
     color:"#20df7f",
     fontWeight:800,
     fontSize:12
    }}>
     Open game details ›
    </div>
   </article>
  </Link>
 );
}

export default async function NbaGames(){
 const data=await loadNbaOverview();
 const today=day(new Date().toISOString());

 const sorted=[...data.games].sort(
  (a,b)=>
   new Date(a.tipoff||0).getTime()-
   new Date(b.tipoff||0).getTime()
 );

 const todayGames=sorted.filter(
  (g)=>day(g.tipoff)===today
 );

 const futureAfterToday=sorted.filter(
  (g)=>
   g.tipoff&&
   day(g.tipoff)>today&&
   new Date(g.tipoff).getTime()>Date.now()
 );

 const nextDay=
  futureAfterToday.length
   ?day(futureAfterToday[0].tipoff)
   :"";

 const nextGames=
  nextDay
   ?futureAfterToday.filter((g)=>day(g.tipoff)===nextDay)
   :[];

 const hasGames=todayGames.length>0||nextGames.length>0;

 return(
  <main style={{
   maxWidth:780,
   margin:"0 auto",
   padding:"12px 14px 70px",
   color:"#fff"
  }}>
   <Link
    href="/nba"
    style={{
     color:"#20df7f",
     fontWeight:800,
     textDecoration:"none"
    }}
   >
    ‹ Back to NBA
   </Link>

   <h1 style={{marginBottom:4}}>NBA Games</h1>
   <p style={{color:"#a9acb3",marginTop:0}}>
    Today + next scheduled slate · Matchups · Live/final status
   </p>

   {!hasGames?
    <div style={{
     marginTop:18,
     border:"1px solid #8d6f2f",
     borderRadius:12,
     padding:14,
     color:"#e4c978"
    }}>
     {data.warnings.some(
      (x)=>x.toLowerCase().includes("schedule")
     )
      ?"NBA schedule data is temporarily unavailable. The dashboard will retry automatically."
      :"There are no NBA games scheduled in the current upcoming window."}
    </div>
    :null}

   {todayGames.length?
    <section style={{marginTop:20}}>
     <h2 style={{margin:"0 0 10px"}}>
      Today — {dayLabel(todayGames[0].tipoff)}
     </h2>
     <div style={{display:"grid",gap:10}}>
      {todayGames.map(
       (g)=><GameCard g={g} key={g.gameId}/>
      )}
     </div>
    </section>
    :null}

   {nextGames.length?
    <section style={{marginTop:24}}>
     <h2 style={{margin:"0 0 10px"}}>
      Next Slate — {dayLabel(nextGames[0].tipoff)}
     </h2>
     <div style={{display:"grid",gap:10}}>
      {nextGames.map(
       (g)=><GameCard g={g} key={g.gameId}/>
      )}
     </div>
    </section>
    :null}
  </main>
 );
}
