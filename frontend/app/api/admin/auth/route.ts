import { NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, adminJson, allowAuthAttempt, authClient, clearAdminSession, currentAdmin, dashboardOrigin, mutationAllowed, setAdminSession } from "@/lib/admin-auth";
import { ADMIN_EMAIL, isAdminUser } from "@/lib/admin-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await currentAdmin();
    if (user) return adminJson({ authenticated: true, email: ADMIN_EMAIL });
    // A cross-site GET must not refresh or replace authentication cookies.
    const site = req.headers.get("sec-fetch-site");
    if (site && !["same-origin", "none"].includes(site)) return adminJson({ authenticated: false }, 401);
    const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
    if (refresh) {
      const { data, error } = await authClient().auth.refreshSession({ refresh_token: refresh });
      if (!error && data.session && isAdminUser(data.user)) return setAdminSession(adminJson({ authenticated: true, email: ADMIN_EMAIL }), data.session);
    }
    authClient();
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    const provider = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!provider.ok) throw new Error("Auth provider unavailable");
    const settings = await provider.json();
    if (settings.external?.email === false) throw new Error("Email sign-in unavailable");
    return clearAdminSession(adminJson({ authenticated: false, configured: true }, 401));
  } catch { return adminJson({ authenticated: false, error: "Sign-in service is unavailable. Please try again shortly." }, 503); }
}
export async function POST(req: NextRequest) {
  if (!mutationAllowed(req)) return adminJson({ error: "This request must come from the dashboard." }, 403);
  if (Number(req.headers.get("content-length") || 0) > 16000) return adminJson({ error: "Request too large." }, 413);
  try {
    const body = await req.json(), action = String(body.action || "password");
    if (action === "logout") {
      const token = req.cookies.get(ACCESS_COOKIE)?.value;
      if (token) { const client = authClient(); await client.auth.admin.signOut(token, "local").catch(() => {}); }
      return clearAdminSession(adminJson({ success: true }));
    }
    if (!["password", "email", "verify", "callback"].includes(action)) return adminJson({ error: "Unsupported sign-in action." }, 400);
    if (!allowAuthAttempt(req, action)) return adminJson({ error: "Too many attempts. Please wait ten minutes before trying again." }, 429);
    const email = String(body.email || "").trim().toLowerCase();
    if (action !== "callback" && email !== ADMIN_EMAIL) return adminJson({ error: "This account does not have administrator access." }, 403);
    const client = authClient();
    if (action === "email") {
      const redirect = `${dashboardOrigin(req)}/admin/login`;
      const { error } = await client.auth.signInWithOtp({ email: ADMIN_EMAIL, options: { shouldCreateUser: true, emailRedirectTo: redirect } });
      if (error) return adminJson({ error: "The sign-in email could not be sent. Email delivery or allowed redirect settings may need attention." }, 502);
      return adminJson({ success: true, message: `Check ${ADMIN_EMAIL} for a sign-in link or verification code.` });
    }
    let session: any;
    if (action === "callback") {
      const token = String(body.accessToken || ""), refresh = String(body.refreshToken || "");
      if (!token || !refresh || token.length > 8000 || refresh.length > 8000 || !await currentAdmin(token)) return adminJson({ error: "This sign-in link is invalid or expired." }, 401);
      const { data, error } = await client.auth.setSession({ access_token: token, refresh_token: refresh });
      if (error || !isAdminUser(data.user)) return adminJson({ error: "This sign-in link is invalid or expired." }, 401);
      session = data.session;
    } else if (action === "verify") {
      if (!/^\d{6,8}$/.test(String(body.code || ""))) return adminJson({ error: "Enter the verification code from your email." }, 400);
      const { data, error } = await client.auth.verifyOtp({ email: ADMIN_EMAIL, token: String(body.code), type: "email" });
      if (error || !isAdminUser(data.user)) return adminJson({ error: "The code is invalid or expired." }, 401);
      session = data.session;
    } else {
      if (typeof body.password !== "string" || body.password.length > 1024) return adminJson({ error: "Enter your password." }, 400);
      const { data, error } = await client.auth.signInWithPassword({ email: ADMIN_EMAIL, password: body.password });
      if (error || !isAdminUser(data.user)) return adminJson({ error: "Sign-in failed. Check your email and password, or request an email sign-in." }, 401);
      session = data.session;
    }
    return session ? setAdminSession(adminJson({ authenticated: true, email: ADMIN_EMAIL }), session) : adminJson({ error: "Sign-in could not be completed." }, 401);
  } catch { return adminJson({ error: "Sign-in could not be completed. Please try again." }, 503); }
}
