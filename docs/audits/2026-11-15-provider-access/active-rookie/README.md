# Confirmed active Rookie — credential and source checks

The owner confirms an active OWL **Rookie subscription through December 15, 2026**. OWL's published `/api/v1/{sport}/props` contract includes NFL and NHL on Rookie. No purchase, renewal or plan upgrade is proposed. Subscription validity is accepted as owner-confirmed; the unresolved issue is the deployed key's account linkage or provider restriction.

Work continues on the existing branch from `b7bece5`, preserving descendant evidence commit `11025bd` and all prior application repairs. This turn changes evidence/support documents only; no dashboard/research code, credentials, bindings, schedules or provider selection changed.

## OWL verification result

| Check | Evidence | Outcome |
| --- | --- | --- |
| Dashboard active binding | Live version `a48c431a-5c3e-4491-8529-38cb20dfa898` | `OWLS_INSIGHT_API_KEY`, `secret_text`, exact expected name/type |
| Research active binding | Live version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b` | Same expected binding name/type, separate Worker |
| Build environment | Existing trigger metadata | OWL secret exists, is secret, created November 7; value redacted |
| Runtime selection | `lib/worker-runtime-secret.ts` and compiled-route tests | Reads Worker binding first, trims whitespace; process environment is fallback, not a link to build variables |
| Request contract | Shipping source and compiled-route tests | Exact merged props path; `Authorization: Bearer` and existing `x-api-key`; no wrong path or missing header scheme found |
| Research live authentication | Existing scheduled traffic, no manual probes | NHL merged props HTTP 200, latest reviewed success **8:47:43 PM Toronto, November 15** |
| Dashboard live recovery | Latest retained upstream traffic | NHL 403 at 8:01:48 PM; NFL 403 at 3:13:48 PM; no later dashboard success established |
| Intended key/account identity | Cloudflare metadata and audit history | **Not verifiable** from redacted binding metadata; do not claim the two Workers use identical values or the intended owner account |

Cloudflare secret values are write-only in the management contract. Returned active-version secret metadata exposes only name/type; there is no readable key ID, fingerprint or value. We did not retrieve, hash, copy or publish any key. Successful research reads establish that its deployed credential is accepted for NHL, not that it belongs to the intended account or matches the dashboard credential. Build-time and each Worker's secrets are independent storage locations, despite identical names.

A secret-audit query found one standalone dashboard secret PUT on November 7. It does **not** prove values never changed: script-upload and deployment records do not expose their credential payloads. No credential-mismatch or rollback-induced rotation is asserted. Version/build timestamps are not secret fingerprints.

Actual intended-key comparison requires a trusted in-place diagnostic or provider confirmation against the account and request logs. No production diagnostic endpoint or temporary Worker was deployed to obtain it. No manual build was triggered, since its deployment stage must remain protected. Blind key rotation could introduce a different account's key or create a new Worker version, and was not performed.

The existing OWL support draft is updated for review with active Rookie entitlement, exact failed routes, HTTP statuses, UTC/Toronto timestamps and Cloudflare traces. These are our trace IDs, not invented provider request IDs. It asks OWL to identify the associated non-secret key/account, permission state and any propagation/WAF restriction under the current subscription. **It has not been sent.** The account email supplied by the owner is included only in the private review copy outside GitHub, not in public committed evidence.

A previous one-time dashboard API check received Cloudflare Error 1010 before reaching the application. That edge rejection was not retried with another identity/host, and must not be mistaken for an OWL authentication result. This turn uses existing authenticated Cloudflare telemetry for live verification.

## SportsGameOdds 401

The active dashboard version includes `SPORTSGAMEODDS_API_KEY` as `secret_text`; the corresponding build secret is separate and redacted. `getSgoSupplement` uses the documented `x-api-key` header, reads the Worker binding and trims the value. No confirmed missing/misnamed binding or header-code defect was found. Latest reviewed `/v2/events` remains 401.

Provider documentation distinguishes authentication rejection (401) from permission/tier denial (403) and rate limiting (429). A wrong, revoked, regenerated, copied-with-prefix or differently scoped/account-linked key is possible, but cannot be distinguished by secret-name metadata. Existing-account key verification/correction is the no-additional-spending recovery path; no purchased tier or guaranteed whole-month free quota is assumed. A secure credential correction requires the owner's/provider's verified key and approval for any resulting configuration/version change. No secret should be pasted into chat, and no secret change was made here.

## Verified no-cost NFL history alternative

Read-only investigation downloaded actual nflverse data, using the URL construction in its current `load_stats.R` at commit `5b261e420cf022db9b4e7cb183e7cb4b799b13d2`. Old `player_stats/player_stats_2026.csv` and separate defensive URLs returned 404; the current loader uses **`stats_player/stats_player_week_2026.csv`**, which returned 200. This is a corrected discovery URL, not an application fix or source adoption.

* **2026:** 10,306 rows, 1,805 players, Weeks 1–10; last-modified November 15 at **8:54:52 PM Toronto**. Fields include `passing_interceptions` (not `interceptions`), passing/rushing/receiving measures and defensive sacks/tackles. Zeros on an unrelated-position row do not establish participation or a valid model sample.
* **2025:** 19,422 rows, 2,025 players, regular/postseason data, also HTTP 200.
* The actual players ID file returned 200 and provides ESPN IDs for **1,798/1,805** current-season players; **seven are unmapped**. No duplicate mapped ESPN values were observed in that snapshot. Jordan Love maps GSIS `00-0036264` to existing ESPN `4036378` with ten current-season game rows.
* Exact player/team/game/date joins, current-roster participation, statistic semantics, zero-versus-missing handling, update latency and pregame cutoffs still require adapter validation. Weekly totals contain no quarter fields and do not provide first-touchdown event order; those need separately validated play-by-play.
* nflverse's generally CC-BY datasets require attribution. Its published update schedule is normally postgame/nightly with later corrections, not a live SLA. No data or model was substituted in production, and late data cannot rewrite an original pregame receipt or serve as evidence it was available earlier.

These downloads demonstrate a real accessible history source independent of blocked ESPN requests. They do not provide sportsbook odds, establish current live grading readiness, or supply calibrated model probabilities. Rookie-included results/trends are another documented discovery path; no restricted archive requests or upgrade were attempted. Historical source adoption remains pending approval.

## Checks and protection

**19 focused tests passed**, plus **two shipping compiled-Worker tests passed** for real binding/header wiring and bounded cold-route recovery. Credentials and provider responses in those runtime tests are synthetic; they verify code wiring, not the production key's identity. The previous full regression remains 816 passed; it was not rerun or represented as a new result during this document-only investigation.

CW08's latest read-only status: **930 receipts, 658 grades, 151 completed cycles, zero pending uploads, no active error and no storage error**. NHL feed recovery already allowed fresh first-receipt collection to resume. Future restoration should allow further eligible pregame enrollment; missed past windows cannot be backfilled. Frozen model, protocol, historical evidence and grading rules are unchanged.

Automatic dashboard builds remain paused (`__cw08_manual_release_only__`). Production fallback deployment is still `9b1c3dea-a683-4e0f-9f42-71236a095a9d`; research deployment is still `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, scheduled every 15 minutes. No deployment occurred.

## Immediate correction versus external requirement

**Completed immediately:** corrected the subscription/entitlement diagnosis to active Rookie; verified actual deployed binding names/types, header contract and code behavior; preserved recent successful research evidence; updated the reviewable unsent support request; verified a working free NFL history source and its mapping/quarter limitations.

**Still requires a trusted credential/provider action:** prove the dashboard key belongs to the intended active account, explain/fix intermittent merged-props 403, and verify/repair SGO's current key. No missing binding or header defect was confirmed that can honestly be fixed by changing code now. Provider trace/account confirmation is preferable to a blind credential replacement. No purchase or plan upgrade is needed or recommended.

References: [OWL props contract and authentication](https://owlsinsight.com/docs), [SGO error reference](https://sportsgameodds.com/docs/info/errors), [nflverse data license](https://github.com/nflverse#licensing), [data schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html), [current player-stats loader](https://github.com/nflverse/nflreadr/blob/5b261e420cf022db9b4e7cb183e7cb4b799b13d2/R/load_stats.R).
