import { redirect } from "next/navigation";

export default async function LegacyGameRedirect({
  params,
}: {
  params: Promise<{ gamePk: string }>;
}) {
  const route = await params;
  redirect(
    "/mlb/games?game=" +
      encodeURIComponent(route.gamePk)
  );
}
