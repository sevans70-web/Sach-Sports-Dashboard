import {dashboardDay} from '@/lib/dashboard-contract';
export function historyDays(period:string,now=new Date()){
 const count=period==='Week'?7:period==='Month'?31:period==='Season'?370:1,offset=period==='Yesterday'?1:0;
 // Subtract calendar days, not 24-hour durations across Toronto DST changes.
 const anchor=Date.parse(dashboardDay(now)+'T12:00:00Z');
 return new Set(Array.from({length:count},(_,i)=>new Date(anchor-(i+offset)*86400000).toISOString().slice(0,10)));
}
