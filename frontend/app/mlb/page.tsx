import Link from "next/link";
import { MlbDashboard } from "@/components/mlb-dashboard";
export default function MlbPage(){return <main className="pageShell mlbPage"><div className="mlbTopNav"><Link className="mlbMenu" href="/" aria-label="Open menu">▦⌄</Link></div><MlbDashboard/></main>}
