import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "sach-sports-cloudflare-test",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-06",
    compatibilityFlags: ["nodejs_compat"],
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
    },
  }),
});
