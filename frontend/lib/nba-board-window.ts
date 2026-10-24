import {dashboardDay} from '@/lib/dashboard-contract';
export function nbaBoardDates(now=new Date()){
 const today=dashboardDay(now),noon=Date.parse(today+'T12:00:00Z');
 return {previous:dashboardDay(new Date(noon-86400000)),today,tomorrow:dashboardDay(new Date(noon+86400000))};
}
/** Keep the entire original slate while any of its fixtures remains live. */
export function activeNbaBoardDay(games:any[],now=new Date()){
 const dates=nbaBoardDates(now);
 const liveDays=games.filter(g=>g.state==='in').map(g=>dashboardDay(g.tipoff||g.date||''))
  .filter(day=>day&&day<=dates.today).sort();
 return liveDays[0]||dates.today;
}
