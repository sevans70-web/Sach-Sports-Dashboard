import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "sach-sports-dashboard",
      status: "ready",
      commit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
      forecastRelease: "workload-research-v1",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
