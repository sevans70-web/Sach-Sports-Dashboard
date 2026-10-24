import {NextRequest,NextResponse} from 'next/server';
import {SEARCH_LEAGUES,playerPageHref} from '@/lib/player-search';
import {providerFetch} from '@/lib/provider-fetch';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const p=req.nextUrl.searchParams,sport=p.get('sport')||'',id=p.get('id')||'',league=p.get('league')||'';
 if(!SEARCH_LEAGUES[sport]||!/^\d{1,12}$/.test(id)||(sport==='soccer'&&!/^[a-z0-9._-]{1,40}$/.test(league)))return NextResponse.json({error:'Invalid player'},{status:400});
 let athlete:any=null;
 try{const path=SEARCH_LEAGUES[sport]+(sport==='soccer'?'/'+league:'');const r=await providerFetch(`https://site.api.espn.com/apis/common/v3/sports/${path}/athletes/${id}`);if(r.ok){const data=await r.json();if(String(data.athlete?.id)===id)athlete=data.athlete;}}catch{}
 const href=playerPageHref({sport,id,source:'espn',name:athlete?.displayName||p.get('name')||'Player',team:athlete?.team?.displayName||p.get('team')||'',image:athlete?.headshot?.href||p.get('img')||'',position:athlete?.position?.abbreviation||'',league});
 // The proxy's request origin can be 0.0.0.0:8080. A relative Location keeps
 // navigation on the browser's public origin without trusting forwarded hosts.
 return new NextResponse(null,{status:307,headers:{Location:href,'Cache-Control':'no-store'}});
}
