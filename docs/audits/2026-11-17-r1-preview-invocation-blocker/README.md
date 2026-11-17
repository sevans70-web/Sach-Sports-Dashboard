# R1 private-preview403 — invocation-client restriction identified

From `16e310a`; Issue129 reviewed. **One focused private-preview invocation was attempted; no further invocation or ESPN request was attempted after refusal. R1 remains blocked.** Existing48checks and previous investigations were reused, not rerun.

## Account, session and SDK checks

- The configured account subdomain is `sevans70`. The previous invocation hostname was correct.
- Read-only Worker configuration reports `enabled:true,previews_enabled:true` both before/after. These were **existing values**; no preview setting was enabled or changed.
- The account Access-app lookup for the exact Worker hostname succeeded and returned no matching application. This targeted lookup does not rule out every wildcard policy, but the decisive refusal below occurs in the invocation client rather than an Access login flow.
- Authenticated Workers API session creation and temporary binding-free preview upload succeeded. There is no observed Workers API permission error in those stages.
- The installed `@cloudflare/vite-plugin/dist/index.mjs` remote SDK creates the session/token, uses the existing original-token fallback if optional expansion fails, and invokes the preview host with `cf-workers-preview-token`, optional authenticated Access headers, and an empty `cf-connecting-ip` proxy header. The previous attempt omitted that final proxy header and did not retain the refusal body.

## One focused attempt and actual response

At2026-11-17 12:35:12.925PM Toronto, the already-prepared fixed-endpoint NBA probe was uploaded as a private temporary remote preview with zero bindings and no schedule. No R1/version/production upload was used. The optional refused exchange URL was not revisited. The invocation used the SDK-equivalent preview/proxy headers and manual redirect handling; all session/preview credentials stayed inside the authenticated execution call and were excluded from returned diagnostics.

The single invocation returned:

```text
HTTP403
Content-Type: text/plain;charset=UTF-8
Duration:6ms
Body:87bytes, non-JSON
Forbidden: requests to sach-sports-cloudflare-test.sevans70.workers.dev are not allowed
```

No `Server`, `CF-Ray`, `CF-Mitigated`, `WWW-Authenticate` or redirect `Location` header was present. No diagnostic JSON envelope was received.

**Identified blocker:** this integration's `fetch` invocation client disallows requests to the `workers.dev` hostname. The text explicitly identifies a destination-host restriction, not an expired preview credential, failed account token, missing public-preview setting or ESPN response. Session creation/upload permissions alone do not authorize this execution client's outbound destinations. Changing Cloudflare account credentials or enabling public previews is not justified by this evidence.

The6ms measurement belongs to the denied preview invocation, not an NBA request. ESPN status, response validity, history sufficiency and origin duration remain unverified. No provider/model conclusion or cold-start pass can be drawn. Seven-market follow-up remains gated on an actual source response.

## Safest alternative

Use a **standard authenticated private-preview client outside this restricted integration**, with its own existing authorized session. The narrow option is the previously used Cloudflare manual environment, configured for a reviewed diagnostic-only run with its production-deployment stage disabled; run the installed SDK's normal private remote-preview flow and this existing one-request probe. Keep automatic branch builds excluded and restore any temporary manual commands. Do not upload R1, add storage bindings, modify records or introduce a paid service.

That is a distinct authorized execution path to review before use, not permission to transfer preview credentials out of this integration, proxy around its host restriction, change destination identities or retry the refused request here. No such alternate invocation was made in this task. An already authenticated Cloudflare Dashboard private-preview session is another operator-controlled option; production code must not be saved/deployed.

If the authorized client receives the probe JSON, preserve the real NBA status, sanitized headers, validity, duration and historical coverage. Only then decide whether the remaining issue is provider authorization, request transport or missing history. No R1 deployment approval is requested.

## State and evidence

Before/after deployment and configuration records confirm active fallback4699c3c4/versiona48c431a100%, unchanged preview settings, paused automatic builds and unchanged CW08 deployment39ea465b/version46e95f99. No production record, binding, backup, credential or research-table changes occurred. The only runtime code used was the prior binding-free probe. No dashboard code changed, broad tests ran or purchases occurred. Evidence JSON consistency was checked; tracker and Issue129 were updated, with no100%closure.
