# Combined dashboard release — rolled back; repairs remain incomplete

The approved package `6f8980b` was uploaded using its exact frozen prebuilt artifact (application source `15d1479743e8ee51de6ff45b452c79e44624f52d`, digest `f555a37ec10e58436fd9a88f1013d934adb53eaf0b003c0590a9f2bdf4dc82f0`). No dashboard compilation/redesign, model replacement, namespace creation, migration, hosting change or added paid service occurred during deployment.

**The candidate is not live.** The compatible fallback was restored after critical live checks failed.

| Action | Toronto time, November 15 | Deployment | Version |
|---|---|---|---|
| Approved combined candidate | 10:52:02 AM | `bbd2debf-481e-4f79-87c7-7f15b5b843a6` | `e42686ba-f801-4b26-b95f-d22ded3030a3` |
| Rollback / current dashboard | 10:56:50 AM | `6e6fab80-41c8-433c-bcf9-79a2e4dd5aee` | `a48c431a-5c3e-4491-8529-38cb20dfa898` |

## Preflight and upload passed

GitHub branch `cloudflare-compatibility-test` was confirmed at `6f8980b5a570327f2adb45617d91f33104f87e27`. Frozen archive checksum, 422-file bundle digest, production configuration and prebuilt dry run matched. The previously established dashboard SQLite namespace `fc70a55e49c84d28bacc562a8d5cfb62`, class `DashboardJobQueue`, KV and compatibility settings matched the available rollback. No migration or new namespace was needed.

Manual Cloudflare build `b3b40d2e-e4f2-4d87-9e25-1336d25d06e0` succeeded using the existing authenticated Cloudflare environment. Its commands were restored immediately after the manual run was created. The automatic-build branch filter stayed `__cw08_manual_release_only__` throughout. No API-token values were read, copied, exposed or requested.

## Critical live checks failed

1. **Cold NFL collection could not progress.** Anytime TD and First TD each reached three attempts with `job_source_http_403`, zero source checkpoints and `needsAttention=true`. Fresh Pass + Rush / Rush + Receiving runs also deferred on the same error. Work correctly stayed bounded (maximum observed capture accounting 26 requests, four concurrent sources), but could not complete the required cold-source recovery gate. No hard subrequest-limit event was found in the observed candidate window. This is different from the old 220-request burst starvation: the new blocker is the fail-closed official-source HTTP 403 path. The exact failing source URL is not logged, so it must be identified safely before another release; it must not be bypassed or replaced with invented history.
2. **NBA Points + Rebounds failed live browser verification.** At 10:56:17 AM its browser API request returned HTTP 503 and the tab displayed zero rankings. A separate earlier API request had returned 20 rows with valid EV. The underlying cause of this transient 503 is not established. The completed browser log confirmed this additional failure when reviewed after the capture-triggered rollback. Other browser tabs passed without React/page errors, but that does not excuse the failed tab.

Rollback was activated as soon as the failed cold-source gate was confirmed. The withdrawn candidate's preparation command now rejects it, and its unchanged archive remains preserved for audit. Do not retry the old manual build or redeploy this artifact. A corrected artifact needs fresh release checks and deployment approval.

## Actual candidate results before rollback

These are **live candidate observations**, not local replay counts and not current fallback behavior.

| NFL market | Displayed rankings |
|---|---:|
| Passing Yards / Passing TDs / Interceptions | 16 each |
| QB Rushing / Pass + Rush | 16 each |
| Receiving Yards / Receptions | 62 each |
| Rushing Yards | 25 |
| Rush + Receiving | 21 |
| Anytime TD / First TD | 25 each |
| Sacks / Solo Tackles / Tackles + Assists | 24 / 25 / 25 |
| Q1 Passing / Receiving / Rushing | 16 / 25 / 25 |

All 17 active NFL market tabs rendered. Missing EV did not hide verified quote-backed rankings; unsupported outputs remained explained. No minimum count, direction quota or fabricated prediction was used. The recovered 62 receiving/receptions rows included later-block coverage, not replacement early picks.

NHL live browser/API counts were **25 Shots, 25 Points, 0 Assists, 7 Saves**. Assists and Goals explicitly said new predictions are withheld while accuracy is being validated; Blocks had no independently fitted model. These were not failures silently reported as zero games. Two repeated NHL browser loads took **1.690 and 0.565 seconds**, with no disappearing displayed default rankings or page/hydration errors.

NFL ranking API reads took approximately 0.2–1.6 seconds; initial NHL Shots API took 4.572 seconds. NBA ranking API reads took roughly 7–10 seconds, a remaining latency concern. All seven NBA API markets returned valid signed EV or explicit missing-evidence reasons; normalized probabilities and exact-price arithmetic passed. Available EV counts: Points 23, Rebounds 23, Assists 20, Threes 24, PRA 17, PR 20, PA 17. Both positive and negative values were observed; there was no genuine zero-valued EV in this live snapshot, so no live zero was fabricated. Browser checks passed Points, Rebounds, Assists, Threes and PRA; PR failed and PA browser checking was not reached.

All three schedule/summary APIs, featured endpoints and historical endpoints responded successfully. Schedule counts matched displayed API slates (NBA 17 current-window games, NFL 14 current-week games, NHL 7); these scopes are not a claim of 17 NBA games all occurring today.

## Capture, grading and preservation

- Four previously interrupted NFL jobs completed: Receiving Yards, Receptions, Pass + Rush and Rush + Receiving. Three original quote receipts were genuinely saved from the retained reservations; **zero new betting picks** were invented.
- New cold NFL rank jobs then failed on official-source 403 with no input checkpoints. The 15-minute stalled-work backoff operated, but this does not complete reliable capture.
- The resumed NBA grading cursor reached **1,079** and finished. It inserted **978** new grades. Every grade's original checksum, side and line binding passed; result arithmetic had no mismatch. All **978 actuals matched freshly fetched official FINAL results across 37 exact fixtures**, including supported quarter evidence. Existing grades were not replaced.
- Fresh NHL and NBA scheduled capture verification was **not reached**: the failed rollout ended before their next rotation slots. No all-sport capture completion is claimed.
- All **17 pre-release fingerprint groups** for original quotes, picks, grades and protected prior-day history matched after rollback. Originals/picks/grades have zero duplicate identity groups.
- The namespace, KV, queued cursors, original reservation documents and all new evidence remain intact. Held queue state matched across post-rollback observations at 2026-11-15T15:59:30.425Z and 2026-11-15T16:03:23.425Z (exact timestamps are in the JSON audit). The fallback holds dashboard enqueue/alarms, rather than discarding state.

## Current status

Restored fallback browser/API checks passed for all three dashboards and their schedule, featured and history endpoints, without page errors. Its older NFL ranking limitation is again present; the candidate's successful display counts must not be described as current production. The dashboard's capture/grading system is held by the compatible fallback pending a corrected approved release.

CW08 remains on deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`, with its schedule, bindings, frozen model/protocol and receipts untouched. Final read-only status was healthy with no pending uploads/storage error; see machine evidence for live counters.

Post-rollback regression: **793 passed, zero failures**. The live failures remain blockers regardless of that result. **No completion-tracker rows were changed or moved**: the combined repair did not pass its production gates. Existing tracker history was preserved.

Next: reproduce and correct the cold official-source 403 handling without bypassing provider restrictions, reproduce NBA PR's transient 503/empty-board behavior under concurrent foreground/background work, preserve complete real rankings during safe retries, rerun runtime/regression checks, then request approval for a new frozen candidate. Do not promote an unvalidated prediction model.

[Machine-readable deployment and preservation evidence](2026-11-15-combined-deployment-rollback.json). The prior [release plan](2026-11-15-nfl-capture-release-plan.json) now records rollback and withdrawal rather than remaining ready for deployment.
