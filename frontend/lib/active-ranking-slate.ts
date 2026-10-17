export function activeRankingSlate<T extends {tipoff?:string|null;state?:string}>(games:T[],day:(v:Date|string)=>string,now=new Date()):T[]{
 const today=day(now);
 const current=games.filter(g=>g.state==="in"||(g.state!=="post"&&g.tipoff&&day(g.tipoff)===today));
 if(current.length)return current;
 const future=games.filter(g=>g.state!=="post"&&g.tipoff&&Date.parse(g.tipoff)>now.getTime()).sort((a,b)=>Date.parse(a.tipoff!)-Date.parse(b.tipoff!));
 if(!future.length)return [];
 const next=day(future[0].tipoff!);return future.filter(g=>day(g.tipoff!)===next);
}
