import Link from "next/link";
import { SoccerDashboard } from "@/components/soccer-dashboard";
import "./soccer.css";

export default function SoccerPage(){
  return <main className="pageShell mlbPage soccerPage">
    <div className="mlbTopNav"><Link className="mlbMenu" href="/" aria-label="Open menu">▦⌄</Link></div>
    <SoccerDashboard/>
  </main>
}
