import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformHeader } from "@/components/platform-header";
import { sports } from "@/lib/sports";

export default async function SportPage({ params }: { params: Promise<{ sport: string }> }) {
  const { sport: slug } = await params;
  const sport = sports.find((item) => item.slug === slug);
  if (!sport || slug === "wnba") notFound();
  return (
    <main className="pageShell">
      <PlatformHeader league={sport.league} />
      <section className="leagueHero"><div><p className="kicker">{sport.name}</p><h1>{sport.league} <span>Foundation</span></h1></div></section>
      <section className="previewNotice"><strong>Planned migration</strong><p>{sport.league} remains available in the current Streamlit platform. It will move here only after the WNBA foundation is approved.</p></section>
      <Link className="backLink" href="/">← Return to Sport Hub</Link>
    </main>
  );
}
