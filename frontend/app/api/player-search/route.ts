import {NextRequest,NextResponse} from 'next/server';
import {searchName,searchPlayers} from '@/lib/player-search';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const query=(req.nextUrl.searchParams.get('q')||'').trim();
 if(searchName(query).length<2)return NextResponse.json({success:true,players:[],partial:false});
 if(query.length>100)return NextResponse.json({success:false,players:[],error:'Please use a shorter player name.'},{status:400});
 try{return NextResponse.json(await searchPlayers(query),{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({success:false,players:[],error:'Player search is temporarily unavailable. Please try again.'},{status:503});}
}
