import { PlatformHeader } from "@/components/platform-header";
import { SportCard } from "@/components/sport-card";
import { sports } from "@/lib/sports";

export default function HomePage() {
  return (
    <main className="pageShell">
      <PlatformHeader />
      <section className="hero">
        <p className="kicker">One platform. Every league.</p>
        <h1>Research the slate.<br /><span>Understand the play.</span></h1>
        <p className="heroCopy">A stable, mobile-first foundation for game intelligence, player props, performance and future sportsbook connections.</p>
      </section>
      <section>
        <div className="sectionTitle"><div><p>Sport Hub</p><h2>Choose a league</h2></div><span>{sports.length} destinations</span></div>
        <div className="sportGrid">{sports.map((sport) => <SportCard key={sport.slug} sport={sport} />)}</div>
      </section>
    </main>
  );
}
