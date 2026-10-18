"use client";
import { useEffect } from "react";
import { adminAuthFragment, adminAuthReturn } from "@/lib/admin-auth-return";
/** A provider may return to the configured home URL instead of the requested path. */
export function AdminAuthReturn() {
  useEffect(() => {
    if (window.location.pathname === "/admin/login") return;
    const result = adminAuthReturn(window.location.search, window.location.hash);
    if (result.kind === "none" || result.kind === "code") return;
    const fragment = adminAuthFragment(result);
    // Move one-use authentication data into the fragment, never an API query.
    window.history.replaceState(null, "", window.location.pathname);
    window.location.replace(`/admin/login${fragment}`);
  }, []);
  return null;
}
