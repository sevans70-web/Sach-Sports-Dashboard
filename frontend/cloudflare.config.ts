import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "sach-sports-cloudflare-test",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-06",
    compatibilityFlags: ["nodejs_compat"],
    limits: { subrequests: 200 },
    observability: {
      enabled: true,
      headSamplingRate: 1,
      redactQueryString: true,
      logs: { enabled: true, invocationLogs: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.1 },
    },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // Preserve the existing staging namespace confirmed in the deployment diff.
      VINEXT_KV_CACHE: bindings.kv({ id: "644df6a469e84dba90c8f7dac410f895" }),
      OWLS_INSIGHT_API_KEY: bindings.secret(),
      SPORTSGAMEODDS_API_KEY: bindings.secret(),
      SUPABASE_URL: bindings.secret(),
    },
  }),
});
