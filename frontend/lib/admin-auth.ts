import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_EMAIL, isAdminUser, sameOriginMutation } from "@/lib/admin-policy";

export const ACCESS_COOKIE = "sach-admin-access";
export const REFRESH_COOKIE = "sach-admin-refresh";
export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" };
export function authClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Admin authentication is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store", signal: AbortSignal.timeout(10000) }) } });
}
export function adminJson(data: any, status = 200) { return NextResponse.json(data, { status, headers: privateHeaders }); }
export function mutationAllowed(req: NextRequest) {
  return sameOriginMutation(req.headers.get("origin"), dashboardOrigin(req), req.headers.get("sec-fetch-site"));
}
export function dashboardOrigin(req: NextRequest) {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : new URL(`${req.nextUrl.protocol}//${req.headers.get("host") || req.nextUrl.host}`).origin;
}
export async function currentAdmin(token?: string) {
  const access = token || (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!access || access.length > 8000) return null;
  try {
    const { data, error } = await authClient().auth.getUser(access);
    return !error && isAdminUser(data.user) ? data.user : null;
  } catch { return null; }
}
export function setAdminSession(response: NextResponse, session: any) {
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
  response.cookies.set(ACCESS_COOKIE, session.access_token, { ...options, maxAge: Math.min(Number(session.expires_in) || 3600, 3600) });
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, { ...options, maxAge: 7 * 86400 });
  return response;
}
export function clearAdminSession(response: NextResponse) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) response.cookies.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
// Bounded per-process limiter supplements Supabase's provider-side rate limits.
const attempts = new Map<string, { count: number; until: number }>();
export function allowAuthAttempt(req: NextRequest, action: string) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 100);
  const keys = [`${action}|${ip}`, `${action}|${ADMIN_EMAIL}`];
  if (attempts.size > 10000) return false;
  const limit = action === "email" ? 3 : 15;
  if (keys.some(key => (attempts.get(key)?.count || 0) >= limit)) return false;
  for (const key of keys) { const value = attempts.get(key) || { count: 0, until: now + 10 * 60000 }; value.count++; attempts.set(key, value); }
  return true;
}
