import { SoccerGame } from "@/components/soccer-game";
import "../../soccer.css";

export default async function SoccerGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const route = await params;
  const query = await searchParams;
  return (
    <main className="pageShell mlbPage soccerPage">
      <SoccerGame gameId={route.gameId} league={query.league || "eng.1"} />
    </main>
  );
}
