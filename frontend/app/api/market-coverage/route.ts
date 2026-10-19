import {NextRequest,NextResponse} from 'next/server';
import {getOwlsPayload,getOwlsBet365Payload,getOwlsArchiveCoverage} from '@/lib/owls-provider';
import {footballBookRows} from '@/lib/football-book-quotes';
import {getSgoSupplement,sgoBookGames} from '@/lib/sgo-supplement';
export const dynamic='force-dynamic';
/** Read-only catalog diagnostics. No credentials, account information or raw
 * archived records are returned; snapshots share the provider request cache. */
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport');if(sport!=='nfl'&&sport!=='nba')return NextResponse.json({error:'Unsupported sport'},{status:400});
 const [merged,source]=await Promise.allSettled([getOwlsPayload(sport),getOwlsBet365Payload(sport)]);
 const categories=new Map<string,number>();let games=0;
 const quarterSamples:any[]=[];
 if(merged.status==='fulfilled'&&sport==='nfl')for(const game of merged.value?.data||[])for(const book of game.books||[])for(const prop of book.props||[]){if(/(?:1q|q1|quarter)/i.test(String(prop.category||''))&&quarterSamples.filter(p=>p.category===prop.category).length<2)quarterSamples.push({category:prop.category,period:prop.periodID??prop.periodId??prop.period??null,gameTime:game.commenceTime||game.commence_time||game.startTime||game.date,book:book.key,updated:prop.lastUpdate||book.lastUpdate,line:prop.line??prop.point??prop.total,overPrice:prop.overPrice??prop.over_price,underPrice:prop.underPrice??prop.under_price,marketStructure:prop.marketStructure,lineType:prop.lineType,isMainLine:prop.isMainLine,isAlternate:prop.isAlternate,suspended:prop.suspended,isSuspended:prop.isSuspended,active:prop.active,propId:prop.propId})}
 const qualifyingQuarter=sport==='nfl'&&merged.status==='fulfilled'?Object.fromEntries(['passing_yards','receiving_yards','rushing_yards'].map(base=>['q1_'+base,footballBookRows(merged.value,'q1_'+base,[base+'_1q','q1_'+base]).map(r=>({playerName:r.playerName,gameTime:r.gameTime,book:r.sportsbook,line:r.line}))])):undefined;
 if(merged.status==='fulfilled')for(const game of merged.value?.data||[]){games++;for(const book of game.books||[])for(const prop of book.props||[]){const key=[book.key,prop.category??prop.market??prop.type,prop.periodID??prop.periodId??prop.period??'game'].join('|');categories.set(key,(categories.get(key)||0)+1)}}
 const raw=source.status==='fulfilled'?source.value:null;
 const archive=await getOwlsArchiveCoverage().then(coverage=>({coverage}),e=>({error:String(e?.message||'Archive unavailable')}));
 const supplement=await getSgoSupplement(sport.toUpperCase());
 const supplementCategories=new Map<string,number>();
 for(const event of supplement?.data||[])for(const odd of Object.values(event.odds||{}) as any[]){const key=[odd.statID,odd.periodID,odd.sideID].join('|');supplementCategories.set(key,(supplementCategories.get(key)||0)+1)}
 const supplementGames=sgoBookGames(supplement);
 const supplementalCoverage={warning:supplement?.warning||null,events:supplement?.data?.length||0,categories:Object.fromEntries(supplementCategories),namedBookQuotes:supplementGames.reduce((n:number,g:any)=>n+g.books.reduce((a:number,b:any)=>a+b.props.length,0),0),qualifyingQuarter:sport==='nfl'?Object.fromEntries(['passing_yards','receiving_yards','rushing_yards'].map(base=>['q1_'+base,footballBookRows({data:supplementGames},'q1_'+base,[base+'_1q','q1_'+base]).map(r=>({playerName:r.playerName,gameTime:r.gameTime,book:r.sportsbook,line:r.line}))])):undefined};
 const buckets=Object.entries(raw?.data||{}).map(([name,v]:[string,any])=>({name,fixtures:(v.fixtures||[]).length,markets:(v.markets||[]).map((m:any)=>({name:m.name,type:m.type,count:(m.outcomes||[]).length,example:(m.outcomes||[]).slice(0,2).map((o:any)=>({name:o.name,handicap:o.handicap,americanOdds:o.americanOdds,status:o.status,fixtureId:o.fixtureId,gameFixtureId:o.gameFixtureId}))}))}));
 return NextResponse.json({sport,merged:{games,error:merged.status==='rejected'?String(merged.reason?.message||'Feed unavailable'):null,categories:Object.fromEntries(categories),quarterSamples,qualifyingQuarter},bet365:{error:source.status==='rejected'?String(source.reason?.message||'Source unavailable'):null,status:raw?.meta?.status,cacheTimestamp:raw?.meta?.cacheTimestamp,buckets},supplement: supplementalCoverage,archive,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}
