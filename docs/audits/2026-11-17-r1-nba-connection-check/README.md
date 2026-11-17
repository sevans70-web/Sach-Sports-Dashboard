# R1 real NBA history connection check — preview invocation blocked

From `cfbeef0`, existing `cloudflare-compatibility-test` branch. Issue129 was reviewed. The48targeted checks and earlier investigations were not repeated. **R1 was not deployed; no live NBA history pass is claimed.**

## Minimum test and isolation

Prepared `frontend/scripts/nba-readonly-connection-probe.mjs` for a private, temporary Cloudflare remote preview in the existing account. It has no bindings, schedule, database/KV access, model fitting or record writes. Its sole target is the existing public NBA gamelog URL for player3064482,season2027. It uses the corrected initial application identity, JSON Accept, `no-store`, manual redirects and an8second timeout; no alternate host, header switch or retry. Response reading is capped at2MiB. On execution it reports status, selected non-sensitive headers, duration, JSON/schema validity, body checksum and a bounded sample of legitimate regular-season history before the existing48-hour lag. It never generates predictions.

The installed `@cloudflare/vite-plugin` implementation documents the remote-preview API/session flow (`createPreviewSession`, `createWorkerPreview`, and `tryExpandToken`). This was used instead of a production script/version upload, account migration, new paid service or R1 deployment. Normal dashboard requests do not carry the private preview credential. No API/preview credentials are included in these artifacts.

## Actual results

| Stage | Observed result |
|---|---|
| Initial preview upload |HTTP400/code10051, request-body parsing failed; no accepted script |
| SDK session creation |Authorized session issued |
| Optional exchange URL |HTTP403; not retried |
| Documented original-session fallback, explicit multipart upload |Preview accepted |
| Single private preview invocation |**HTTP403**, non-JSON response,87bytes |
| Expected probe JSON/runtime marker |Not received |
| Verified ESPN HTTP status / body / history |**Unavailable** |
| Verified NBA request duration |**Unavailable**; the outer accepted-upload/invocation tool call took about5.9seconds, not an ESPN timing measurement |

The preview invocation response was not the probe's JSON envelope. Therefore it does **not** establish that ESPN was contacted, rejected the corrected profile, returned insufficient history, or succeeded. The currently demonstrated blocker is **verification-environment invocation/access**, with the precise network/authentication policy not identified. It is not an established ESPN subscription/provider restriction or an NBA model failure. Raw refusal body/headers were not retained; only the recorded status/format/length are available. Do not infer more detail from them.

The optional token expansion fallback is the SDK's existing behavior, using the already authorized original session; the refused exchange URL was not retried. After the private invocation403, no alternate network client, identity, host, provider, credential or access-control bypass was attempted. No private preview credential was copied out of the authenticated tool. The source is retained for a later authorized invocation; no persistent diagnostic service was installed.

## Protected state and verification limits

Read-only Cloudflare deployment checks before/after show the same active fallback deployment `4699c3c4-5067-4347-b3b7-9d205fee5085`, version `a48c431a-5c3e-4491-8529-38cb20dfa898` at100%. Automatic dashboard builds retain the paused exclusion. CW08 retains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` /version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`. No production data, binding, sharing, backup, model or research-table changes were made.

Only probe syntax and evidence consistency were checked locally. No broad test rerun, dashboard compilation or simulated connection result was substituted for live evidence. Since the real connection gate did not pass, additional NBA Points/six-market checks were not run and sufficient cold-start history remains **unverified**.

## Smallest next step

Resolve legitimate access to an authenticated **private Cloudflare preview invocation**, then execute this already-prepared single-request probe. An account/session or integration-access review must distinguish a preview authentication/transport restriction from provider access before further testing. Keep the production Worker, paused builds, CW08 and production records unchanged. Do not enable public previews, deploy R1, rotate/request API tokens, buy a subscription or retry ESPN through alternate identities to overcome the blocker.

If that authorized invocation returns valid NBA history, inspect recent regular-season/stat coverage and then verify the seven markets against real observations. If it returns an ESPN denial, preserve its actual non-sensitive response diagnostics and use the provider's authorized support/access path. Neither decision can be made from this Cloudflare invocation403 alone. R1 remains blocked and no tracker row moves to100% complete.
