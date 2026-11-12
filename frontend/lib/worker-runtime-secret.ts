/**
 * Cloudflare staging-only runtime secret reader.
 * Reads Workers bindings directly rather than relying on Node process.env
 * population, which can differ between runtimes/framework adapters.
 * Never log, return to an API response, or cache the secret values.
 */
import { env } from "cloudflare:workers";

export function workerRuntimeSecret(name: string): string {
  const binding = workerRuntimeBinding(name);
  if (typeof binding === "string" && binding.trim()) return binding.trim();
  const fallback = process.env[name];
  return typeof fallback === "string" ? fallback.trim() : "";
}

export function workerRuntimeBinding(name: string): unknown {
  return (env as unknown as Record<string, unknown>)[name];
}
