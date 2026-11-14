# CW08 expanded calibration comparison

Safeguards and the first audit were committed first as `e00bd93` on
`cloudflare-compatibility-test`. This subsequent investigation changes research
scripts and artifacts only. Nothing was deployed or changed in production.

## Data and independent time windows

The official NHL Stats REST source supplies 149,522 individual regular-season
skater-game records from 1,228 players: 2023–24, 2024–25, 2025–26, and October
2026. All appeared skaters are included, rather than choosing today's ranking
board or filtering players by outcomes. The collector rejects duplicate keys,
incomplete responses, missing counts and incorrect season/game types.
Official `timeOnIcePerGame` is seconds; it is converted to minutes for the
existing feature contract. A second official endpoint, player game logs,
independently agrees on 360 sampled games' counts, identities and ice time.

The protocol was written before bulk collection and fixes models, penalties
and windows. All models use the existing ten prior-only opportunity features
and same-team/same-season eligibility. No target workload or result is an input.

| Stage | Window | Eligible rows per market |
| --- | --- | ---: |
| Fit expanded models | October 2023–February 8, 2025 | 72,407 |
| Calibrate | February 11–April 17, 2025 | 14,692 |
| Later-season evaluation | 2025–26 regular season | 43,485 |
| Further confirmation | October 2026 | 5,281 |

There is a 48-hour prior-result lag and a fitting/calibration embargo. Fitting
covers 930 skaters. No coefficients or hyperparameters were adjusted after
evaluation. The hurdle model was the research lead on calibration for both
markets before test metrics were inspected.

The primary independent-player analysis excludes the original ten skaters:
42,739 test appearances from 830 players and 5,186 confirmation appearances
from 641 players, per market. These are later-time observations, not randomly
split player-game rows. Results also retain the original cohort separately.

## Models and results

The alternatives are: the frozen workload/rate ridge with pooled rounded
residuals; that same frozen mean with Poisson probabilities; a direct expanded
Poisson GLM; that GLM with calibration-fitted negative-binomial dispersion; and
a hurdle model with logistic probability of any event and a correctly
zero-truncated Poisson distribution for positive counts. Normalization uses
fitting data only. Mean factors and event intercept corrections use calibration
only. Regularization is fixed in the protocol, with no test-set search.

Brier scores for OVER 0.5 outside the original ten players (lower is better):

| Model | Goals 2025–26 | Assists 2025–26 | Goals Oct 2026 | Assists Oct 2026 |
| --- | ---: | ---: | ---: | ---: |
| Existing frozen model | 0.138274 | 0.190912 | 0.141848 | 0.192423 |
| Existing mean + Poisson | 0.148013 | 0.179870 | 0.151622 | 0.182450 |
| Expanded Poisson | 0.126147 | 0.175912 | 0.131059 | 0.179314 |
| Expanded negative binomial | 0.126185 | 0.175993 | 0.131132 | 0.179436 |
| Expanded hurdle | **0.124639** | **0.174152** | **0.129942** | **0.177764** |

For the hurdle candidate, paired fixture-cluster 95% intervals for the change
in Brier versus the existing model are entirely below zero in these groups:

| Window | Goals change [95% interval] | Assists change [95% interval] |
| --- | --- | --- |
| 2025–26 | −0.013635 [−0.014269, −0.012906] | −0.016760 [−0.017906, −0.015662] |
| October 2026 | −0.011907 [−0.014176, −0.009819] | −0.014659 [−0.017886, −0.011625] |

Binary log loss and OVER 1.5 Brier also improve in both independent windows.
For October confirmation, hurdle mean biases are −0.00377 goals and −0.00193
assists. Predicted any-goal probability is 15.8847% versus 15.8696% observed;
any-assist probability is 24.7726% versus 24.7975% observed.

**The original cohort still fails regression.** On its 746 later-season rows,
the hurdle candidate worsens goals Brier from 0.206602 to 0.215227 and assists
from 0.242622 to 0.251015. Paired fixture intervals for the changes are positive:
goals +0.008625 [0.001967, 0.014985]; assists +0.008394 [0.002457, 0.013837].
October has only 95 original-cohort rows and its intervals cross zero; this
does not establish a repair of that regression. Additional original-cohort and
prior-minute strata are explicitly post-hoc diagnostics, with no subsequent
tuning. Broad improvement must not hide this failure.

## What the evidence changes

Additional historical players substantially improve count calibration on the
broader population. Merely substituting Poisson probabilities for the old mean
is insufficient: it worsens goals on the broad population too. Both the point
model's limited population and the likelihood need attention.

The direction ratio is not an acceptance target. For independent test players,
the old model predicts any goal with a constant 25% probability while only
15.15% actually score. Its count mean is 0.3386 versus 0.1708 observed. It
overstates goal production for this population despite selecting UNDER in all
the saved November goals picks. The old star-heavy cohort behaves differently.
This calls for role/player calibration, not an arbitrary increase in OVERs.

No historical bookmaker prices are present in the new source. A better Brier
score is not evidence of positive EV, profit or a validated selection threshold.
No direction split is manufactured or inferred for these outcomes-only rows.

## Recommendation and remaining CW08 requirements

**The current production model should not continue issuing new NHL goals or
assists directional/betting predictions or model-derived EV claims.** Preserve
and grade all original picks, keep sportsbook data and historical records, and
restrict experimental projections to clearly identified research. The committed
safeguards implement withholding locally; production has not been paused or
deployed by this investigation.

The expanded hurdle is a research lead, not an approved replacement. CW08
requires all of the following before release:

1. Repair the original-cohort regression with a new prespecified experiment.
   Investigate longer prior-player histories and partial pooling by player/role,
   with exposure and available historical power-play context. Fit and calibrate
   on prior dates only. Freeze the specification before using a new untouched
   period; the windows in this report are now inspected and cannot be recycled
   as fresh holdouts. Require nonregression for both markets, main supported
   lines, the original and broader cohorts, and the actual quote-eligible pool.
2. Obtain immutable, independent pregame two-sided sportsbook receipts: exact
   player/fixture/market, main line, both prices, bookmaker, quote and decision
   times, model/source digest, unrounded mean, complete probabilities and push
   mass. Test probability calibration, price-specific EV and selection outcomes
   without direction quotas or retrospective quote substitution. The new broad
   census alone cannot establish any of these claims.
3. Run a frozen prospective shadow period that captures inputs before puck
   drop, later settles official outcomes, includes abstentions/unavailable
   players, and checks role changes, transfers and missing-history coverage.
   Recalibrate GI and ranking against the final distribution/policy; do not reuse
   artifacts fitted to the old pooled likelihood.
4. Only after those gates pass, implement the approved runtime artifact and
   verify probability/quote identities, exact integer pushes, frozen-history
   preservation, selection/EV behavior and request budgets. Require application
   release regression checks. The earlier nine baseline test failures and nine
   baseline TypeScript errors remain outstanding outside this NHL research.

There is no currently approved release model. No production model artifact,
original pick, grade, application behavior for another sport, or deployment
configuration is changed by this follow-up.

## Verification, reproduction and limits

Artifacts are in `frontend/model-research/cw08-nhl-expanded/`: frozen protocol,
official player-game census, source/feature receipts, sampled official game-log
responses, candidate parameters, complete metrics/calibration bins and verification.
Derived feature matrices and raw download scratch files live under `work/`.

From `frontend`, with the existing Node dependencies and Python NumPy 2.3.5,
SciPy 1.17.0 and scikit-learn 1.8.0:

```sh
# Optional network refresh; the committed census suffices for offline reproduction.
python scripts/collect-cw08-nhl.py
python scripts/crosscheck-cw08-nhl.py

# Offline replay of frozen inputs. No application build or deployment.
node scripts/prepare-cw08-nhl.mjs
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 python scripts/evaluate-cw08-nhl.py
node scripts/verify-cw08-nhl.mjs
```

Independent JavaScript replay reproduces the Python hurdle metrics in eight
market/window/cohort groups, checks 272 count distributions' mass and means,
and runs 20 target/future-outcome mutation checks without changing input features.
The original 31 targeted safeguard tests are rerun separately.

Official logs are retrospective revisions, not frozen publication vintages.
Only appearances are counted: absent/DNP players and their pregame availability
are not represented. Same-team/same-season history requirements abstain on early
appearances and transfers; October coverage is consequently lower. Results are
not specifically a sportsbook-listed-player census. Fixture bootstrapping retains
within-game dependence but not all serial player dependence; intervals are
diagnostic rather than guarantees. These limits prevent betting approval even
where outcome metrics improve.
