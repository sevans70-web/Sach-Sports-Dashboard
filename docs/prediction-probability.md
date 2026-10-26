# Prediction probability and accuracy work

The shared rankings card shows the original selected-side probability only when the saved pregame fitted forecast and exact sportsbook quote pass the same evidence checks as Estimated EV. A forecast direction or bookmaker-implied scorer chance alone cannot produce a model probability. The displayed probability is unconditional; pushes are separate outcomes.

The history/performance API exposes probabilityAccuracy grouped by sport, market and OVER/UNDER. It uses original retained forecast probabilities, excludes pending/void/withdrawn/unsupported and direction-mismatched records, deduplicates player/fixture/market within sport, and reports conditional-on-no-push Brier and calibration bins. It is a diagnostic of retained qualifying selections, not all offered opportunities or proof of profitability. Small samples and missing source history remain limitations. No source archives are rewritten.

Existing NFL saved-quote development evaluation (2026-10-19/nfl-saved-quotes) has only 18/22/17/17 exact quotes for passing/receiving/receptions/rushing. Receiving and rushing Brier scores are worse than the no-vig sportsbook benchmark. Passing projection MAE is also worse than its baseline. These reused development observations cannot establish prospective accuracy. Existing failed-validation gates remain intact; no threshold is relaxed, probability inflated or model promoted by this change.

Remaining work: independent prospective evaluation by sport/market/side, diagnosis and improvement of workload/distribution errors, larger frozen exact-quote samples, and production browser verification once infrastructure deploys. Hidden sport visibility remains unchanged.
