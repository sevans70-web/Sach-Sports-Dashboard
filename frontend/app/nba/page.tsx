import {NbaDashboard} from "@/components/nba-dashboard";
import {loadNbaOverview} from "@/lib/nba";
export const dynamic="force-dynamic";
export default async function NbaPage(){const data=await loadNbaOverview();return <NbaDashboard data={data}/>}
