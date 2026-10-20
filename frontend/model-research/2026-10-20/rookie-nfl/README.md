# Rookie exact-price replay, 20 October 2026

The included results and single-prop movement routes supplied 639 selected NFL quotes across 55 fixtures. Selection uses five source-identity-sorted players per supported market and the last valid recorded two-sided pregame price change. Calendar windows and identities do not depend on a winning outcome. The final data includes six weekday/UTC-night fixture dates; those fixtures require the preceding local sports-day scoreboard for an exact official join.

The fixed, previously fitted NFL models are reused without refitting. The return mapping uses 271 eligible decisions across 31 fixtures available under the declared 48-hour settlement convention before 16 October. There are 110 later forecasts. Exact quote identities, main-route provenance, source timestamps and American payouts are retained. This is retrospective research; provider timestamps are not presented as historical Sach captures. The October 18 outcomes overlap prior development inspections and are not an untouched prospective holdout.

Passing probability error on the later sample is below the bookmaker comparison (Brier 0.2038 versus 0.2489; 16 forecasts across ten fixtures). That small sample does not authorize a validated recommendation. Receiving, rushing and reception probability errors exceed the bookmaker comparison. Their GI outputs are withheld. The experimental passing GI uses the learned return mapping; its coarse steps and tied scores reflect the evidence rather than invented score precision. It is not a win probability.

The validated-model registry remains empty. Historical wager records, original grades, storage, backup and retention configuration are unchanged.

The compressed manifest records source URLs, retrieval times, source hashes, selection policy, rejected observations and data digests. Selected quotes, official observations, later forecast decisions and the complete evaluation report are preserved alongside it. The collection and evaluation scripts are under `scripts/collect-rookie-quotes.mjs` and `scripts/evaluate-rookie-models.mjs`.
