import { redirect } from "next/navigation";

export default async function LegacySoccerGameRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const route = await params;
  const query = await searchParams;

  const paramsOut =
    new URLSearchParams({
      game: route.gameId,
      league:
        query.league || "eng.1",
    });

  redirect(
    `/soccer/games?${paramsOut.toString()}`
  );
}
