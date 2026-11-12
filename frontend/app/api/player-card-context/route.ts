import {NextRequest,NextResponse} from 'next/server';
import {providerFetch} from '@/lib/provider-fetch';

const ESPN='https://site.api.espn.com/apis';
const sports:Record<string,string>={nba:'basketball/nba',nfl:'football/nfl',wnba:'basketball/wnba'};
const dateYear=(date:Date)=>date.getUTCFullYear();
const normalize=(s:unknown)=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
async function json(url:string){
 try{
  const response=await providerFetch(url,{signal:AbortSignal.timeout(5000),next:{revalidate:300}});
  return response.ok?await response.json():null;
 }catch{return null;}
}
function year(value:unknown){
 const n=Number(value);
 return Number.isInteger(n)&&n>=1900&&n<=dateYear(new Date())?n:null;
}

export async function GET(req:NextRequest){
 const q=req.nextUrl.searchParams,sport=q.get('sport')||'',id=q.get('id')||'',path=sports[sport];
 const nhl=sport==='nhl'&&q.get('source')!=='espn';
 if(!/^\d{1,12}$/.test(id)||(!path&&!nhl))return NextResponse.json({draftYear:null,rookie:false,games:[]});
 const cutoff=new Date(q.get('before')||Date.now());
 if(nhl){
  const player=await json(`https://api-web.nhle.com/v1/player/${id}/landing`);
  if(String(player?.playerId)!==id)return NextResponse.json({draftYear:null,rookie:false,games:[]});
  const draftYear=year(player.draftDetails?.year),rookie=player.isRookie===true;
  const team=String(player.currentTeamAbbrev||'');
  const requested=normalize(q.get('team'));
  if(!/^[A-Z]{3}$/.test(team)||!Number.isFinite(cutoff.getTime())||
    (requested&&![team,player.fullTeamName?.default,player.teamCommonName?.default].some(name=>normalize(name)===requested)))
   return NextResponse.json({draftYear,rookie,games:[]});
  const season=dateYear(cutoff)-(cutoff.getUTCMonth()<8?1:0);
  const schedules=await Promise.all([season-1,season].map(y=>json(`https://api-web.nhle.com/v1/club-schedule-season/${team}/${y}${y+1}`)));
  const games=schedules.flatMap(schedule=>(Array.isArray(schedule?.games)?schedule.games:[]).flatMap((game:any)=>{
   if(!game.id||game.gameType!==2||!['OFF','FINAL'].includes(game.gameState)||!(Date.parse(game.startTimeUTC)<cutoff.getTime()))return [];
   const opponent=game.homeTeam?.abbrev===team?game.awayTeam:game.awayTeam?.abbrev===team?game.homeTeam:null;
   return opponent?[{gameId:String(game.id),date:game.startTimeUTC,opponent:opponent.commonName?.default||opponent.abbrev}]:[];
  }));
  return NextResponse.json({draftYear,rookie,games:games.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-20)});
 }
 const payload=await json(`${ESPN}/common/v3/sports/${path}/athletes/${id}`);
 const athlete=payload?.athlete;
 if(String(athlete?.id)!==id)return NextResponse.json({draftYear:null,rookie:false,games:[]});
 const draftFrom=(player:any)=>year(player?.draft?.year??player?.draftYear??
  String(player?.draft?.displayText||player?.displayDraft||'').match(/\b(?:19|20)\d{2}\b/)?.[0]);
 const directDraft=draftFrom(athlete);
 const [category,league]=path.split('/');
 const profile=directDraft==null?await json(`https://sports.core.api.espn.com/v2/sports/${category}/leagues/${league}/athletes/${id}`):null;
 const core=String(profile?.id)===id?profile:null;
 const draftYear=directDraft??draftFrom(core);
 const experience=core?.experience??athlete.experience;
 const seasonStart=dateYear(new Date())-(sport==='nba'&&new Date().getUTCMonth()<8?1:0);
 const rookie=athlete.isRookie===true||core?.isRookie===true||/\brookie\b/i.test(String(experience?.displayValue||athlete.displayExperience||''))||
  (experience?.years===0&&draftYear===seasonStart);
 const teamId=String(athlete.team?.id||'');
 const requested=normalize(q.get('team'));
 const matchesTeam=!requested||[athlete.team?.abbreviation,athlete.team?.displayName,athlete.team?.shortDisplayName].some(name=>normalize(name)===requested);
 if(!['nfl','nba'].includes(sport)||!matchesTeam||!/^\d+$/.test(teamId)||!Number.isFinite(cutoff.getTime()))
  return NextResponse.json({draftYear,rookie,games:[]});
 const season=dateYear(cutoff)-(cutoff.getUTCMonth()<(sport==='nfl'?6:8)?1:0)+(sport==='nba'?1:0);
 const schedules=await Promise.all([season-1,season].map(y=>json(`${ESPN}/site/v2/sports/${path}/teams/${teamId}/schedule?season=${y}&seasontype=2`)));
 const games=schedules.flatMap(schedule=>(Array.isArray(schedule?.events)?schedule.events:[]).flatMap((event:any)=>{
  const game=event.competitions?.[0],teams=game?.competitors,date=event.date||game?.date;
  if(!event.id||!Number.isFinite(Date.parse(date))||Date.parse(date)>=cutoff.getTime()||
   (game?.status??event.status)?.type?.completed!==true||teams?.length!==2||
   !teams.some((side:any)=>String(side.team?.id)===teamId))return [];
  const opponent=teams.find((side:any)=>String(side.team?.id)!==teamId)?.team;
  return [{gameId:String(event.id),date,opponent:opponent?.displayName||opponent?.abbreviation||''}];
 }));
 return NextResponse.json({draftYear,rookie,games:games.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-20)});
}
