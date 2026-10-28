# P01 prospective cohort — October 28, 2026

21 paired forecasts were frozen before kickoff for Carolina at Green Bay, Thursday October 29 at 8:15 PM Toronto time (fixture 401873023). Both baseline and opponent-context candidate are fixed research models, not live recommendations. This is one independent fixture, not 21 independent games; no accuracy or promotion conclusion follows from this capture.

The capture uses the four returned NFL main-market ranking boards. Six of the 27 rows lacked qualifying prior inputs and were excluded with reasons retained. The board omitted opponent IDs; the capture verifies the exact upcoming fixture, kickoff and team IDs against the official ESPN fixture record before identifying the opponent. It never infers opponents from a matchup name. All accepted rows have fresh exact two-sided main-line prices.

Each paired forecast retains its quote, decision timestamp, exact feature vectors and fingerprints. Model/source artifact hashes identify the unchanged baseline and the previously frozen candidate. Both use the same frozen completed-game population plus the retained official-summary supplement, with a 48-hour prior-result lag. These are newly captured research forecasts; they are not substitutions for the dashboard's original historical forecasts.

The protocol was written before capture. Selection does not inspect an outcome or favor a side, score or forecast. The completed cohort has a SHA256 receipt and must remain unchanged. The scorer verifies its checksum, both input fingerprints and pregame timing before examining any results. It fetches only past fixtures, accepts only exact completed official finals and explicit player statistics, and retains unresolved games rather than inventing zeroes. It reports every market, both selection sides, pushes, Brier error, the no-vig book comparison and fixture-cluster intervals. Missing/small samples do not establish validation. The scorer cannot promote a model or write production data.

The initial scoring report in `../2026-10-28-p01-prospective-verified-pending/` correctly records all 21 decisions as pending, zero resolved, and `complete: false`. It made no result requests because the fixture was still upcoming. Scoring will require a later explicit run after an official final exists; no automatic follow-up is installed.

From `frontend`, score into a new output directory:

```sh
node scripts/score-p01-prospective.mjs model-research/2026-10-28-p01-prospective-verified /tmp/p01-after-official-final
```

To capture another independent cohort, use `scripts/capture-p01-prospective.mjs` with a new output directory. Never overwrite this cohort. P01 remains unchecked; no accuracy claim is made for the other seven sports, and no historical records, fitted live coefficients or hidden-sport settings changed.
