import {NextRequest,NextResponse} from 'next/server';
import {includedResearchSource} from '@/lib/owls-research-source';
export const dynamic='force-dynamic';
const index=(value:string|null)=>value===null?null:/^(0|[1-9][0-9]{0,2})$/.test(value)?Number(value):NaN;
export async function GET(req:NextRequest){
 const q=req.nextUrl.searchParams,sport=q.get('sport'),day=index(q.get('day')),game=index(q.get('game')),entry=index(q.get('entry'));
 if(!['nfl','nba'].includes(sport||'')||day===null||![day,game,entry].every(v=>v===null||Number.isInteger(v))||entry!==null&&game===null)return NextResponse.json({error:'Invalid fixed research selection'},{status:400});
 try{return NextResponse.json(await includedResearchSource(sport as 'nfl'|'nba',day,game,entry),{headers:{'Cache-Control':'no-store'}})}
 catch(e:any){const error=String(e?.message||'Research source unavailable');return NextResponse.json({error},{status:error.startsWith('Invalid')?400:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}})}
}
