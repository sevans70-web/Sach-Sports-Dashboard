import { SoccerGames } from "@/components/soccer-games";
import "../soccer.css";

export default async function SoccerGamesPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="pageShell mlbPage soccerPage">
      <SoccerGames initialLeague={params.league || "eng.1"} />
    </main>
  );
}
