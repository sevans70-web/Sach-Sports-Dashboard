# NBA odds diagnostic — final read-only preflight

**Decision: ready for diagnostic-only authorization; NOT uploaded. R1 remains blocked.**

From `434f1db` on `cloudflare-compatibility-test`. At **11:09PM Toronto, November21,2026**, read-only Cloudflare API checks and offline frozen reconstruction passed **12/12 checks, zero failures**. See `preflight-checks.json`. No application code changed, so the existing complete suite **892 passed / zero failed /17 optional skips**, TypeScript **zero diagnostics**, compiled diagnostic contracts and350 recorded NBA card checks are reused. These are not fresh production odds or ranking acceptance.

## Exact production state

- Worker `sach-sports-cloudflare-test`: deployment `b1ef6404-fd00-4312-857c-c50013bb64a2`, version `a48c431a-5c3e-4491-8529-38cb20dfa898` at100%. That rollback version remains available with the SQLite Durable Object export and compatible runtime.
- Binding names/types/targets exactly match the prior verified baseline, including existing `DASHBOARD_JOBS` namespace `fc70a55e49c84d28bacc562a8d5cfb62`, `VINEXT_KV_CACHE` namespace `644df6a469e84dba90c8f7dac410f895` and existing secret binding names. Secret values were not retrieved, copied or changed.
- Existing compatibility date `2026-11-06`, `nodejs_compat`, subrequest limit350 and dashboard cron configuration are unchanged. Automatic build inclusion remains only `__cw08_manual_release_only__`; this working branch cannot trigger an automatic release.
- CW08 remains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b` at100%; its `*/15 * * * *` trigger and modification timestamp are unchanged. Only deployment/schedule metadata was read; no research tables or collection operations were invoked.
- The original backup manifest and three data objects remain available with unchanged names, sizes, modification times and parent folder. This is a metadata availability check; the prior verified hashes and isolated restore are reused, not newly downloaded or revalidated. The existing backup covers20,466 of the last verified20,468 protected records; **two original receipts remain outside that backup**. Production record counts were not queried again, and no new export/import/restore occurred.

## Frozen scope and authorization

Artifact: **`NBA-ODDS-DIAG-2026-11-21-cae200070535`**.

- Full inventory/config SHA256: `cae200070535f2b0286266964dc29a6b6610a2ec08b77aef3426a2b33c3acc20`.
- Delta SHA256: `bc8c69baddce01bac2c5c3988c05149d1a8b7b5150f458f394f6780187dfc899`,7,770bytes.
- Exactly two modules: `bundle/namespace-fallback.js` and `bundle/nba-odds-diagnostic.js`. The other749 raw files, assets, bindings, config, queue class and held-schedule behavior retain the verified fallback. Full R1 and pending card/model changes are excluded.
- Offline `--prepare-frozen` reconstruction passed without compiling or uploading. The [original frozen release plan](../../../frontend/releases/nba-odds-diagnostic-2026-11-21/release-plan.md), manifest and delta are unchanged.

The latest conversation explicitly requires separate approval before a production upload. Reviewed Issue129 through comment7071170277; no authorization for this exact diagnostic upload is recorded. Older R1/research approvals do not authorize it. No production upload or manual-build configuration change was attempted. This gate comes from the user's instruction, not from a newly inferred approval policy or tool rejection.

**Exact authorization needed:** one controlled manual upload of this frozen diagnostic-only artifact to the existing Worker, using the unchanged existing bindings and compatible rollback version above. No new service, namespace, credential transfer, public preview, record import, R1 release, research change or automatic-build activation. The established manual prebuilt deployment procedure and immediate rollback on critical failure apply.

## Remaining NBA verification

The active fallback's filtered Points diagnostic cannot establish original seven-market quote identities. No seven-market requests were made against it and falsely labelled successful. No new provider denial or source outage is inferred from this authorization block.

After separate authorization and diagnostic acceptance, make one bounded current read per market: Points, Rebounds, Assists, Threes, PRA, PR and PA. Preserve response/status/duration/hash plus original prop/player/game identities, periods, prices, lines and timestamps. Explicitly report omissions/truncation. Independently join official current roster/game identities, validated model inputs and source age before verifying projections, confidence and EV across the eligible lists. Original provider IDs alone are not official-identity proof. Do not reconstruct missing prices, force prediction counts, or present stale/withheld forecasts as current.

The350 recorded card checks and prior all-seven-model evidence remain useful regression evidence, **not** current fresh-data acceptance. Current full-slate quote/player coverage, lower-ranking live cards and EV calculations remain unverified pending activation. Actual R1 browser/capture/grading/record-preservation acceptance still needs a later separately authorized release.

No production data writes, historical reimport, new subscription, full R1 deployment, provider-access bypass, CW08 change or build restart. R1/CW11/V62 remain Blocked; no row moved to100% completed. Issue129 and the existing tracker record these actual results.
