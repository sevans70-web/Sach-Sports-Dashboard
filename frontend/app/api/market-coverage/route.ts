import {NextRequest,NextResponse} from 'next/server';
import {getOwlsPayload,getOwlsBet365Payload,getOwlsArchiveCoverage} from '@/lib/owls-provider';
export const dynamic='force-dynamic';
/** Read-only catalog diagnostics. No credentials, account information or raw
 * archived records are returned; snapshots share the provider request cache. */
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport');if(sport!=='nfl'&&sport!=='nba')return NextResponse.json({error:'Unsupported sport'},{status:400});
 const [merged,source]=await Promise.allSettled([getOwlsPayload(sport),getOwlsBet365Payload(sport)]);
 const categories=new Map<string,number>();let games=0;
 if(merged.status==='fulfilled')for(const game of merged.value?.data||[]){games++;for(const book of game.books||[])for(const prop of book.props||[]){const key=[book.key,prop.category??prop.market??prop.type,prop.periodID??prop.periodId??prop.period??'game'].join('|');categories.set(key,(categories.get(key)||0)+1)}}
 const raw=source.status==='fulfilled'?source.value:null;
 const archive=await getOwlsArchiveCoverage().then(coverage=>({coverage}),e=>({error:String(e?.message||'Archive unavailable')}));
 const buckets=Object.entries(raw?.data||{}).map(([name,v]:[string,any])=>({name,fixtures:(v.fixtures||[]).length,markets:(v.markets||[]).map((m:any)=>({name:m.name,type:m.type,count:(m.outcomes||[]).length,example:(m.outcomes||[]).slice(0,2).map((o:any)=>({name:o.name,handicap:o.handicap,americanOdds:o.americanOdds,status:o.status,fixtureId:o.fixtureId,gameFixtureId:o.gameFixtureId}))}))}));
 return NextResponse.json({sport,merged:{games,error:merged.status==='rejected'?String(merged.reason?.message||'Feed unavailable'):null,categories:Object.fromEntries(categories)},bet365:{error:source.status==='rejected'?String(source.reason?.message||'Source unavailable'):null,status:raw?.meta?.status,cacheTimestamp:raw?.meta?.cacheTimestamp,buckets},archive,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}
