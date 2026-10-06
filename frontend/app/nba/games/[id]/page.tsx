import { redirect } from "next/navigation";

export default async function LegacyGameRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const route = await params;
  redirect(
    "/nba/games?game=" +
      encodeURIComponent(route.id)
  );
}
