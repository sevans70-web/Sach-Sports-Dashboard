// Read-only N05 acceptance. Never marks a quote-only board complete.
import {writeFile} from 'node:fs/promises';
import {loadTs} from '../tests/load-ts.mjs';
const {verifiedPropQuote}=await loadTs(new URL('../lib/prop-integrity.ts',import.meta.url));
const {cardModelProjection,cardModelPick}=await loadTs(new URL('../lib/saved-model-pick.ts',import.meta.url));
const {footballForecastDisplay}=await loadTs(new URL('../lib/football-forecast-display.ts',import.meta.url));
const destination=process.argv[2];
if(!destination)throw Error('An exclusive-create report path is required');
const base=(process.env.N05_BASE_URL||'https://marvelous-wholeness-production-c8d3.up.railway.app').replace(/\/$/,'');
const checks=[['nfl',['q1_passing_yards','q1_rushing_yards','q1_receiving_yards']],['nba',['q1_points','q1_rebounds','q1_assists','q1_threes_made']]];
const report={checkedAt:new Date().toISOString(),scope:['nfl','nba'],complete:false,markets:[]};
for(const [sport,markets] of checks)for(const market of markets){
 const url=base+'/api/'+sport+'/rankings?market='+market;
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(60000)}),p=await r.json(),at=Date.now();
  if(!r.ok||p.success!==true||p.market!==market||!Array.isArray(p.rows))throw Error('Invalid ranking response: HTTP '+r.status);
  if(p.rows.some(row=>row.market!==market))throw Error('Mismatched row market');
  const rows=p.rows,quoted=rows.filter(row=>verifiedPropQuote(row,at,row.boardFrozen===true));
  const main=quoted.filter(row=>row.lineType==='main'),milestones=quoted.filter(row=>row.lineType==='milestone');
  const projected=quoted.filter(row=>cardModelProjection(row,at)!=null);
  const directed=main.filter(row=>['OVER','UNDER'].includes(cardModelPick(row,at)?.side||footballForecastDisplay(row,at).side));
  const reasons={};for(const row of quoted){const reason=row.researchForecast?.reason||row.researchForecast?.selectionReason;if(reason)reasons[reason]=(reasons[reason]||0)+1;}
  const gaps=[];
  if(!quoted.length)gaps.push('no_verified_current_quarter_quotes');
  if(!main.length)gaps.push('no_verified_two_way_quarter_contract');
  if(!projected.length)gaps.push('no_supported_numeric_quarter_projection');
  if(!directed.length)gaps.push('no_supported_over_under_forecast');
  if(rows.length!==quoted.length)gaps.push('unverified_or_expired_rows');
  report.markets.push({sport,market,httpStatus:r.status,rowCount:rows.length,verifiedQuotes:quoted.length,mainPairs:main.length,milestones:milestones.length,numericForecasts:projected.length,directionalForecasts:directed.length,reasons,gaps,complete:gaps.length===0});
 }catch(error){report.markets.push({sport,market,gaps:[String(error.message)],complete:false});}
 console.log(JSON.stringify(report.markets.at(-1)));
}
report.complete=report.markets.every(m=>m.complete);
await writeFile(destination,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({complete:report.complete,report:destination}));
if(!report.complete)process.exitCode=2;
