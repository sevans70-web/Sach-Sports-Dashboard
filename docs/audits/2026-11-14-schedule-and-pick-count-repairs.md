# Recurring schedule and pick-count repairs — November 14, 2026

## CW06 closure

CW06 deployment evidence is preserved in GitHub commit
3d13350ebad5d2d2b86cf503e2fb603181d1adc0, including
`frontend/model-research/cw06-nba-ev/deployment.json`.
Deployed source: 6a4db752bc57faa233805c9547f1ec059383f79f.
Cloudflare deployment: b5705072-a97f-4794-b71b-8bbf73a1da60;
version: 46f9dc62-01e2-407f-b1c3-845d10e613d9.

The existing Sach Sports completion tracker was accessible through its native
Google Sheets connection. CW06 was physically copied from Repair checklist row
21 to 100% completed row 34, then removed from the repair tab in one atomic
batch. The completed checkbox is TRUE and the validated status is 100% COMPLETE.
Original notes, formatting and validation were preserved, with release evidence
and the explicitly approved seven-market repair scope added. Read-back verified
CW06's absence from the repair ID column and its completed destination row.
This does not newly certify NBA calibration or claim a naturally occurring live
zero EV. The original CW06 verification limits are retained.

## Findings and implemented corrections

1. **Partial schedule failures silently removed games.** NBA's schedule batch
   accepted whichever requested dates succeeded; NHL and NFL converted rejected
   dates to empty arrays. A failed day could disappear while another day made
   the response look healthy. Their schedule batches now reject incomplete or
   malformed date coverage. Verified empty arrays remain legitimate empty dates.
   NBA/NHL overview consumers also propagate unavailable sources instead of
   generating successful empty ranking boards. NHL includes failed current-roster
   verification in its source-availability guard. Provider failure is reported
   as retryable unavailability, not a certified zero.
2. **Frontend fallback policies disagreed.** A failed summary response could
   replace valid state, while schedule polling kept nonempty schedules forever
   and could never clear a genuinely empty schedule. Snapshots now retain only
   same-sport, same-Toronto-date observations younger than 15 minutes. Failed
   polls preserve these observations with retained-schedule diagnostics;
   authoritative empty schedules replace them. Summary cache keys include scope
   and Toronto date; versioned session storage rejects stale old counters.
3. **Homepage scope did not match its label or sport dashboards.** On Saturday,
   the observed deployed Today summary correctly returned NFL games=0/picks=0,
   despite a published Sunday/Monday slate. The homepage said Current Slate but
   explicitly requested Today. It now requests the actual current slate. An
   explicit Today API request still means Today and can correctly return zero.
4. **Summary generation launched a costly default-market model run.** It then
   counted only that default market in current scope, or mixed saved boards and
   aggregate caches with different eligibility rules in Today scope. Professional
   summaries now observe published market boards and recent coverage across the
   official selected fixtures/dates; they do not launch model fitting. No
   predictions or history are generated merely to fill a counter.
5. **Missing market evidence looked like complete coverage.** Stale/wrong-date
   aggregates, raw candidates, scorer offers and projections were conflated with
   picks. Counts now bind sport, market, date and exact game IDs, deduplicate
   identities, reject expired/future-dated aggregates and invalidate unchecked
   aggregate counts across kickoff. Entirely unknown counts are null, not zero;
   partial coverage is explicitly labelled as an observed lower bound (≥ in the
   homepage). Coverage caches use v3 and preserve the actual future fixture date.
6. **Card totals and coverage disagreed.** The callback counted unscoped source
   rows and research directions while the displayed header used filtered cards
   and supported saved picks. Both now use the same positive-EV, exact-selection
   predicate after display scope/filtering. Qualified quarter targets retain
   their existing rule; withdrawn/void records do not count. NBA's seven CW06
   diagnostic markets and First Basket use the same visibility policies in
   coverage as their cards. A bookmaker scorer candidate is not an O/U pick.
7. **NHL's public limit preceded model checks.** A baseline-ranked Top 25 could
   discard the next eligible candidate before its unchanged fitted model and
   quote were considered. Pregame evaluation now considers up to 64 availability-
   screened candidates before publishing 25. Existing selection prioritization
   chooses only supported selections; it does not change prices, thresholds or
   sides. Candidate/evaluation/public counts and budget limits are explicit.
   Started/frozen input limits and recorded history remain protected.
8. **Tomorrow NHL rosters used today's teams.** Current-roster enrichment was
   always limited to the active current slate even for a Tomorrow request. It
   now resolves the requested slate's teams and uses Toronto calendar dates,
   including the DST boundary. Historical baseline team identity is still
   insufficient without actual current roster confirmation.

## Verification and practical limits

New regression checks exercise partial/malformed schedules, genuine empty days,
bounded retention, Toronto rollover/DST, exact fixture/market counting, duplicate
rows, partial/unknown counters, stale/future aggregate rejection, kickoff cache
invalidation, all seven NBA diagnostic markets, scorer-versus-pick separation,
current-versus-Today API scope, and model generation being absent from summary
requests. The NHL integration proves an eligible candidate beyond position 25
survives; unavailable sources fail closed and original started limits remain.
Existing request-budget checks retain NBA/CBB live-only status enrichment.

The runtime model artifacts, probability/price calculations, validation gates,
original data files, history writers and CW08's frozen protocol/model/collector
are unchanged. No original pick, line, probability or grade was rewritten.
NHL goals/assists selection scarcity due to the existing revalidation gate is
intentional and remains; additional CW08 game results are still required. No
quota, synthetic game, replacement probability or forced OVER was introduced.

These fixes have not been deployed. The active dashboard remains the approved
CW06 version and automatic builds remain paused. CW08's separate Worker and
15-minute schedule remain active. Live behavior and cold Cloudflare performance
of this new patch must be checked only after a separately approved release.
Provider outages can still produce truthful unavailability when there is no
recent verified snapshot. The 64-candidate budget is reported when it prevents
claiming complete evaluation; it is not evidence that 25 valid picks exist.

Final verification counts and evidence hashes are recorded in
`docs/audits/2026-11-14-schedule-and-pick-count-verification.json`.


Final results: **739/739 full regression checks passed**, **13/13 focused final
checks passed**, and strict TypeScript/noEmit reported **zero diagnostics**.
`git diff --check` passed. No dashboard build or deployment was run for this new
repair. CW06's approved production deployment is unchanged. Spreadsheet closure
was checked through cell values, validation rules, retained formatting and the
native hyperlink; no authenticated Sheets browser was available, so no visual
Google-rendered inspection is claimed.


## CW08 operational observation during final checks

The separate research Worker remains ready and scheduled, its version and cron
modification timestamp unchanged. The final observed status contained 658
receipts and 51 completed cycles, with zero pending uploads and no storage
error. The latest collection health was **degraded**, with 15 roster failures
and 24 history-source failures, and 39 source_http_429 rejections. This is an
upstream rate-limit blocker to complete collection, not proof of healthy source
coverage. Earlier in the same session the collector reported 655 receipts and
50 completed cycles without a storage error. No collector restart, schedule
change, model tuning or retry bypass was attempted. Existing source rejection
and retry behavior remains responsible for recovery; dashboard fixes are still
undeployed. Reliable future enrollment requires upstream availability.
