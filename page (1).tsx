import {WnbaDashboard} from "@/components/wnba-dashboard";
import {loadWnbaOverview} from "@/lib/wnba";
export const dynamic="force-dynamic";
export default async function WnbaPage(){const data=await loadWnbaOverview();return <WnbaDashboard data={data}/>}
