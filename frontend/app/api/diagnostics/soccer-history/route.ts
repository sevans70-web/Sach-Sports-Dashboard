import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league") || "eng.1";
  const origin = req.nextUrl.origin;

  const response = await fetch(
    `${origin}/api/soccer/dashboard?league=${encodeURIComponent(league)}`,
    { cache: "no-store" },
  );

  const data = await response.json();

  return NextResponse.json(
    {
      ok: Boolean(data?.success),
      league,
      propSource: data?.propSource ?? null,
      propCounts: data?.propCounts ?? null,
      owls: data?.owls ?? null,
      historyDiagnostics: data?.historyDiagnostics ?? null,
      errors: data?.errors ?? [],
    },
    { status: response.ok ? 200 : response.status },
  );
}
