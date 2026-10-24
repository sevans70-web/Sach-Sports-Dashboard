# Football card and model audit — October 24, 2026

## Verified defects repaired

CFB's primary book adapter waited for the secondary provider even when the primary already supplied the exact requested market. The board allowed four seconds before substituting unpriced fallback rows, while the secondary transport could wait eight seconds. The adapter now returns executable primary quotes immediately and uses the secondary only when primary coverage is absent. The primary request has a twelve-second allowance, consistent with its ten-second transport timeout.

CFB also loaded the full fallback roster in parallel for every primary-backed build and waited for it. Fallback rosters are now requested only after no exact primary quote survives slate/fixture checks. Existing early/afternoon/evening blocks and frozen records remain intact.

Public cards now use `No Qualified Pick` instead of `PASS`. A missing market model and a model that failed accuracy checks have separate explanations. No failed model is re-enabled and no score or projection is invented.

## Why the remaining fields are absent

The production runtime contains NFL passing yards, receiving yards, receptions and rushing yards models. Receiving, receptions and rushing failed the preserved exact-price check and withhold picks/GI. NFL passing-yard GI is explicitly experimental, based on limited evidence; its presence does not certify all football markets. Touchdown and unsupported combination markets have no fitted scorer/combination model. The CFB runtime contains no fitted college models.

## New CFB observations and evaluation

The collector now supports explicit NFL/CFB selection and explicit study seasons. It collected 12,951 passing/rushing observations from 895 discovered completed 2024–2026 fixtures. The official receiving tables in this sample omit target counts, so no receiving-target workload is fabricated from receptions. Two source errors are retained in `source-manifest.json`. The source scoreboard returned at most 25 events per week and is not certified as a complete season population.

Both pooled and workload-conditional calibration reports are retained in separate directories. With pooled calibration, passing point MAE was 57.64 versus 63.23 for the historical comparison (62 forecasts); rushing MAE was 26.46 versus 27.63 (227 forecasts). These are retrospective candidate evaluations, not approved betting models. The passing CRPS improvement interval includes zero, the 2026 sample is not an untouched holdout, and exact quote samples are zero. Candidate models and observations are preserved in `cfb-candidate.json.gz.base64` with a checksum manifest, **not loaded by production**.

Still required: better verified receiving workload coverage, scorer/combination/quarter models, larger independent evaluation, exact-price calibration and GI validation. No historical call, line, result or timestamp was rewritten. No paid service was added or upgraded.

## Checks

264 tests passed and production build passed before release. Targeted tests prove that a valid primary quote bypasses a failing secondary provider and that absent coverage does not create a line. Card tests distinguish missing forecasts from failed accuracy checks.
