/** Diagnostic-only overlay; all other requests remain on the approved fallback. */
import {getOwlsPayload,owlsFailureCategory} from '../lib/owls-provider';
import {readNbaFeedDiagnostic} from '../lib/nba-feed-sample';
export function isNbaOddsDiagnostic(request){const u=new URL(request.url);return request.method==='GET'&&u.pathname==='/api/market-coverage'&&u.searchParams.get('sport')==='nba'&&u.searchParams.get('mode')==='feed-sample';}
export function handleNbaOddsDiagnostic(request){return readNbaFeedDiagnostic(new URL(request.url).searchParams,()=>getOwlsPayload('nba'),owlsFailureCategory);}
