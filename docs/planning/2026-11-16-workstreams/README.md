# Tracker workstreams and recommended R1 batch

Planning only; no application/model/configuration/deployment changes. Preserve code commits `600bd5d` and `fe353dc`. The authoritative tracker is the existing [Sach Sports Completion Tracker](https://docs.google.com/spreadsheets/d/1YVHL_0J_S1El0hKbduRKSySP_-Gh9tXJMNVcgOWeFp8/edit#gid=2026111601).

## Inventory and preservation

| Workstream | Active repairs | Paused repairs | Future ideas | Unique outstanding IDs |
| --- | ---: | ---: | ---: | ---: |
| A — Infrastructure & Stability | 7 | 5 | 1 | 13 |
| B — Data Sources & Collection | 4 | 5 | 3 | 12 |
| C — Predictions & Analytics | 11 | 5 | 10 | 26 |
| D — Dashboard Presentation | 5 | 4 | 6 | 15 |
| Total | 27 | 19 | 20 | 66 |

There are **46 outstanding repair IDs**, including 19 owner-paused scopes, plus 20 future ideas that are not approved development. Five existing deferred rows duplicate IDs in the consolidated paused tab and are counted once. Eight historical P01 review entries are subordinate checks, not new checklist IDs. All 35 verified completed IDs remain unchanged: 34 completed-tab records and Wish W19. No task was reopened, deleted, moved to completed or reactivated.

Each outstanding item now has its primary workstream, specific dependencies, current assessment, remaining acceptance, coded-but-not-deployed state, external blocker assessment, release batch and evidence. Canonical active/paused repair rows use new L:S columns; Wish list uses H:O, skipping completed W19. Historical P01 subchecks use I:L and remain linked to their parents. Original IDs, histories, statuses, comments and acceptance columns were not rewritten. Four native filter views organize the active master without physically moving its rows. The new overview holds live count formulas, source/evidence gates and the full R1 plan.

Verification read back all 568 planning cells on 71 physical rows (66 unique IDs plus five mirrors), all eight review links, four filter links and count formulas. All 1,032 originally populated cells in the inspected source ranges retain identical user-entered values. Completed-tab and W19 state remain intact. Native cell values/formulas/validation/wrapping were checked; native rendered Sheet inspection was unavailable, so no visual-fit claim is made.

## Source blockers and internal requirements

- **ESPN:** last verified NFL athlete-gamelog/search HTTP 403 is a genuine restriction on some fresh history. It does not erase valid sportsbook rankings. Respect denials/cooldowns and use legitimate provider access/support or a separately approved authorized alternative. nflverse is tested research-only for full-game weekly history; it cannot replace Q1 splits or first-touchdown order.
- **SportsGameOdds:** existing HTTP 401 remains unresolved for an optional backup. Existing-account credential/usage verification or support is required. No secret extraction, spending, upgrade, rotation or provider change is approved. It need not block a safe release using verified OWL data.
- **OWL:** owner-confirmed Rookie active through December 15; latest retained dashboard-bound NFL/NHL checks succeeded. Keep working credentials. Recheck once at release; successful access does not certify every market's coverage. Earlier Error 1010 was an audit-client restriction, not evidence of a new production feed failure.
- **Missing evidence/internal work:** F04's original Waller receipt is absent; this is not an established provider outage. Admin loading/auth/backup and injury/scratch coverage need verification before assigning an external cause. Unsupported Q1/scorer/joint models need actual implementation and validation, not invented probabilities.
- **CW08:** frozen November 14–December 15 protocol and separate research deployment remain untouched. Future official results and sample/validation gates are not a provider outage; no model tuning or promotion is part of R1.

## Recommended first batch: R1 — Stability and existing-ranking recovery

Four already-coded units, through verified `600bd5d`/`fe353dc`:

1. **NBA foreground compatibility/recovery:** manual redirect rejection and bounded cancellation; scoreboards excluded from the long history cache; malformed scoreboard rejection before short-cache insertion. Preserve PR memory and seven-market signed/zero EV repairs.
2. **Dashboard background recovery:** existing dashboard-only per-sport SQLite lanes; four concurrent sources, reservations, 220-request job guard under 350 Worker subrequests; durable source/cursor checkpoints, cooldowns, abort/drain, bounded stalls and idempotent lost-ACK restart. Preserve original/new evidence and separate grades.
3. **NFL existing ranking visibility:** legitimate quote-backed rankings across 17 tabs including quarterbacks, without hiding valid rows when independent EV/forecasts are unavailable. Accurate reasons; no invented confidence, directions or picks; preserve saved originals.
4. **NHL existing loading/coverage:** bounded refresh, current-season history and exact identity matching; retain saved started-game rows; verify Shots/Points/Assists/Saves and Goals/Blocks safeguards with honest missing-evidence explanations. No target count or new model.

Excluded: research Worker changes, model tuning/promotion, nflverse runtime adoption, paid services, provider/key/plan changes, redesign, future ideas, retired-sport activation and bulk regrading. CBB/CFB receive shared/read-only regression protection without enabling new scheduled collection.

### Production-equivalent tests and pre-upload gates

Re-run the actual shipping workerd/Vinext cold summary and concurrent summary/slate routes at production compatibility settings with real recorded source fixtures and isolated SQLite/KV. Preserve the withdrawn 503/24-unsupported-attempt reproduction and corrected 200/17-game/zero-unsupported result. Cover same/cross-host redirect rejection, authentication denials, rate limits, malformed data, timeouts and recovery. Verify bounded capture, restart/lost ACK, cursor/source checkpoints, no orphans/duplicates and foreground concurrency. Regress NBA seven-market EV/PR/featured/history, NFL 17 tabs, NHL six markets, CBB/CFB integration and archived hidden sports.

Retained baseline evidence is 830 passing regressions/zero failures, 17 passing compiled-runtime checks, zero TypeScript diagnostics, successful production build and prebuilt dry-run; these were not rerun for this planning-only task. Any source edit requires relevant reruns. Freeze a **new** artifact, verify digest/source ancestry/configuration and existing bindings, confirm compatible fallback, read/checksum protected history and new receipts, verify latest complete backup and non-destructive restore rehearsal, and perform bounded fresh authorized OWL checks. Obtain deployment approval. Older failed artifacts stay quarantined.

### Actual production acceptance

Use a real production browser with TLS verification enabled, no replay or frozen clock. Record deployment/version, source times, screenshots and expanded UI/API counts. Check all 17 NFL tabs (expand finished groups), six NHL markets with honest coverage and current/tomorrow rosters, all seven NBA EV markets and repeated PR loads, schedules, eligible pick counts, featured selections and historical records. Test desktop plus phone-size/PWA navigation/refresh and CBB/CFB smoke behavior. No hydration/page errors, repeated stalls, false zeros or disappearing retained data. Prove zero EV in runtime if no natural exact-zero live example exists; never fabricate one.

Proposed performance gate: usable page within 15 seconds cold, warm API p95 within 5 seconds over a documented representative sample; record sample size/cache/provider context and separate browser from Worker duration. This is a release criterion, not a claimed production guarantee.

Observe a full **38-minute capture rotation** (38 markets, two per two-minute tick) and naturally scheduled NBA/NHL/NFL grading at :00/:30, allowing **up to 90 minutes** for all three lanes. Require genuine enqueue and checkpoint/cursor/phase progress or completion, concurrency ≤4, accounted requests ≤220, no hard 350-request/memory/CPU/lease/I/O failure and no cross-sport starvation. Exercise artificial faults only in isolated runtime; observe real pending/retried jobs and official-final grades in production. If a required genuine pregame/final/interruption sample is absent, leave that gate open and state the next observation; no-op HTTP 200 is not a fabricated grade or proof of recovery.

### Rollback and completion

Before activation confirm fallback version `a48c431a-5c3e-4491-8529-38cb20dfa898`, currently serving as deployment `4e8f8721-6e0a-4836-b877-9446a0f360d0`. Preserve namespace/KV/secrets and all original/new receipts. A critical availability/browser/resource/starvation/integrity/config failure requires immediate compatible fallback and browser/API/history verification, with no automatic second deployment.

R1 passes only after approved artifact identity, real browser/API counts and EV/reasons, performance/resource, genuine scheduled progress/grading, recovery/duplicates, historical checksums and backup/fallback gates all pass with CW08 unchanged. Record every unresolved exception. Full checklist rows close only when their original and current acceptance both pass; R1 does not blanket-close CW07/CW08/P01/CW03/CW10 or reopen completed CW05/CW06. Broader missing backup/mobile/live/final evidence keeps CW11/L10/L11 open. Later batches can address admin/history reliability, source-specific work, shared-card/analytics and separately validated models.

## Operational status

Only read-only Cloudflare checks were made. Dashboard automatic builds remain paused (`__cw08_manual_release_only__`); original build/deploy commands remain unchanged. CW08 remains on deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` with its unchanged 15-minute schedule. No Worker, credentials, frozen model, validation protocol or original historical record was modified.
