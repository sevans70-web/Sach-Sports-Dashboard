import { NextResponse } from "next/server";
import { getPerformance } from "@/lib/mlb-server";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ success: true, ...(await getPerformance()) }); }
