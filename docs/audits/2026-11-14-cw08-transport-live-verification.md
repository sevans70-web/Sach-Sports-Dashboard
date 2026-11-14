# CW08 research transport deployed and live verified — November 14, 2026

The authorized research-only update is operational. No manual intervention is required now. The frozen model remains under prospective evaluation; this is not a model promotion or a claim that CW08's statistical acceptance gates have passed.

## Deployment and release checks

- Worker: `sach-cw08-nhl-shadow`.
- Deployed source: `c08afc5b0b0b4139413a046824539d9f5d01c795` on `cloudflare-compatibility-test`.
- Successful manual build: `c88755cd-bcd7-4864-9bdc-3f6c85f80483`.
- Deployment: `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, November 14 **2:54:01 PM EST**.
- Version: `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`, 100% traffic.
- Confirmed rollback available: `08e854d6-fcdb-404a-9820-c156d1485d98`. No rollback needed.
- Exact approved bundle: **151,874 bytes**, SHA-256 `c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4` in both local and authenticated remote builds.
- Full pinned historical Git objects were fetched when missing in the shallow Cloudflare checkout. All original byte-for-byte artifact/protocol checks passed, without moving HEAD or weakening guards.
- All 669 prior receipt references were present. The original collector had legitimately added four, so the actual pre-deployment inventory was 673. Actual stored KV-object byte SHA-256 comparisons verified **all 673 unchanged after upload and again after scheduled collection**.

Only the research Worker code was uploaded. Its existing SQLite Durable Object namespace `24d604463d7f410f880ba8366769e853` and evidence KV `94a4f6693e144aa1ae92d2939d563014` remain bound. Feed and bootstrap secret bindings were retained using `keep_bindings`, without reading/copying/rotating secret values. No imports, new resources, paid services, plan upgrades, R2 or schedule edits occurred. The approved operational cache table was created in the same existing SQLite object. Read-only SQL inspection wrote zero rows.

## Actual scheduled cycle and natural 429 recovery

Cloudflare's real `*/15 * * * *` schedule started cycle **1994096** at **3:00:24 PM EST**; it completed at **3:07:26 PM EST**. No collection endpoint/manual tick was invoked.

A natural official-NHL HTTP429 occurred during roster collection. Read-only SQLite snapshots proved:

1. The failed roster remained at **cursor 12**, with `sourceDeferrals: 1` and `source_http_429` persisted.
2. The provider gate stored `blockedUntil = 1794686538305`; the cycle stored exactly the same retry time. A later read before expiry still showed cursor 12, unchanged gate/next-request state and no premature cursor advance.
3. After expiry the same job resumed, advanced to **cursor 18**, and cleared `lastError`, `blockedUntil` and the provider failure streak.
4. The completed immutable run manifest records **sourceDeferrals: 1**, **zero roster failures**, **zero history-source failures**, 16 warmed players, 18 source snapshots and **9 new receipts**, with healthy collection status.

No provider limit was bypassed, no artificial 429 was induced and no failing player/team was silently skipped to complete the run. Missing/ambiguous identity, insufficient history and uncertain-role exclusions remain explicit in the manifest. The 62-entry public-data operational cache used 153,592 compressed serialized bytes, below its configured bounds. Authenticated odds, pregame official fixture checks and final boxscores remain uncached.

Immutable run evidence:
`runs/19b27e98613fa43618eb21d44053464f5986c94c3acb7dc29312c8ade370b6f6.json`.
The stored object was retrieved, decompressed and its actual content SHA-256 independently verified as `19b27e98613fa43618eb21d44053464f5986c94c3acb7dc29312c8ade370b6f6`.

All nine new receipt objects were independently retrieved/hash-verified. Targets are unique, uploads were anchored before puck drop, frozen model/protocol identity is correct, and **all candidate plus baseline forecasts and exact-price calculations reproduce** using the frozen implementation and established replay tolerance. No predictions, odds or results were fabricated, and the frozen model was not tuned.

Final observed status: **682 receipts, 59 completed cycles, zero pending uploads, no active cycle, no storage error**. All SQLite evidence objects were stored: 682 receipts, 59 runs, 294 history objects and 1,112 source objects. Original receipt bytes and historical evidence remain intact.

## Grading and production isolation

At verification, **zero receipts were overdue for grading**. The earliest grading eligibility is **4:00 PM EST / 21:00 UTC** on November 14; official FINAL/OFF participation/stat evidence must still exist before a grade is produced. Accordingly live grades remain zero. Do not claim a live official-final settlement occurred during this check. The actual Worker-runtime workflow test passes official-final grading, immutable grades, failed-upload acknowledgement recovery and duplicate prevention; unavailable finals remain pending.

Cron is unchanged `*/15 * * * *`, including its original modification timestamp `2026-11-14T05:24:15.908994Z`. No frozen model/protocol/history inputs or production predictions changed; `/status` continues reporting `modelCommit: 007c02b`, `production: false`, `releaseApproved: false`.

The production dashboard remains deployment **dcad8c9c-ca52-4578-887c-1a6f4a0659b0**, version **bdd010c7-ab1d-41a1-83fb-bcabab45b86f**. NBA/NFL/NHL schedule APIs returned HTTP200 with 14/14/19 games. Dashboard build commands were restored immediately after the research manual job was created; automatic builds remain paused with branch include `__cw08_manual_release_only__`. No dashboard build or deployment ran.

## Testing and remaining study requirements

This release reran **10 focused checks, all passing**, including shallow-history preparation, exact build reproducibility, metadata/resource fences, provider Retry-After handling, durable origin gates, cache provenance, lease safety and the full scheduled workflow. The deployed source's full regression suite previously passed **749/749**, with **zero TypeScript diagnostics**. No runtime changes were needed in this deployment turn; additional committed edits are activation/evidence documentation.

CW08 can continue collecting and later grading automatically without manual intervention now. Provider throttling remains possible and is safely deferred/retried; the successful live recovery above is evidence, not a guarantee against future provider outages. Keep the November 14–December 15 protocol and model frozen. Statistical validation still requires official results and the protocol's fixture/cohort/line minimums and performance intervals; no automatic production promotion is authorized.

Machine-readable activation evidence is in `frontend/shadow/cw08/transport-activation.json` and the adjacent audit JSON. The initial `live-activation.json`, earlier failed attempt audits, original enrollment files, all picks and receipt/grade records were preserved. Local operational evidence is retained under `/workspace/work/cw08-live/`, including durable SQL snapshots, status observations, immutable manifest/receipt replay and build/test evidence. No secret values are included in GitHub evidence.
