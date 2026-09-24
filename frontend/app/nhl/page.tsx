import {NhlDashboard} from "@/components/nhl-dashboard";
import {loadNhlOverview} from "@/lib/nhl";
export const dynamic="force-dynamic";
export default async function NhlPage(){const data=await loadNhlOverview();return <NhlDashboard data={data}/>}
