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

## Final result

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
