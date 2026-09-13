import { NextResponse } from "next/server";
import { parseOwlsSoccerProps } from "@/lib/owls-soccer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const apiKey = process.env.OWLS_INSIGHT_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OWLS_INSIGHT_API_KEY is missing from Railway." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch("https://api.owlsinsight.com/api/v1/soccer/props", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await response.text();
    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 8000) };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          upstreamStatus: response.status,
          upstreamStatusText: response.statusText,
          owlsResponse: data,
        },
        { status: response.status },
      );
    }

    const props = parseOwlsSoccerProps(data);
    const counts = props.reduce<Record<string, number>>((acc, prop) => {
      acc[prop.metric] = (acc[prop.metric] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      ok: true,
      source: "Owls Insight",
      testedEndpoint: "/api/v1/soccer/props",
      upstreamStatus: response.status,
      parsedProps: props.length,
      counts,
      sample: props.slice(0, 25),
      meta: data?.meta ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
