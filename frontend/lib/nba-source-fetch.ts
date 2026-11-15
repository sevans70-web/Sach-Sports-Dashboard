import {nbaOfficialFetch} from '@/lib/official-history-source';
import {providerFetch} from '@/lib/provider-fetch';
import {assertNbaRankingActive,nbaRankingSignal} from '@/lib/nba-ranking-work';
export function nbaSourceFetch(input:string|URL|Request,init:RequestInit={}){assertNbaRankingActive();const options={...init,signal:nbaRankingSignal(init.signal||AbortSignal.timeout(8000))};const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;return url.includes('/sports/basketball/nba/')?nbaOfficialFetch(url,options):providerFetch(input,options);}
