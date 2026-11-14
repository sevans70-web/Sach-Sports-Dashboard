# CW08 NHL goals and assists

Branch: `cloudflare-compatibility-test`; baseline: `b5de46b`.
Application: `frontend`. No deployment, dashboard rebuild, database mutation,
historical resave, or change to another sport's selection policy.

## Evidence and cause

The read-only Supabase query covers November 1–13, 2026 inclusively. It found
90 original picks, all dated November 9–13: assists 57 UNDER / 4 OVER (93.4%
UNDER), goals 29 UNDER / 0 OVER. There are no picks in this table for November
1–8. The audit export is `frontend/model-research/cw08-nhl/saved-picks-audit.json`.
It is an independent receipt, not a replacement for original history.

1. **Point model:** The existing workload × rate ridge fit uses only 476 fitting
   and 216 calibration examples per market, from ten skaters selected for the
   original source cohort. It is not a population NHL model. The November saved
   goals means are 0.3–0.5; mean 0.3793. Assists UNDER means average 0.6491.
   This evidence does not establish that all those means should be increased.
   In the archived evaluation, goals mean prediction 0.3526 versus actual 0.3405
   is not systematically too low; assists mean 0.5693 versus actual 0.5925 is
   slightly low. Arbitrarily boosting projections would not be a justified fix.
2. **Likelihood:** `distributionValues` adds pooled calibration errors to every
   target mean, clamps at zero, and rounds to an integer. For sparse counts,
   this transports the calibration players' zero/one outcomes as residual
   bands rather than conditioning a count likelihood on the new mean. Goals
   OVER probability stays at 0.25 across the archived evaluation cohort; all
   seven November goals probability receipts also contain exactly 0.25. This
   creates unresponsive probability and EV estimates. A mean is not a median:
   a legitimate mean of 0.6 at line 0.5 can still favor UNDER. Of 57 assists
   UNDERs, 44 have a rounded mean above the line; that alone is not a bug.
3. **Selection:** The shared research policy chooses the higher-EV side, then
   requires both a 55% conditional win chance and 3% EV. A goals OVER with
   probability 0.33 and odds +300 has positive EV but is rejected by the 55%
   gate. The opposite favorite UNDER can qualify. Thus an all-UNDER selected
   subset does not mean the underlying board has no OVER value. Two-sided
   prices and payout, rather than an arbitrary direction ratio, must determine
   eligibility. The old NHL UI also applies a five-UNDER cap; this hides rows
   and does not repair probability or the saved selection process.

## Changes

- Add an explicit NHL goals/assists Poisson **candidate** likelihood. It retains
  zero and multi-count mass, has an expected value equal to the fitted mean,
  responds continuously to that mean, and computes exact integer push mass.
  Quantile samples are used only for interval display; exact masses price bets.
- Add probability-based price evaluation without changing the default shared
  policy. The NHL count candidate uses the same 3% EV requirement for either
  side and no 55% hit-rate floor. There is no direction quota.
- Withhold new NHL goals/assists model selections and GI because the candidate
  fails accuracy regression. Existing GI artifacts evaluated a different
  likelihood/policy and cannot be reused. The existing `price_validation_failed`
  signal blocks picks, EV ranking and recommendation fallbacks. Candidate
  diagnostics identify the count model and the pending revalidation explicitly.
- Remove the five-UNDER cap for NHL in presentation and matching coverage counts.
  Other sports retain their existing behavior.
- Preserve frozen saved forecasts before executing the new candidate. No
  original pick, line, probability, grade, or runtime source artifact is changed.

## Reproducible accuracy check

From `frontend`, run `node scripts/audit-cw08-nhl.mjs`. It verifies the runtime
checksum, reconstructs every original calibration residual from archived
observations, and evaluates the later 2025–26 season with a 48-hour lag.
There is no refitting, target-outcome input, November tuning, or network request.
The machine-readable result is `model-research/cw08-nhl/regression-report.json`.

| Market | Evaluation rows | Legacy Brier | Count candidate Brier | Decision |
| --- | ---: | ---: | ---: | --- |
| Goals | 746 | 0.206602 | 0.207817 | Withhold |
| Assists | 746 | 0.242622 | 0.244299 | Withhold |

Lower Brier is better. The candidate removes the plateau but slightly worsens
accuracy, so it is not an approved replacement betting model.
`node scripts/audit-cw08-nhl.mjs --require-approval` intentionally exits 1.
The previously inspected evaluation season is a regression set, not a fresh
holdout. Approval also requires representative count calibration and independent
exact-price performance evidence; improving this Brier score alone is insufficient.

Only 15 of 90 November originals contain probability receipts; most contain
only a rounded mean and the original selection. Exact historical replay of all
90 decisions cannot be claimed from these fields. The saved hit/miss results
are descriptive, not the training or calibration target for this repair.

Database originals were queried read-only. Their row count is 90 and the
ordered-record MD5 receipt is `c5943527f521dac178cd20bd680ff936`.

## Verification

The targeted tests cover count mass/mean, push handling, mean-versus-median,
both selection directions and abstention, quote freshness, withholding invalid
GI/EV fallbacks, frozen original preservation, NHL direction-cap removal, and
unchanged shared selection behavior. The full frontend suite and TypeScript
check are also compared with the untouched baseline; see the final verification
receipt alongside the regression report for counts and baseline failures.

**Release remains blocked:** count accuracy and exact-price approval have not
passed. No deployment is authorized by this report.
