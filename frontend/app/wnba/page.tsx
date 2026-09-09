import { PlatformHeader } from "@/components/platform-header";
import { WnbaDashboard } from "@/components/wnba-dashboard";
import { loadWnbaOverview } from "@/lib/wnba";
import "./wnba.css";

export const dynamic = "force-dynamic";

export default async function WnbaPage() {
  const data = await loadWnbaOverview();
  return (
    <main className="pageShell">
      <PlatformHeader league="WNBA" />
      <section className="leagueHero">
        <div><p className="kicker">Women’s Basketball</p><h1>WNBA <span>Game Intelligence</span></h1></div>
        <div className="seasonBadge"><span /> Season active</div>
      </section>
      <WnbaDashboard data={data} />
    </main>
  );
}
