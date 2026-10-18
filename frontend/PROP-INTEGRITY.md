# Cross-sport prop integrity repair

Scope: NFL, CFB, NBA, WNBA, CBB and NHL. MLB and soccer remain hidden; their stored history is untouched.

## What is repaired

- Basketball and hockey use the same exact-quote contract as football: retain one bookmaker's threshold and both American prices, source identity, quote time and capture time. Never median-average thresholds or prices. Alternate/milestone/suspended/stale/wrong-period quotes fail closed.
- Basketball/hockey quotes must match the official away/home fixture and kickoff. Whole/half count thresholds are required; synthesized values such as 8.8 points are rejected.
- A quote is distinct from a forecast. All currently implemented forecasting methods are unvalidated historical baselines, heuristic confidence formulas, bookmaker-implied scorer probabilities, or full-game/4 quarter estimates. None is registered as a validated model.
- Consequently current rows are research-only: no Sach pick, probability, GI or verified betting grade. Quarter-scaled values are not published as forecasts. Valid book quotes and full-game historical baselines remain independently inspectable.
- Unverified original lines are moved out of the face-card betting field into expandable recorded history. Research live cards show actual stats without green bet-progress bars; finals have neutral research labels.
- All six capture writers refuse unvalidated recommendations before any write, withdrawal or replacement. Prediction performance excludes them from hits/misses/pending while keeping original entries and historical statuses inspectable. Scheduled archival capture is not disabled; new research archives cannot be reimported as wagers.
- Dashboard totals distinguish source-verified quotes from independently validated recommendations; zero recommendations does not mean zero games.

## Deliberately not claimed as complete

This release fixes misrepresentation and quote handling; it does NOT make the forecast models betting-ready. The validated-model registry is intentionally empty. Do not enable picks simply by setting a provider flag, a higher GI or a client boolean.

Before registration, implement and evaluate sport/market-specific models with pregame-only inputs: football role/attempts/carries/targets and opponent, injuries and weather; basketball expected minutes/usage/availability and matchup; hockey ice time/line assignments/goalie confirmation and opponent. Quarter and first-scorer markets need their own data and models. Use chronological held-out testing, forecast error, calibration, sample-size/coverage reporting, and saved exact-line settlement. Sparse and uncertain inputs must support abstention.

Old snapshots cannot be retrospectively certified from a current bookmaker quote. Original recorded numbers and grades are preserved, not silently corrected or deleted. A sportsbook quotation's existence does not establish model accuracy.

## Storage boundary

No changes to Railway storage, volumes, settings, Google Drive backup integration, seven-day retention, or historical data deletion. Existing archival capture continues under its existing policy. Local regression fixtures use isolated temporary directories only.
