import { NextRequest } from "next/server";
import { ACCESS_COOKIE, adminJson, currentAdmin, mutationAllowed } from "@/lib/admin-auth";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!mutationAllowed(req)) return adminJson({ error: "This request must come from the dashboard." }, 403);
  if (!await currentAdmin()) return adminJson({ error: "Administrator sign-in required." }, 401);
  try {
    const { password } = await req.json();
    if (typeof password !== "string" || password.length < 12 || password.length > 128) return adminJson({ error: "Choose a password between 12 and 128 characters." }, 400);
    // Supabase validates the user's access token; never perform an admin reset.
    const access = req.cookies.get(ACCESS_COOKIE)?.value;
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    const r = await fetch(`${url}/auth/v1/user`, { method: "PUT", headers: { apikey: key!, Authorization: `Bearer ${access}`, "Content-Type": "application/json" }, body: JSON.stringify({ password }), cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!r.ok) return adminJson({ error: "Password could not be saved. Sign in again and retry." }, 400);
    return adminJson({ success: true });
  } catch { return adminJson({ error: "Password could not be saved." }, 503); }
}
