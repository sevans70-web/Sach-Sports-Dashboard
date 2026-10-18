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

### 18 October: executed opportunity-model research

The candidate in `lib/opportunity-backtest.ts` was fitted and evaluated against dated official logs across all six active sports. The reproducible dataset, provenance and full results are in `model-research/2026-10-18/README.md`. It includes 48,848 player-game-market observations from 224 current-board players, with no source-request transport errors. It uses prior-season training, train-only scaling, a 48-hour history lag, same-team/season feature cohorts, prior-role abstention and target relief appearances retained in outcomes. Tests cover future/outcome leakage, chronological separation and NHL goalie field semantics.

Results are mixed and do **not** validate GI or picks: NFL passing MAE improved 1.49% on only 35 eligible targets, NFL rushing worsened 6.89%, and basketball points results were essentially flat or worse. CFB passing lacks sufficient training examples; CFB receiving target workload is unavailable in these logs. Archived pregame context, exact-price calibration, genuine quarter/scorer models, independent further holdouts and prospective validation remain unfinished. The registry stays empty. Replay checks verify data digests and reproduce every market result.

### 18 October: live participation badges across active dashboards

NFL, CFB, NBA, WNBA, CBB and NHL cards now distinguish official participation from pregame lineup confirmation. Official attempts/carries/targets, basketball minutes and hockey ice time drive the live `Playing` / final `Played` badges. Starting status is not inferred from the game clock, a zero-valued market, or a player's presence in a roster. Unverified live appearances say `Participation unconfirmed`; pregame cards retain `Lineup pending` until confirmed. Expanded status text uses the same evidence and no longer calls a participating substitute a confirmed starter.

Participation polling runs every 15 seconds for exact game/player IDs, independent of whether a market has a current numeric stat or a validated pick. Evidence survives ranking refreshes for that exact fixture only. Existing basketball/NHL live endpoints supply participation alongside stats; football has an official summary endpoint, and NFL initial rankings reuse their summary evidence. Tests cover all six sports, zero-yard passing attempts, zero-catch targets, unused backups/goalies, starter versus appearance, failed/wrong-game responses and refresh preservation. Team lineup totals continue to require published team-lineup confirmation; player participation does not establish the full starting lineup.

### 18 October: one face-card status lifecycle

All active sports use one shared face-card badge: `Lineup pending` → `Lineup confirmed` → `LIVE` → `FINAL`. Live/final are game states, independent of individual participation or pregame confirmation. Removed the duplicate name-adjacent LIVE/Final badges and face-card Playing/Played badge; the clock remains visible and official participation remains in expanded details. Explicit out/inactive/DNP notices remain separate from game status. Upcoming games within two hours poll official summary confirmation once a minute; live/final stats and participation continue every 15 seconds. Pregame confirmation still requires an explicit provider flag; a scheduled game or historical appearance is insufficient. Tests cover this lifecycle and availability notices across all six active sports.

### 18 October: evidence, movement and performance scope bundle

Shared player cards now show player-specific research facts instead of repeating only the integrity warning: dated qualifying sample size/range, historical passing workload when supplied, baseline/recorded-line difference and sample results relative to that recorded line. Future and excluded observations are omitted. Comparisons are explicitly descriptive, not calibrated probabilities, historical betting hit rates, or validated edges. Expanded cards expose missing sport-specific inputs and identify the current order as unvalidated research priority. GI reads `Unvalidated`; no score or betting pick is invented.

Movement is visible beside the player's name for integrity/research cards as well as other cards. It compares exact player/fixture positions in a sport/market/slate/day board persisted on the current device. NEW means first observed/re-entering that observed board, not a global server event. Movement survives an unchanged refresh and reload; another market, date, fixture or slate cannot borrow its comparison. This device-scoped implementation is not a cross-device rank-history feed.

Performance APIs retain verified-only hit/settled/pending counts and add a separate summary of excluded historical research records: awaiting result, completed and void/withdrawn. The UI labels `Verified pending` explicitly and displays those research counts separately; records without a validated recommendation do not become pending bets. This summary covers the saved prediction-history records returned for that period/category, not every separately archived research snapshot or every visible card. Originals and historical statuses remain preserved.

Game previews/slate cards describe score margins, ties, combined scoring and entering records where supplied. Expanded context adds reported spread/total, listed availability concerns and conditions, without asserting a player forecast or making up injury/weather effects. Research rows remain visible in Game Intelligence even without a qualifying quote; baseline-versus-line trends no longer call those differences model edges. Opaque weather condition IDs are no longer displayed as weather descriptions.

Validation: 107 automated tests pass, including temporal research facts, absent quotes, quarter safeguards, tied-zero/score context, rank-scope persistence and research/verified performance separation. Production build passes. Forecast rebuilding, missing pregame context, calibrated GI, genuine quarter/scorer modeling and verified Q1/first-basket quote coverage remain unfinished. No model was registered, storage/retention/Drive settings changed, or historical records removed.

Game Intelligence also respects intentional integrity-null values: legacy `line`, `perGame`, `score` and probability aliases cannot restore an unverified quote, scaled quarter estimate or suppressed GI/probability. Regression coverage checks those exact fallback cases.

Live verification also exposed a game filter that matched blank team names and shared substrings (e.g. CHI/Chiefs), allowing an unrelated player into a fixture. Game Intelligence now requires exact fixture identity (or dated legacy matching) and exact team ID/name/abbreviation membership; unknown team names do not match either side. ESPN game detail also rejects mismatched header event IDs.
