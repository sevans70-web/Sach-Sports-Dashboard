import Link from "next/link";
import { PlatformHeader } from "@/components/platform-header";

const tabs = ["Intelligence", "Games", "Player Props", "Performance"];
const markets = ["Points", "Rebounds", "Assists", "3-Pointers", "Blocks", "Steals"];

export default function WnbaPage() {
  return (
    <main className="pageShell">
      <PlatformHeader league="WNBA" />
      <section className="leagueHero">
        <div><p className="kicker">Women’s Basketball</p><h1>WNBA <span>Game Intelligence</span></h1></div>
        <div className="seasonBadge"><span /> Season active</div>
      </section>
      <nav className="tabBar" aria-label="WNBA sections">{tabs.map((tab, index) => <button className={index === 0 ? "selected" : ""} key={tab}>{tab}</button>)}</nav>
      <section className="previewNotice"><strong>Migration foundation</strong><p>The new interface is isolated from the live dashboard. Real WNBA calculations and data will be connected after the structure is approved.</p></section>
      <section>
        <div className="sectionTitle"><div><p>Today’s WNBA</p><h2>Player prop markets</h2></div><Link href="/">Sport Hub →</Link></div>
        <div className="marketGrid">{markets.map((market) => <button key={market}><span>{market}</span><small>Rankings will connect in the data phase</small><b>Open market →</b></button>)}</div>
      </section>
    </main>
  );
}
