# Evaluation against preserved NFL pregame quotes

This is retrospective diagnostic evaluation of the frozen workload distribution candidate, not validated picks, a prospective experiment, a selection for public betting, or realized returns.

The quote collector retrieved the dashboard's saved NFL QB and Offense records for `Today`. It retained 89 traceable pregame main quotes with named book, exact threshold, both labelled prices and source/capture times; 42 withdrawn records and nine records without a reconcilable official final result were excluded. Historical recommendation side, GI, projection and hit/miss flags are never used as features or to choose a quote.

Official completed summaries independently provide final observations. Those target results may be newer than 48 hours; only **feature availability** uses the 48-hour lag. The resulting dataset has 15,411 observations. Every candidate decision rebuilds prior features at the original quote capture time, checks that calibration results were available then, and rejects wrong/stale/after-start/ambiguous quotes. 74 of the 89 selected quotes have eligible forecasts; insufficient histories/current roles account for the remaining targets.

The fitted artifact SHA-256 exactly matches the earlier NFL population artifact: `8a458cd723bffc09a491aad32ec4b7676a1db2494b4347e3130886a3b88f6948`. New quoted outcomes were not fitted or used to recalibrate the model. This does not turn a model built retrospectively into a prospective test, nor remove revised-source and missing-context limitations.

| Market | Exact quoted forecasts | Model Brier | Book comparison Brier | Paper selections | Paper unit ROI |
|---|---:|---:|---:|---:|---:|
| Passing yards | 18 | 0.2361 | 0.2556 | 15 | +15.2% |
| Rushing yards | 17 | 0.3963 | 0.2505 | 16 | −52.0% |
| Receiving yards | 22 | 0.3590 | 0.2536 | 16 | −27.8% |
| Receptions | 17 | 0.2550 | 0.2442 | 14 | +7.9% |

Lower Brier is better. The bookmaker comparator removes the two quoted sides' margin; it is a benchmark, not a Sach prediction. The fixed paper policy is conditional win probability at least 55% and expected unit return at least 3%, set before these saved outcomes were collected. Paper ROI applies the quoted American payout and threshold outcome; it does not model every bookmaker's injury/refund/settlement rule and cannot be described as realized performance. Separate pushes refund the stake. Fixture-cluster bootstrap intervals are in the report; fewer than ten independent fixtures yield no interval.

Receiving and rushing probabilities fail this test, despite some earlier point/distribution improvements. Small passing/reception samples and paper profits do not establish calibration, edge, reliability or an eligible GI score. No threshold was tuned after seeing these results and no model was promoted.

`selected-quotes.json` preserves only quote inputs. The source manifest records the original data digest, public source URLs, retrieval times and rejection counts. Existing history records and book lines were not changed by the research collector. Calling the existing performance route can run its normal official grading reconciliation; no separate grade rewrite is introduced here.

From `frontend`:

```sh
MODEL_VERIFY=1 MODEL_OBSERVATIONS_DIR=model-research/2026-10-19/nfl-saved-quotes node scripts/evaluate-probability-models.mjs model-research/2026-10-19/nfl-saved-quotes model-research/2026-10-19/nfl-saved-quotes/selected-quotes.json
```

New collection requires a different explicit output directory. It checks today's saved quotes and official finals rather than reproducing a past day's source view:

```sh
node scripts/evaluate-saved-football-quotes.mjs /tmp/sach-new-saved-quote-evaluation
```
