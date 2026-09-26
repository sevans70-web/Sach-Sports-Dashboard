import {CbbDashboard} from "@/components/cbb-dashboard";
import {loadCbbOverview} from "@/lib/cbb";
export const dynamic="force-dynamic";
export default async function CbbPage(){const data=await loadCbbOverview();return <CbbDashboard data={data}/>}
