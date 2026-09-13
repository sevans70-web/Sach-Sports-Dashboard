import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const apiKey = process.env.OWLS_INSIGHT_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok:false, error:"OWLS_INSIGHT_API_KEY is missing from Railway." }, { status:500 });
  }

  try {
    const r = await fetch("https://api.owlsinsight.com/api/v1/ncaaf/props", {
      headers: { Authorization:`Bearer ${apiKey}`, Accept:"application/json" },
      cache:"no-store"
    });
    const text = await r.text();
    let data:any;
    try { data=JSON.parse(text); } catch { data={raw:text.slice(0,4000)}; }

    if (!r.ok) {
      return NextResponse.json({
        ok:false,
        upstreamStatus:r.status,
        upstreamStatusText:r.statusText,
        owlsResponse:data
      }, { status:r.status });
    }

    const raw=JSON.stringify(data).toLowerCase();
    return NextResponse.json({
      ok:true,
      source:"Owls Insight",
      testedEndpoint:"/api/v1/ncaaf/props",
      upstreamStatus:r.status,
      arizonaDetected:raw.includes("arizona"),
      byuDetected:raw.includes("byu"),
      meta:data?.meta ?? null,
      owls:data
    });
  } catch (e) {
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)}, {status:500});
  }
}
