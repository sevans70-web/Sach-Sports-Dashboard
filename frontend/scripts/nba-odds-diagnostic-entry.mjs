/** Diagnostic-only overlay; all other requests remain on the approved fallback. */
import {getOwlsPayload,owlsFailureCategory} from '../lib/owls-provider';
import {readNbaFeedDiagnostic} from '../lib/nba-feed-sample';
import {nbaPopulationResponse,createNbaOfficialDiagnostic} from '../lib/nba-population-diagnostic';
const official=createNbaOfficialDiagnostic();
export function isNbaOddsDiagnostic(request){const u=new URL(request.url);return request.method==='GET'&&u.pathname==='/api/market-coverage'&&u.searchParams.get('sport')==='nba'&&['feed-sample','feed-census','source-census'].includes(u.searchParams.get('mode'));}
export async function handleNbaOddsDiagnostic(request){
 const q=new URL(request.url).searchParams;
 if(q.get('mode')==='source-census')return official(request);
 if(q.get('mode')!=='feed-census')return readNbaFeedDiagnostic(q,()=>getOwlsPayload('nba'),owlsFailureCategory);
 if([...q.keys()].some(k=>!['sport','mode'].includes(k)||q.getAll(k).length!==1))return Response.json({error:'The census exports all seven markets; no filters or pagination.'},{status:400});
 try{if(request.signal.aborted)throw request.signal.reason;const payload=await getOwlsPayload('nba');return nbaPopulationResponse(payload,new Date().toISOString(),request.signal);}
 catch(error){const reason=/^census_[a-z_]+$/.test(String(error?.message))?error.message:owlsFailureCategory(error);return Response.json({error:'Complete NBA census unavailable',reason},{status:503,headers:{'Cache-Control':'no-store'}});}
}
