# CW06 — NBA missing EV repairs

Scope: `frontend`, `cloudflare-compatibility-test`. No dashboard rebuild or
Cloudflare deployment. CW08's separate Worker, frozen artifacts, namespaces and
15-minute schedule are unchanged.

## Actual causes

1. `estimatedEv` is intentionally a selection-only contract. NBA research
   forecasts can contain valid, exact-quote probabilities without passing the
   betting-selection threshold. The rankings mixed this contract with a separate
   comparison fallback, so API `estimatedEv.status=unavailable` did not necessarily
   mean there was no calculable model/quote EV.
2. `nbaDisplayedResearchEv` and the card renderer suppressed negative and zero
   expected returns. A genuine loss estimate became an unexplained dash.
3. Fresh forecast receipt timestamps were stamped only when a selection existed.
   A new comparison paired with an older board timestamp could fail the strict
   decision/capture integrity check despite having a fresh exact quote.
4. Client display gates required complete EV and reranked/renumbered the board
   using EV. Missing-evidence rows could disappear instead of identifying their
   blocker. The shared gate also applied O/U completeness to book-only First
   Basket cards.

The shipped models already support points, rebounds, assists, threes, PRA, PR and
PA. The joint combination artifacts have their own calibrated residual samples;
component means alone are not a joint probability distribution. Tests execute the
embedded Cloudflare loader and Node loader and reproduce the same outputs for
all seven markets. No probability-model fitting, coefficient, residual,
calibration, selection-threshold or model-registry change was needed.

## Implemented behavior

| Market | API key | EV repair |
| --- | --- | --- |
| Points | `points` | Signed exact-quote model EV or explicit blocker |
| Rebounds | `rebounds` | Same |
| Assists | `assists` | Same |
| Three-pointers | `threes_made` | Same |
| Points + rebounds + assists | `pts_rebs_asts` | Uses existing fitted joint distribution |
| Points + rebounds | `pts_rebs` | Uses existing fitted joint distribution |
| Points + assists | `pts_asts` | Uses existing fitted joint distribution |

`nbaRankingEv` is a separate display contract. It prefers the verified original
selection when present; otherwise it prices the projection direction already
shown on the card. It never flips to the more profitable side or creates a
selection. Negative and zero returns remain visible. A projection exactly at the
line has no single displayed direction and receives an explicit explanation.

Expected net unit return is `P(win) * net_win_payout - P(loss)`, multiplied by 100
for the percentage. Pushes return the stake, so their profit is zero. For example,
40% win / 50% loss / 10% push at +100 returns -10%, not a blank or a conditional
win percentage. Both American-price signs and integer pushes are tested.

The implementation requires numeric whole/half lines, complete finite two-sided
American prices, normalized OVER/UNDER/push probabilities, exact
sport/market/game/player/book/quote/line/price binding and valid pregame timing.
Fresh pregame cards require current odds, at most 15 minutes old. Frozen originals
retain their original pregame prices and are visibly labelled saved pregame EV.
Failed accuracy checks remain blocked. There is no bookmaker-implied or GI-based
probability fallback.

The NBA rankings response receives additive `nbaEv` details and `evDiagnostics`
counts/reasons. The legacy selection-only `estimatedEv` field remains unchanged
for compatibility and recommendation qualification. Both compact and expanded
ranking cards render the same tested `NbaEvMetric`, including visible unavailable
reasons. These are labelled **research EV**, not betting-validated predictions.

Fresh NBA comparisons receive their actual current forecast timestamp even when
there is no qualifying selection. Frozen/started original forecasts and their
timestamps are preserved, including when the runtime is unavailable. The seven
markets retain API-supplied ranks and order rather than recalculating ranking
numbers from a display metric. Underlying saved predictions, original quote
fields, projections and grades are not rewritten.

## Featured cards and other sports

Play of the Day, Best Value and Long Shot retain their existing eligibility and
positive-EV requirements. A negative display EV never becomes a qualifying pick.
First Basket remains a one-sided scorer quote with labelled bookmaker-implied
chance; it does not acquire an invented independent probability or EV. Its
rankings display is exempted from O/U-completeness filtering.

No NFL/NHL calculation policy, supported market list, price validation, count
model, ranking algorithm or historical storage writer changed. The NBA scope test
was updated for additive diagnostics and the already documented fixture-day
contract; its obsolete advisory-board-day assertion had been one of the baseline
failures. Model/protocol files pinned by CW08 remain byte-for-byte unchanged.

## Read-only live checks and limitations

The production catalog returned four NBA games and offers in all seven requested
categories. Raw category counts establish source availability, not freshness,
complete market coverage or an eligible EV for every player. No live ranking or
pick-capture endpoint was called during this work; those routes can write history.

CW08 continued collecting while CW06 was developed. The observed research Worker
reported 370 receipts, four completed cycles, healthy collection and no pending
uploads/storage errors. No scheduler, secret, Worker version or namespace was
modified by CW06. Automatic dashboard builds were verified paused.

The changes have not been deployed, so production still has its old rendering.
There was no dashboard build or production-browser assertion of undeployed code.
Actual rendering tests exercise the shared EV component through React server
rendering without building the dashboard. Controlled quote fixtures use real
shipped model distributions; their numerical test EVs are not claimed as live
sportsbook opportunities.

See `frontend/model-research/cw06-nba-ev/verification.json` for final check counts,
source coverage, deployment status and remaining release blockers. Existing
repository-wide failing tests and TypeScript diagnostics are reported rather than
hidden or repaired outside this task's scope. Production release requires those
checks to pass and explicit user approval.

## Initial CW06 result (superseded by the readiness follow-up below)

All seven requested markets have the repaired EV display/API path. Focused
checks: 18/18 passed. Full regression: 722 passed, eight existing failures, 730
total. The NBA scope assertion was corrected for the additive response contract
and the existing advisory board-day behavior; no production date-scoping logic
changed. TypeScript retains nine baseline diagnostics with no added diagnostic.
The final CW08 check showed an active next scheduled cycle, healthy prior
collection, 370 receipts and no storage error or pending upload. Its schedule
modification timestamp was unchanged.

CW06 is implemented and ready for review, but **not cleared for production
deployment** while the existing repository test/type-check gates fail. No
deployment or automatic-build reactivation is authorized or performed.


## Deployment-readiness follow-up — November 14, 2026

The user authorized resolving the eight repository failures and nine TypeScript
errors before requesting release approval. No model or production behavior was
changed in this follow-up. All three edited implementation files transpile to
**identical JavaScript** compared with f343cf9; the fixes only supply type
information. The frozen CW08 model, protocol, collector, schedule, namespaces,
original data and shared probability calculations remain untouched.

### Eight failing checks resolved

| Failing cases | Actual cause and repair |
| --- | --- |
| Dashboard category coverage (1) | Both positive and negative exact-quote EVs are calculable; only one qualifies as a pick. Assert two EVs and one pick, preserving deduplication and market/date exclusions. |
| Shared EV formatter (1) | Commit 276418a deliberately made the shared formatter positive-only. Test signed arithmetic separately from that presentation rule. The seven CW06 NBA markets use their own signed metric, already tested for negative and zero returns. No NFL/NHL or featured qualification policy changes. |
| Featured heading (1) | The component already explicitly labels future cards “Upcoming Featured Picks”. Assert this heading, absence of “Today’s”, and the actual future date. |
| Featured storage outages (3) | The route gained cache/binding/player-identity imports and guarded on-demand provider fetches. Complete isolated mocks without calling providers. Assert retryable 503/no-store, no replacement cards or cache updates, and exact hydrate/next-original/save failure boundaries across all eight stored sports. |
| NHL historical goalie test (1) | The starter model requires an explicit gamesStarted=1 receipt. Supply a verified-start fixture and additionally assert missing/relief-start evidence is excluded. No goalie or frozen research model changes. |
| Public sport list (1) | The dashboard intentionally exposes NBA/NFL/NHL, with other discovery paused. Assert the existing list without unhiding sports; retain NFL’s three yardage-quarter assertions. |

### Nine TypeScript diagnostics resolved

- CFB quoted-row metadata: declare its optional quoteVersion property at the read.
- Shared ranking refresh (two diagnostics): give retainCardFinal its concrete
  RankingCard generic type so Confirmed/Pending remains the literal union.
- SGO cooldown (two diagnostics): explicitly retain the initialized shared-state
  type, including optional cooldownReason.
- Original-history helpers (two diagnostics): add a companion .d.mts declaration
  for the existing read-only checksum/recovery module; no writer changes.
- Workers env imports (two diagnostics): declare only the application-consumed
  cloudflare:workers env surface as Record<string, unknown>. Values must still
  be narrowed by runtime readers. This is neither a runtime polyfill nor a
  blanket module-any suppression.

### Release boundary

The proposed release is limited to building the reviewed branch and manually
replacing the **existing sach-sports-cloudflare-test dashboard Worker** with its
CW06 code. Preserve its bindings, namespaces, secrets and paused automatic-build
filter. Do not touch sach-cw08-nhl-shadow, its SQLite Durable Object, evidence KV,
15-minute cron, frozen model or protocol; do not introduce services or plans.

No dashboard build, upload, deployment or automatic-build reactivation has been
performed. A production bundle build and deployment-diff review must succeed
before any approved upload. After an approved release, smoke-check the seven NBA
market displays and explicit missing-evidence messages, original ranking/order,
featured cards, NBA/NFL/NHL routes and continued CW08 health. Keep automatic
builds paused throughout. If build/config checks fail, stop before uploading;
if live regressions occur, restore the recorded previous dashboard version
49db8837-1cce-425a-8ca8-d821e34ec62d without changing CW08.

Final check counts and observed read-only infrastructure status are recorded in
frontend/model-research/cw06-nba-ev/verification.json. Passing research EV tests
does not certify NBA model calibration or authorize new prediction models.

### Verified readiness result

- Full regression: **730/730 passed**, zero failures, no skipped tests.
- CW06 + NBA scope + featured outage checks: **21/21 passed**; the strengthened
  three outage-boundary checks were rerun after their final assertion changes.
- TypeScript: **zero diagnostics**, exit 0, strict/noEmit, no incremental cache.
- Emitted JavaScript parity: all three implementation files identical to f343cf9.
- Read-only Cloudflare verification: existing production dashboard version and
  paused build filter unchanged; NHL cron modification timestamp unchanged.
  CW08 reported six completed cycles, 370 receipts, zero pending uploads, no
  storage errors and healthy collection; grades remain pending official finals.
- No stored picks, historical data, model artifacts, CW08 study/runtime/config,
  provider credentials or Cloudflare resources were changed.

**CW06 is ready for deployment approval.** The eight test and nine TypeScript
blockers are resolved. A production build/configuration check and live smoke
checks belong to the approved release procedure above and have not been claimed
as completed. Approval is still required before production changes.


## Approved production release — November 14, 2026

The local CLI was unauthenticated, but the existing authenticated Cloudflare
integration successfully started the existing manual Workers Build, pinned to
commit **6a4db752bc57faa233805c9547f1ec059383f79f**. No credential was requested,
read, copied or exposed, no new hosting service was introduced, and no build
trigger, command, automatic-build branch filter or Worker binding was changed.
The existing build pipeline compiled and deployed that exact source. This was
an approved software release, with no dashboard redesign or model retraining.

- Manual build: **6054438a-9c6f-46fb-b18f-a73313e63708**, successful.
- Dashboard deployment: **b5705072-a97f-4794-b71b-8bbf73a1da60**.
- Active version: **46f9dc62-01e2-407f-b1c3-845d10e613d9** at 100% traffic.
- Released at **12:09 PM EST, November 14, 2026**.
- Previous version **49db8837-1cce-425a-8ca8-d821e34ec62d** was verified
  retrievable for rollback. No release regression requiring rollback was found.

### Live verification

Real-browser checks exercised all seven NBA market tabs and full ranking lists,
without injecting fake responses. Every requested market displayed both positive
and negative EV. API probabilities were normalized, and every available EV was
independently recomputed from its exact line, selected direction and sportsbook
price. Unavailable reasons appeared on cards, including tied projection/line and
legacy component-only combination forecasts without joint probabilities.
Compact and expanded EV values matched. No browser page errors were observed.

No exact-zero EV occurred naturally in the sampled source data. Zero arithmetic
and actual React rendering passed the controlled regression checks (7/7 with
integrity checks). This is test evidence for zero behavior, not a claimed live
zero-priced opportunity. No odds, probabilities or opportunities were invented.

All four featured NBA original player/price selections remained unchanged and
distinct, and appeared in the browser. First Basket rendered scorer cards with
no invented O/U EV. All 576 checked historical records retained their original
pick, line, projection, rank, game identity/time and saved timestamp.

NBA/NFL/NHL game APIs and model forecast APIs remained available. The NFL page
initially showed Saturday's empty day; Sunday Q1 passing rankings rendered ten
cards, and NHL rendered five cards in the browser. Existing NFL full-game
passing forecasts still fail their independent price-validation gate and do not
become qualified picks; that unrelated guard was preserved. Preliminary browser
harness timeouts on selectors and empty/unqualified slates were corrected to
exercise the intended tabs; they were not application exceptions.

CW08 retained its original Worker version and unchanged 15-minute schedule.
Its status remained ready, with no pending evidence uploads or storage errors.
Dashboard automatic builds remain paused using the existing manual-only branch
filter. Only the approved dashboard Worker was deployed.

The CW06 EV-repair scope is implemented, deployed and verified. This does not
mean every legacy row has complete model evidence or that NBA models have been
newly calibrated/certified. The expected explicit unavailable states remain.
See `frontend/model-research/cw06-nba-ev/deployment.json` for counts, provenance,
verification limits and evidence hashes. This release supersedes the earlier
"not deployed" and "approval required" snapshots in this audit.
