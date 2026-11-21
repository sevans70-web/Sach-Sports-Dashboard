# Fresh NBA discovery recovery — November 21

**Candidate repair verified, not deployed. R1 remains open.** `c07eb36` ranking repairs and the completed 101-game seed are preserved. No production import, deployment, credential change, paid service, public preview or CW08 modification occurred.

## Confirmed failure and supported recovery path

The retained [production trace](../2026-11-17-r1-nba-blocked-recovery/README.md) identifies `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/<id>/gamelog?season=2027` returning 403. The collector marked the player unavailable and collected no fixtures. Complete stored FINAL records alone cannot renew that discovery. The collector also reduced HTTP errors to a generic exception, losing the status needed to distinguish a denied log from a timeout or rate limit.

These public ESPN endpoints do not use the OWL key. The retained evidence does not identify ESPN's specific rejection rule; this task does not pretend the athlete-log 403 has disappeared or retry it through another host/profile.

An independent resource already used by this application is available:

`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/<team>/schedule?season=2027&seasontype=2`

Together with official roster, exact pregame summary and validated full two-team FINAL censuses, it supplies the inputs used by the existing model. Player features are keyed by **player and current team**; prior-team appearances cannot establish the current team's role. Both current-team and opponent calendars are required. A roster entry alone never supplies statistics, workload, availability, confidence or an OVER/UNDER pick.

## Actual live evidence

Read-only production GETs through the existing active Cloudflare Worker, normal TLS:

|Route|Actual HTTP|Duration|Observed result|
|---|---:|---:|---|
|Game detail, pregame fixture 401910028|200|1.409s|Two teams, 34 current roster entries|
|Game detail, recent FINAL 401910015|200|0.903s|Two teams, 27 recorded participants|
|Player-card context, current BOS player|200|0.351s|20 schedule-context entries; 15 exactly match the current 2027-season calendar|
|NBA merged-feed sample|200|1.532s|Five fixtures, original book prices and timestamps in a bounded Points-only sample|

These routes were reviewed for writes before invocation. No ranking/capture/player-history refresh route, private preview or unapproved diagnostic upload was used. The 34 player IDs match the separately captured current rosters, and the profile/calendar response includes 15 matching current-season fixtures through November 18 Toronto (not just the previous-season fallback). See `production-route-validation.json`. The three official-data GETs establish that the active Worker's independent summary/calendar integration works; they are **not** full production acceptance of the new collector or proof of every raw census field from Cloudflare.

Separately, 24 ordinary authorized public-source requests from the development environment returned 200: two team calendars, two rosters, one pregame summary and 19 recent FINAL summaries for BOS/SAC. Every FINAL passes the existing complete two-team census validator. Source receipts, timestamps and hashes are retained in [official-source-receipts.json](official-source-receipts.json) and the checksummed test fixture. Development egress is clearly separate from the production Worker requests above. The first calendar capture lacks an original HTTP-byte hash; its retained parsed payload is protected by the fixture digest. The other source receipts retain their captured byte hashes. No original-byte hash was invented. No new athlete-gamelog request was made to the blocked endpoint during this investigation.

## Smallest recovery repair

- Preserve the actual HTTP status. Only an explicit NBA athlete-log **403** can select the alternative when no accepted fresh calendar already exists. A failed 401/429/503, deadline or cancellation does not authorize a replacement request path.
- Prefer a fresh, previously validated team calendar after a cold restart, avoiding another denied player-log request. Group calendar reads by source so the complete 34-player cohort needs two calendars, not 68 separate calendar HTTP calls.
- Reconcile every completed calendar game and its actual winner/score against the independent regular-season team W/L record. Require exact team, season, period, fixture identity and date. Truncation, duplicates, contradictory scores, future finals and a missing target fixture are rejected. Calendar sources carry their own URL and hash; they are not relabelled as ESPN athlete gamelogs.
- Retain calendar discovery in the existing NBA evidence tables, with the same 15-minute successful-check freshness rule. Both source timestamps and checksums are retained. Reject stale incoming discovery before writing; a cache hit cannot extend its observation age. Operational cache entries now recognize only the added NBA calendar resource. The old scoreboard/non-NBA policies remain unchanged.
- Reuse complete validated FINAL censuses first; collect only the needed additional games. Keep the original 21-day window, 48-hour availability lag, player/team/opponent minimums, role/usage checks and every model calculation unchanged. Missing participation stays missing rather than becoming zero.
- Apply the existing atomic monotonic discovery guard to calendars as well as athlete logs: a smaller completed set cannot replace a larger valid set, even if a partial response changes its W/L record to appear internally consistent. No schema migration, new binding or storage service is required.
- Keep four-source concurrency, the foreground source cap, background request reservations, cancellation and checkpointing. Calendar bodies are limited to 2 MiB, reduced to roughly 25 KiB of exact relevant fields, and oversized streams are cancelled. Foreground can read stored evidence but cannot persist or modify it.

## Verification — 54 distinct focused checks passed

[verification.json](verification.json) identifies every new runtime result and fixture digest. The 46-check regression run, final 17-check source group and final five-check unit group overlap; their union is **54**, not 68. Zero failures and zero TypeScript diagnostics. No full-suite repeat or dashboard/release build was needed for this focused source repair.

The relevant graph was compiled with the existing model-runtime plugin and executed in real workerd with SQLite Durable Objects, persistent storage and the existing compatibility date/flags, 350 runtime subrequests and a 45-request test guard. This is not the full frozen release artifact or a live candidate deployment.

- A 34-player real roster recovers **2,982 identical validated observations from 19 FINAL games**, stored as 21 source records (two calendars plus 19 censuses).
- Interruption/restart phases advance at **42 / 42 / 26** measured requests, each below the 45 guard. The first phase persists 21 denial receipts; later phases advance validated-source pointers from **0 → 6 → 21**. That first phase is not falsely described as a successful-statistics checkpoint. The persistent denial cache prevents repeat upstream calls to the same denied player URL.
- After disposal of the entire Worker and restart, foreground recovery uses **zero provider calls**, preserves the existing source checks and protected marker, and leaves NFL/NHL objects without NBA evidence.
- A truncated but internally reconciled calendar is rejected atomically; the previous pointer, timestamps and protected marker remain unchanged. Expired discovery is not renewed without a legitimate successful response. 401/429/503, stale/wrong fixture context, aborts and oversized streams remain unavailable or cancelled.
- All seven unchanged NBA model partitions were evaluated for all 34 players: **19 available projections and 15 withheld in each market**, including available players below the first 25 roster positions. Unavailable role/history/availability cases remain explicit; absent Ben Simmons observations are not invented. These are **forecast-coverage counts, not 19 live priced ranking cards**.
- Existing seven-market Node/Cloudflare probability, OVER/UNDER selection and EV arithmetic checks passed, including non-leading rank preservation, negative/zero EV, exact quote binding, immutable saved predictions and source-recovery/capture checks. These calculation contracts use declared test quotes; they are not claimed as today's complete sportsbook acceptance. Existing NFL/NHL real-data and job-boundary regressions passed.

## Remaining current-market evidence gap

The active production `feed-sample` diagnostic hard-codes Points and omits `propId`. Whether the current upstream itself supplies IDs cannot be established from this filtered diagnostic. Its six matched genuine BOS/SAC two-sided offers are useful evidence of fresh quotes, but the existing exact-price model correctly refuses to price that incomplete receipt. Five sample players have fitted projections; Jordan Walsh's role check withholds his forecast. **No quote ID, probability, confidence, EV or betting selection was invented to make this sample pass.**

A small read-only extension is prepared in the existing diagnostic route:

`/api/market-coverage?sport=nba&mode=feed-sample&market=<one of seven markets>&limit=25`

It copies the provider's actual `propId`, exact market/period, main/alternate flags, two-sided prices, player and timestamps when present. Original categories/IDs are preserved, not reconstructed. Requests are limited to 30 fixtures, 12 books and 1–25 props per book; defaults stay at two Points examples. Invalid markets/limits fail before any provider call, public-field allowlists exclude private data, and failures return sanitized categories. NFL's existing route behavior is preserved. This extension is tested **but not deployed**.

**Next action:** separately authorize activation of this narrow read-only diagnostic (or provide an equivalent existing authorized full-prop snapshot with original IDs), then verify all seven current markets and the entire eligible displayed cohort against the corrected candidate. That requires fresh receipts at execution time; today's limited samples cannot be restamped. No further paid subscription or repeat historical import is needed. A complete future pregame board, full-slate resource check and separately approved actual production browser/capture/grading acceptance are still required before R1 can close. No release approval is requested in this task.

## Production safeguards

Actual fallback remains `b1ef6404-fd00-4312-857c-c50013bb64a2`, version `a48c431a-5c3e-4491-8529-38cb20dfa898`; CW08 remains `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`. Automatic builds remain excluded by `__cw08_manual_release_only__`.

No production table, seed, pick, grade, history record, backup, credential or schedule was modified. The previous verified inventory/backup evidence is reused rather than re-exported: 20,468 protected records versus 20,466 in the existing backup. The two-original-receipt backup gap remains open. R1/CW11/V62 remain blocked; no checklist row is moved to completed.
