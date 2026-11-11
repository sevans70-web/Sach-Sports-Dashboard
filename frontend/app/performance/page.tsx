import Link from 'next/link';
import {PredictionPerformancePanel} from '@/components/prediction-performance-panel';
import {VISIBLE_SPORTS,type DashboardSport} from '@/lib/dashboard-contract';
export const metadata={title:'Prediction Performance | Sach Sports'};
export default async function PerformancePage({searchParams}:{searchParams:Promise<{sport?:string|string[]}>}){
 const query=await searchParams,allowed=VISIBLE_SPORTS.filter(s=>s!=='soccer');
 const requested=typeof query.sport==='string'?query.sport:'';
 const sport:DashboardSport=allowed.some(s=>s===requested)?requested as DashboardSport:'nba';
 return <main className="ssDashboard ssPerformanceDashboard">
  <header className="ssPerformancePageHead"><Link href={`/${sport}`}>‹ Back to {sport.toUpperCase()} Intelligence</Link><h1>{sport.toUpperCase()} Results &amp; History</h1></header>
  <PredictionPerformancePanel key={sport} sport={sport}/>
 </main>;
}
