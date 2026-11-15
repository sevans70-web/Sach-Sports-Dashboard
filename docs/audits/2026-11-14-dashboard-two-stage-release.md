# Two-stage dashboard release — candidate rolled back

**The repaired candidate is not live.** Stage 1 established the compatible namespace/fallback. Stage 2 passed browser/API checks but failed the live capture-resumption gate. The verified fallback was restored at **11:31:06 PM Toronto, November 14**. Dashboard capture/grading is held; its namespace, pending cursors, reservations and newly verified grades remain intact. CW08 is separate and continues running.

| Step | Deployment | Version |
|---|---|---|
| Stage 1: held namespace-compatible fallback | `a0aec52b-f12d-4fc3-b311-7bede10469d0` | `a48c431a-5c3e-4491-8529-38cb20dfa898` |
| Stage 2: repaired candidate, subsequently withdrawn | `ea3d889a-177b-4bb5-bd29-4ca0f6d11ab1` | `a5375cd8-b10b-497f-8355-08e48357cbad` |
| Rollback/current live dashboard | `1eae6b6f-78f4-4ad6-8f25-f43e6053465a` | `a48c431a-5c3e-4491-8529-38cb20dfa898` |

Both uploads used the authenticated Cloudflare manual environment and verified prebuilt outputs from application source `a949453`, packaged in release commit `241b73a`. No dashboard compilation/redesign or hosting change occurred. Automatic build branch filters stayed paused; temporary manual commands were restored after each job was created. No API-token values were exposed, copied or requested.

## Stage 1 passed

The new dashboard-only SQLite namespace is `fc70a55e49c84d28bacc562a8d5cfb62`. Before uploading, a real-workerd test caught and resolved a staging gap: the fallback must hold both scheduled enqueue and alarms so creating the namespace cannot activate capture. The stage-only wrapper leaves the original interface and queue schema intact. A live held cron was observed, browser checks had no hydration/page errors, schedules/counts/featured/history APIs passed for all three sports, original-record fingerprints matched, and the compatible version was retrievable before Stage 2.

The fallback hold preserves existing job rows and reservations. It does not discard or advance queued work. Six lane state/reservation digests matched across separate post-rollback observations at 04:42:38 and 04:47:10 UTC.

## Candidate browser/API verification passed

| NHL market | Candidate visible rankings | Restored fallback, later API observation |
|---|---:|---:|
| Shots on Goal | 12 | 3 |
| Points | 6 | 1 |
| Assists | 15 | 15 |
| Goalie Saves | 11 | 5 |

These are observed eligible/displayable counts, not raw response-row totals or fabricated targets. The fallback retains the former ranking behavior, so the candidate's improved counts must not be represented as current production counts. Goals and Blocks had zero complete candidate predictions and displayed coverage explanations; no minimum count was forced.

The candidate's first NHL API request took 5.304 seconds. Repeated browser loads took 2.828 and 1.298 seconds, with no React hydration or page errors. All seven NBA EV markets rendered values or accurate missing-evidence reasons. Real positive/negative EV and an actual zero EV in Assists were verified, including probability normalization and exact-price EV arithmetic. Frozen PRA/PR/PA records lacking original joint probabilities explicitly remained unavailable; no retrospective probability was invented. Featured cards and historical endpoints remained available. Tomorrow's NHL source coverage was verified, with three displayable predictions and a clearly bounded 64-player evaluated pool.

## The live recovery gate failed

NFL Receiving Yards and Receptions each retried seven times; Anytime TD retried five times. They repeatedly reached **218–220 accounted subrequests** while remaining in `rank`. No Cloudflare hard-350-limit failure was found in the candidate window. The guard protected the hard limit, but the pipeline did not make reliable forward progress.

The NFL route launches enrichment of up to 150 active rows with `Promise.all`. The job wrapper can dispatch enough provider-coordination calls to consume the allowance before the corresponding HTTP bodies finish. Aborting that burst cancels unfinished responses before their input cache entries checkpoint. The next attempt repeats the burst. The existing cache remained at 91 entries from earlier work while these markets retried. The original sequential stress test did not cover this concurrent cold-source case.

A local-only reproduction used 180 simultaneous mocked official-history reads. Three attempts each consumed 220 accounted requests (180 coordination calls and 40 HTTP calls), deferred, and persisted **zero** completed inputs. It made no external requests or picks. This reproduced the missing forward-progress guarantee without touching production data.

The candidate was immediately rolled back when that live gate failed. The current release command explicitly rejects the withdrawn candidate. **Do not retry its old manual build or mark the repair complete because regression tests pass.**

## Actual job and preservation results

- NBA: four capture jobs completed; no new eligible pregame picks were invented after games had started.
- NFL: five capture jobs completed; five remained pending at rollback, including the three repeatedly deferred rank builds and two already reserved/in-progress markets.
- NBA grading: the persisted cursor reached 50 and 45 grades were verified. Two genuinely new grades were inserted; both match official FINAL game `401909955` (Blocks: player `3134908`, UNDER 1.5, actual 4, miss; player `4600663`, UNDER 2.5, actual 1, hit). Their original line/checksum matches were verified.
- Recent replay: two completed jobs for each sport, plus one partially processed NBA replay retained at rollback.
- NHL scheduled capture was **not reached**: the rollout stopped before its 11:38 PM Toronto slot. NHL replay and candidate UI/API checks passed, but all-sport capture verification remains incomplete.
- All 17 pre-release original-record fingerprint groups matched afterward, including protected historical data. Originals/picks/grades each had zero duplicate identity groups. There were zero new original quotes and zero new model picks during the candidate window.
- Post-rollback regression: **770 passed, zero failures**. The separately reproduced concurrent progress failure remains an open release blocker.

## Protected infrastructure and remaining action

CW08 remains on deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`, with its original namespaces, credentials, frozen model/protocol and 15-minute cron. The post-rollback status was healthy: 742 receipts, 528 grades, 93 completed cycles, no pending uploads or storage error. Its research bundle remains 151874 bytes with SHA-256 `c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4`.

All dashboard cron expressions and the 350 limit are unchanged. Their capture/grading work is held by the compatible fallback until a corrected release is approved. No plan upgrade, new hosting provider, R2, Queues product, additional Worker or model promotion was introduced.

The next repair must bound concurrent source/RPC work **before dispatch/charging**, preserve completed input progress at budget boundaries, and pass a realistic cold concurrent NFL-path runtime test with cancellation/restart. Then prepare a corrected artifact, repeat the release gates and request fresh deployment approval. Keep the current namespace and all stored evidence. The user’s conditional release instruction does not authorize another live candidate after this failed gate.
