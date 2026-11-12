import {NextRequest,NextResponse} from 'next/server';
import {SEARCH_LEAGUES,playerPageHref} from '@/lib/player-search';
import {providerFetch} from '@/lib/provider-fetch';
import {dashboardDay} from '@/lib/dashboard-contract';
export const dynamic='force-dynamic';
async function nbaSearchGame(teamId: string) {
 if (!/^\d+$/.test(teamId)) return null;
 const dates = dashboardDay(new Date()).replaceAll('-', '');
 try {
  const response = await providerFetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dates}&limit=100`);
  if (!response.ok) return null;
  const payload = await response.json();
  const games = (payload.events || []).flatMap((event: any) => {
   const teams = event.competitions?.[0]?.competitors || [];
   const away = teams.find((entry: any) => entry.homeAway === 'away')?.team;
   const home = teams.find((entry: any) => entry.homeAway === 'home')?.team;
   const state = event.status?.type?.state;
   if (![away?.id, home?.id].some(id => String(id) === teamId) ||
       !away?.displayName || !home?.displayName || !/^\d+$/.test(String(event.id)) ||
       !Number.isFinite(Date.parse(event.date)) || !['pre', 'in', 'post'].includes(state)) return [];
   return [{gameId: String(event.id), gameTime: String(event.date), state: String(state),
    status: String(event.status.type.shortDetail || ''), matchup: `${away.displayName} @ ${home.displayName}`}];
  });
  return games.length === 1 ? games[0] as Record<string, string> : null;
 } catch {
  return null;
 }
}

export async function GET(req:NextRequest){
 const p=req.nextUrl.searchParams,sport=p.get('sport')||'',id=p.get('id')||'',league=p.get('league')||'';
 if(!SEARCH_LEAGUES[sport]||!/^\d{1,12}$/.test(id)||(sport==='soccer'&&!/^[a-z0-9._-]{1,40}$/.test(league)))return NextResponse.json({error:'Invalid player'},{status:400});
 let athlete:any=null;
 try{const path=SEARCH_LEAGUES[sport]+(sport==='soccer'?'/'+league:'');const r=await providerFetch(`https://site.api.espn.com/apis/common/v3/sports/${path}/athletes/${id}`);if(r.ok){const data=await r.json();if(String(data.athlete?.id)===id)athlete=data.athlete;}}catch{}
 const href=playerPageHref({sport,id,source:'espn',name:athlete?.displayName||p.get('name')||'Player',team:athlete?.team?.displayName||p.get('team')||'',image:athlete?.headshot?.href||p.get('img')||'',position:athlete?.position?.abbreviation||'',league});
 // The proxy's request origin can be 0.0.0.0:8080. A relative Location keeps
 // navigation on the browser's public origin without trusting forwarded hosts.
 const game = sport === 'nba' ? await nbaSearchGame(String(athlete?.team?.id || '')) : null;
 const location = game ? `${href}&${new URLSearchParams(game)}` : href;
 return new NextResponse(null,{status:307,headers:{Location:location,'Cache-Control':'no-store'}});
}
