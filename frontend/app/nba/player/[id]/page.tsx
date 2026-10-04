import { UnifiedPlayerCard } from "@/components/unified-player-card";

export const dynamic = "force-dynamic";

export default async function NBAPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<Record<string, string>> | Record<string, string>;
  searchParams: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const resolvedParams = await params;
  const resolvedSearch = await searchParams;
  return (
    <UnifiedPlayerCard
      sport="nba"
      playerId={String(resolvedParams.id || "")}
      query={resolvedSearch}
    />
  );
}
