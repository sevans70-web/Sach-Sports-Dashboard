/** Parse only known Auth return fields. Never copy arbitrary redirect targets. */
export function adminAuthReturn(search: string, hash: string) {
  const query = new URLSearchParams(search), fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const get = (key: string) => fragment.get(key) || query.get(key) || "";
  if (get("error") || get("error_description")) return { kind: "error" as const };
  const accessToken = get("access_token"), refreshToken = get("refresh_token");
  if (accessToken && refreshToken) return { kind: "session" as const, accessToken, refreshToken };
  const tokenHash = get("token_hash"), type = get("type") || "email";
  if (tokenHash && ["email", "signup", "magiclink", "recovery", "invite"].includes(type)) return { kind: "token" as const, tokenHash, type };
  if (get("code")) return { kind: "code" as const };
  return { kind: "none" as const };
}
export function adminAuthFragment(result: ReturnType<typeof adminAuthReturn>) {
  const params = new URLSearchParams();
  if (result.kind === "session") { params.set("access_token", result.accessToken); params.set("refresh_token", result.refreshToken); }
  if (result.kind === "token") { params.set("token_hash", result.tokenHash); params.set("type", result.type); }
  if (result.kind === "error") params.set("error", "email_link_expired");
  if (result.kind === "code") params.set("code", "unsupported_return");
  return params.size ? `#${params}` : "";
}
/** Redeem only the configured provider's verification link; never fetch its redirect. */
export function adminEmailLink(value: string, provider: string) {
  try {
    const url = new URL(value), configured = new URL(provider);
    if (url.origin !== configured.origin || url.pathname !== "/auth/v1/verify" || url.username || url.password) return null;
    const tokenHash = url.searchParams.get("token_hash") || url.searchParams.get("token") || "";
    const type = url.searchParams.get("type") || "email";
    if (!tokenHash || tokenHash.length > 1024 || !["email", "signup", "magiclink", "recovery", "invite"].includes(type)) return null;
    return { tokenHash, type };
  } catch { return null; }
}
