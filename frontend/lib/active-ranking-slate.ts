export function activeRankingSlate<T extends {tipoff?:string|null;state?:string}>(games:T[],day:(v:Date|string)=>string,now=new Date()):T[]{
 const today=day(now);
 const retainedDays=new Set(games.filter(g=>g.state==='in'&&g.tipoff).map(g=>day(g.tipoff!)));
 if(games.some(g=>g.state!=='post'&&g.tipoff&&day(g.tipoff)===today))retainedDays.add(today);
 // A slate is a whole calendar day, including games already completed.
 // Retain those originals while another game from that day is still live.
 const current=games.filter(g=>g.tipoff&&retainedDays.has(day(g.tipoff)));
 if(current.length)return current;
 const future=games.filter(g=>g.state!=="post"&&g.tipoff&&Date.parse(g.tipoff)>now.getTime()).sort((a,b)=>Date.parse(a.tipoff!)-Date.parse(b.tipoff!));
 if(!future.length)return [];
 const next=day(future[0].tipoff!);return future.filter(g=>day(g.tipoff!)===next);
}
