# CW08 v3: persistent skill, actual quotes and executable shadow validation

> Hosting/credential status below is the historical finding at `396af74`.
> See [the November 14 Cloudflare status correction](cw08-cloudflare-status.md)
> for current hosting, pushed commits, credential access and capture status.

Previous work `e00bd93` and `774f871` is preserved. The v3 model and protocol
were frozen in `007c02b` **before** new November outcomes were fetched. No
coefficients or calibration policy changed after evaluation. The verification
script compares the artifact byte-for-byte with that Git commit.

## Completed working items

- Diagnosed the original-ten regression with calibrated and uncalibrated v2
  ablations, rather than attributing it to the direction ratio.
- Fitted a persistent-skill hurdle candidate using only the prior fitting and
  calibration periods. Added prior-60-game skill features with a fixed 20-game
  league prior, retaining current-team/current-season ice-time eligibility.
  Selected global versus fixed ice-time-band calibration on calibration only.
- Collected and scored the previously unused November 1–8 outcome period after
  freezing. Evaluated all eligible appearances and the original ten separately.
- Audited all 317 archived sportsbook quote rows, including original-model
  abstentions. Replayed 221 complete, eligible November 9–12 player/fixtures at
  their exact archived decision times, lines and two-sided prices. This is an
  explicitly retrospective priced-population diagnostic, not a fresh holdout.
  This is the product's captured quote population; completeness of the whole
  sportsbook market is not established. The new shadow builder takes every
  normalized eligible player/fixture from its direct feed without a ranking cap.
- Independently checked official final fixture status and times. Retained 93
  unavailable/not-yet-final priced records as ungraded, including November 13,
  and rejected three with insufficient prior same-team history. No absent
  player was assigned an invented zero or automatic loss.
- Implemented isolated NHL-only source collection, pregame capture, immutable
  first-receipt storage, official-final grading and evidence scoring commands.
  These do not import ranking routes, publish picks, write production tables,
  alter schedulers, change production models or deploy.
- Verified input causality and independently reproduced Python probabilities,
  exact pushes, prices, EV and selection sides in JavaScript.

## Cause and what changed

The original ten are a selected high-skill population. V2's short three/eight
game history and population-wide fit shrank persistent scoring skill too far
toward the full skater population. On the inspected original cohort, v2
underpredicted any-goal probability by about 6.1 percentage points and any-assist
probability by about 5.9 points. Removing its global calibration intercept makes
the loss slightly worse, not better: goals Brier 0.215830 versus calibrated
0.215227; assists 0.251685 versus 0.251015. Global calibration is not the main
cause. Source cross-checks and exact reproduction of the legacy cohort metrics
provide no evidence of count or ice-time unit corruption in this comparison.
Retrospective source revisions and missing pregame availability remain limits.

V3 retains persistent player history across seasons/teams for skill estimates,
while current role still comes only from the current team/season. It does not
increase a probability to obtain more OVER selections, fit on bookmaker prices,
or tune a threshold against test profit.

| Cohort | Market | Legacy Brier | V2 hurdle | Frozen V3 |
| --- | --- | ---: | ---: | ---: |
| Inspected ten, 2025–26 | Goals | 0.206602 | 0.215227 | 0.203027 |
| Inspected ten, 2025–26 | Assists | 0.242622 | 0.251015 | 0.244203 |
| Fresh Nov 1–8, all | Goals | 0.142063 | 0.129925 | 0.126257 |
| Fresh Nov 1–8, all | Assists | 0.194517 | 0.177657 | 0.172644 |
| Fresh Nov 1–8, ten | Goals | 0.229167 | 0.241477 | 0.228712 |
| Fresh Nov 1–8, ten | Assists | 0.272116 | 0.273808 | 0.255214 |

Fresh validation has 1,923 appearances and 56 fixtures per market. The original
ten contribute only 36 appearances across 11 fixtures. Full-population paired
fixture Brier differences versus legacy have 95% intervals below zero: goals
[-0.019051, -0.012658], assists [-0.026954, -0.016627]. Original-ten intervals
cross zero. **The inspected assists regression is reduced but not eliminated.**
No subsequent change was made to the frozen candidate to chase those results.

## Actual sportsbook-eligible results: release still fails

| Exact archived quote population | Goals | Assists |
| --- | ---: | ---: |
| Eligible settled rows | 128 | 93 |
| Replayed legacy Brier at original lines | 0.144531 | 0.238633 |
| V3 Brier at original lines | 0.133068 | 0.242253 |
| V3 research selections, EV >= 3% | 56 | 43 |
| Retrospective selected unit ROI | -15.46% | -14.56% |

Those candidate returns are negative in a small, previously inspected calendar
window. They are not a betting-performance approval, and do not justify tuning
the threshold or selecting a more convenient period. The original quote/pick
payloads are not replaced. The legacy comparator is a reconstruction of its
frozen algorithm at archived decision times, not a claim that missing original
probability receipts have been recovered.

## Executable prospective workflow

All commands run from `frontend`. The live source builder requires the existing
`OWLS_INSIGHT_API_KEY` in the **isolated shadow runner**. It calls the provider
and official NHL endpoints directly. It uses current rosters for every upcoming
team, so rookies and transfers missing from an old statistical baseline are not
silently excluded. Ambiguous player/fixture identities abstain. Enrollment is
fixed in `model-research/cw08-nhl-v3/shadow-protocol.json` for games from November
14 through December 15, 2026 (exact UTC bounds are in the protocol).

```sh
node scripts/make-cw08-nhl-shadow-bundle.mjs ../work/cw08-shadow/bundle-UNIQUE.json
node scripts/capture-cw08-nhl-shadow.mjs ../work/cw08-shadow/bundle-UNIQUE.json ../work/cw08-shadow/study

# Obtain the exact official FINAL/OFF boxscore through the official NHL API.
# Grade files are separate; the original receipt is never rewritten.
node scripts/grade-cw08-nhl-shadow.mjs RECEIPT.json OFFICIAL_FINAL.json ../work/cw08-shadow/study/grades
node scripts/score-cw08-nhl-shadow.mjs ../work/cw08-shadow/study
```

The capture command reads the real clock; there is no capture-backdating option.
It requires fresh source reads, exact FUT/PRE fixtures, two-sided main prices,
correct market/period/player, model freeze before capture, and a two-minute
pregame buffer. It records raw eligible player history, unrounded means,
14 features, hurdle parameters, exact probabilities including pushes, both EVs,
the original research side or abstention, and both frozen models. Checksums bind
all fields. Exclusive-create read-only files reject replacement, including a
second capture for the same market/game/player. Separate attempt logs retain
rejections. Original and future outcomes cannot enter the forecast features.

Grading checks exact official game/season/time/teams and participant identity.
Missing or ambiguous participant results remain pending. It settles the saved
line/side/prices, without regenerating the decision. Pushes refund stakes.
The scorer reproduces grades and reports all, original-ten and per-line groups,
pending outcomes, pushes, sides, paired fixture Brier intervals and return
intervals. Missing or undersized groups fail their evidence gates. Minimums are
100 finalized fixtures per market, 30 original-cohort fixtures and 20 per
observed line. These are minimums, not power guarantees or automatic approval.

**Immutability boundary:** local exclusive-create files and hashes are append-only
and tamper-evident, not third-party timestamped WORM storage. Before games start,
anchor the capture manifest/receipts in an independent append-only store or a
dedicated non-deploying protected research repository. An unanchored, retrospectively created local file cannot
be presented as proven historical pregame evidence. No future capture has yet
been claimed as externally anchored or validated.

## Verification and current blockers

- 39/39 targeted model, pricing, history and shadow tests pass, including eight
  new shadow tests.
- Full frontend suite: 697 passed / 9 failed / 706 total. The same nine failure
  locations were reproduced and documented on the untouched baseline earlier.
- TypeScript: the same nine existing diagnostics, with no added diagnostics.
- Independent replay: 368 feature/causality checks and 221 exact quote probability,
  EV and side comparisons, within numerical tolerance. Frozen model hash verified.
- The real capture CLI rejected all 317 archived rows as prospective evidence;
  zero historical forecasts were backfilled as new pregame receipts.
- The 90 original saved picks still have ordered database MD5
  `c5943527f521dac178cd20bd680ff936`, unchanged from before CW08.
- No dashboard build, production prediction change, unrelated-sport change or
  deployment was performed.

The live source check is blocked by credentials in this runner. Read-only
Railway checks confirm that the existing `marvelous-wholeness` service has
`OWLS_INSIGHT_API_KEY`; the connected OAuth app returns names only and redacts
values. The runner has no local key. No production variable was changed and
no new provider subscription was requested. Zero live prospective receipts
have been accepted; synthetic test fixtures are not counted as validation.

**CW08 is not deployment-ready.** The next operational action is to run this
isolated collector in a runner with authorized access to the existing feed key,
anchor its receipts before puck drop, and accumulate official-final grades. The
current v3 model must remain shadow-only while the assists original-cohort and
priced-population regression, return evidence, sparse cohort uncertainty and
application release failures remain unresolved. The current production model
should not issue new goals/assists betting picks or model EV claims; this is a
recommendation, not a production pause performed by this work. Future model
changes require a new frozen specification and a new untouched evaluation
period; November 1–8 is now inspected and cannot be recycled as fresh evidence.
