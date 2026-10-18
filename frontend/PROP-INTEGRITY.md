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

## Workload research bundle (2026-10-18 UTC)

Implemented:

- NFL and both CFB ranking builders read current-season, dated pregame observations only. Passing research excludes appearances below ten attempts and abstains without three qualifying appearances or known attempts. All observed values, including full-workload zeros and exclusions, remain in `researchCohort` and the expanded card. The ten-attempt rule is a **research cohort heuristic**, not a validated starter/role model. No historical files are changed.
- Combined-stat research requires all component statistics. Missing data are not treated as zero.
- NFL no longer computes Q1 research values from full-game/4. Q1 quote matching accepts a base yardage category with an explicit Q1 period or an explicit Q1 category; missing/contradictory periods do not authorize full-game substitution.
- `lib/workload-forecast.ts` and `scripts/backtest-workload.mjs` provide an **offline experimental** ridge regression and chronological evaluation path. Football features include expected workload, efficiency, opponent, injury, teammates, weather and game script; basketball requires minutes/usage/rotation/opponent; hockey requires ice time/lines/power play and confirmed goalie context. Q1 requires independently supplied period workload. New roles require at least three prior same-role records. Unknown context and scorer markets abstain. Every training result must have finalized before the target features were frozen.
- Evaluation reports coverage/abstentions, sport/market/period/season MAE and RMSE, and exact-quote settlement/ROI only where supplied quotes include traceable provenance and timing. Model fitting uses training-only normalization. Duplicate observations fail. The CLI never registers a model.

Still unfinished, explicitly:

- The offline pipeline has regression tests with **synthetic fixtures**, not a real historical accuracy backtest. No frozen historical feature dataset has been assembled or audited for these models. No calibration, validated accuracy, or betting profitability is claimed.
- Sport/market-specific workload estimators, provider ingestion of historical role/availability/weather/rotation/goalie context, and live integration remain required. Passing attempts alone cannot establish a player's current starting role.
- Genuine Q1 forecasting requires actual Q1 workload/context histories. First-basket and touchdown scorer models require separate event models. They remain unsupported.
- Matching repairs do not guarantee providers supply qualifying NFL Q1 or NBA first-basket quotes. Live coverage must be reported separately from parser tests.
- Schedule/roster/grading truth must be checked against official event records; API availability and internal count consistency are narrower checks.

Run an offline report with `node scripts/backtest-workload.mjs observations.json report.json` from `frontend`. Never reconstruct pregame features from final box scores or certify archived unverified lines with today's quotes. The model registry remains empty.

Current-roster follow-up: live roster comparison found one WNBA and three NHL rows whose historical team was not confirmed by the current official roster. WNBA now retains official numeric team IDs from schedules; WNBA and NHL overview players are joined to current active-slate rosters by player ID, remapped after transfers, and withheld on missing/conflicting membership or unavailable rosters. Old statistics, archived cards and grades remain untouched. Roster membership does not establish expected minutes, starting status, or confirmed goalie availability.

## Observed-stat tracking follow-up (2026-10-18)

- Live research cards with a verified numeric line and a reported actual regain a neutral progress bar. It measures actual/line, capped visually at the threshold, and is explicitly independent of pick confidence. Missing actuals, absent/nonpositive thresholds and scorer markets do not get invented percentages. The displayed actual continues above the threshold.
- NHL live stats now read the official `playerByGameStats.awayTeam/homeTeam` contract, including goalie save fractions and reported zeroes. NHL grading reuses the same adapter. Absent statistics remain unknown; explicit nonappearances do not become zero-stat games.
- NBA/WNBA/CBB observed-stat polling works independently of saved wagering records, including final actuals. Quarter actuals require completed, complete quarter play-by-play; no full-game scaling. It does not enable a quarter forecasting model.
- Status and stat joins require exact official fixture identity; legacy records require matching kickoff time and team context. A live/completed game involving the same team on another day cannot change a card's state. CFB no longer treats a live game itself as confirmation of each player's lineup status.
- No model is promoted, historical grade recertification performed, or storage/backup/retention configuration changed by this bundle.
