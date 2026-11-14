# CW08 — scheduled Cloudflare validation, prepared November 14, 2026

## Current status

Implemented and tested; **activation requires the user's explicit approval**.
No research Worker, Durable Object, namespace or schedule has been created by
this continuation. No production model has been deployed or tuned. The existing
`cloudflare-compatibility-test` Git trigger remains paused on
`__cw08_manual_release_only__`. The dashboard's build/deploy commands remain
unchanged. The verified November 14 package and all previous commits are intact.

## Exact activation change

The reviewable plan is `frontend/shadow/cw08/deployment-plan.json`:

- Deploy a separate Worker **`sach-cw08-nhl-shadow`** in the existing Cloudflare
  account, with a single SQLite-backed **`NhlShadowCoordinator`** Durable Object
  for the frozen study `cw08-nhl-v3-prospective-shadow`.
- Create one private KV namespace titled **`sach-cw08-nhl-shadow-evidence`**.
  It uses the already enabled KV service. R2 was considered, but Cloudflare
  returned error 10042, "Please enable R2 through the Cloudflare Dashboard";
  this plan does **not** enable R2 or require an R2 subscription.
- Give the new Worker only its own Durable Object and namespace bindings, an
  encrypted copy of the existing `OWLS_INSIGHT_API_KEY`, and a randomly generated
  encrypted bootstrap token. It receives no Cloudflare API token, Supabase
  credentials, production KV binding or dashboard service binding.
- Import the **339 original** pregame receipts from the existing Git-anchored
  November 14 package without regenerating them or replacing their prices,
  timestamps, probabilities, sides, hashes or historical observations.
- After every imported receipt reproduces and the live readiness check passes,
  install **`*/15 * * * *`** on the new Worker. It wakes the durable coordinator;
  alarms advance small, checkpointed collection/grading steps.
- Enable the new Worker's workers.dev address. Public GET `/status` returns only
  operational counts, evidence summaries and manifest references. Authenticated
  POST `/bootstrap` accepts only exact, already-anchored seed receipts. There is
  no public collect, grade, publish or model-promotion route.

Normal Workers/Durable Objects/KV usage applies; the plan does not authorize an
account-plan upgrade. No production routes or dashboard assets change. The
frozen research candidate executes only inside this isolated validation service;
it is not registered as a production prediction model.

The proposed one-time activation runs **inside the existing Cloudflare manual
build environment** so feed credentials never leave Cloudflare. After approval,
verify the branch pause, temporarily replace only that trigger's build command
with a shadow-activation command and make its deploy command a no-op. Leave its
branch include paused throughout. Invoke the exact approved full Git SHA. Restore
its original dashboard build/deploy commands in a finally step, even on failure.
The activation script does not modify this trigger itself.

```sh
# Only inside the existing Cloudflare manual job, after explicit approval:
# APPROVED_FULL_SHA must be the actual reviewed 40-character commit.
cd frontend
npm ci --ignore-scripts --no-audit --no-fund
CF_CW08_ACTIVATION=approved CF_CW08_APPROVED_COMMIT=APPROVED_FULL_SHA \
  node shadow/cw08/activate.mjs
# The Cloudflare job's deploy command must be a no-op, never deploy:vinext.
```

`activate.mjs` checks the exact approved commit, frozen artifacts, production
Worker version and build pause before resource mutations. Existing matching
research deployments may be resumed; a different bundle or mismatched namespace
is refused. A failed seed import leaves cron disabled. It does not delete evidence
on rollback. Permission failures stop safely; it does not broaden credentials or
copy their values into local files/logs. Verify actual token permissions during
activation; those resource mutations have not been attempted without approval.

## Frozen study and collection

Model coefficients remain byte-for-byte `007c02b`; the implementation and pricing
inputs are pinned to `396af74`, and the original enrollment ledger to `27324da`.
Packaging fails if pinned files change. The original November 14–December 15
protocol bytes are unchanged. The baseline is taken from the verified November
14 receipts, not whichever model might later enter the live registry.

Discovery uses official NHL schedules and standings on the Toronto calendar,
regular-season FUT/PRE fixtures and all current skater rosters. Matching uses
the existing exact market/period/player/fixture adapters, with no ranking cap,
side quota or EV-based enrollment. Four seasons of official player history are
retained; causal history uses the original 48-hour availability lag. Same-day
history reads are reused through immutable references; errors are not cached as
successful observations. The final fixture and quote reads follow history
preparation, and the existing quote freshness, pregame buffer, exact two-sided
price, count distribution and selection rules still apply.

No enrollment occurs outside the frozen target-game interval. Collection closes
at `2026-12-15T12:00:00Z`; final grading and pending-result recovery continue.
Provider or identity failures produce rejections/retries, never invented picks,
probabilities, zero outcomes or forced OVERs.

## Serialization, immutability and recovery

The study is one coordination atom. A unique cycle per 15-minute slot, a durable
lease and fencing checks prevent overlapping alarm deliveries from advancing the
same work. Ticks arriving during a job are coalesced; they cannot start a parallel
collector. No network call is held inside `blockConcurrencyWhile` or a SQLite
transaction. Constructor gating is used only for schema initialization.

A unique SQLite primary key on `market|game|player` elects the first receipt.
Before any upload, a transaction preserves its exact compressed body, receipt
checksum and evidence-object reference. Neither later quotes nor an expired
lease can replace it. Durable Object SQLite is authoritative; KV reads never
choose enrollment or outcomes. The compressed body stays in SQLite after backup,
so eviction, crashes and eventual KV visibility do not require regenerating a
forecast. Retries write the exact reserved bytes under their content hash.
Conflicting backup bytes fail closed.

All source/receipt/grade/run objects are content-addressed and hash-verified.
Each completed run has a hash-linked manifest, source/rejection references,
backup-confirmation times and automatic validation summary. Cloudflare logs
record only safe retry codes and completed manifest hashes. A receipt whose
backup cannot be confirmed before puck drop is marked late and excluded from
validation, while its original reservation is retained. The November 14 seed
uses its independently recorded pregame Git anchor and is not backdated on
import.

This is append-only application behavior and tamper-evident references, **not a
claim of WORM storage against a Cloudflare account administrator**. The original
Git anchor is preserved, and manifest-chain hashes are independently recorded in
Cloudflare invocation logs. Retain independent exports/anchors for audit; an
operator cannot silently replace a receipt and keep its original hash valid.

## Automatic final grading and scoring

Every cycle handles due grading before preparing new collection. It fetches the
exact official NHL boxscore and requires matching game, season, start time,
teams, FINAL/OFF status and a unique participating player with an integer count.
The saved quote's exact line, side and two-sided prices determine settlement;
integer pushes refund. In-progress games retry, and absent/ambiguous participant
results stay pending with an explicit reason, never a fabricated DNP zero.

Grade body, official final source, hash and receipt link are durably reserved
before upload. A lost acknowledgement retries the same grade even if the live
source subsequently changes. Original receipts and first grades are not rewritten.

The same pure scoring function serves the existing CLI and scheduled manifests.
It reports all, original-ten and per-line groups, pending results, pushes,
OVER/UNDER counts, fixture-clustered Brier differences and unit-return intervals.
Only durably backed, timely anchored receipts enter validation. Reports always
have `releaseApproved:false`; no promotion path exists. The full report remains
identical to the prior CLI on the original 339 pending receipts after refactoring.

## Verification

The local Workers runtime integration uses installed Miniflare/workerd, real
SQLite-backed Durable Objects and KV, intercepted GET-only NHL/provider sources,
and separate temporary persistence directories. Synthetic outcomes remain in
local test storage; none are uploaded or counted as real validation results.

Verified scenarios include the actual scheduled handler, authenticated seed
bootstrap, all 339 original forecasts replayed in workerd, repeated bootstrap,
rejected changed seed data, duplicate ticks, a held durable lease, transient
provider failure/backoff, loss of a receipt upload acknowledgement, full runtime
restart, unchanged first quotes on a later cycle, missing/non-final participants,
grade acknowledgement loss followed by a changed source, exactly-once saved
grades, exact official source/receipt regrading, automatic evidence gates and
collection cutoff. Production packaging excludes every local test control and
production writer; metadata exposes only the four approved bindings.

The installed workerd supports compatibility dates through November 11, so local
runtime tests use `2026-11-11`; the proposed new Worker uses today's
`2026-11-14`. Actual Cloudflare startup and seeded live readiness must pass before
cron is enabled. This limitation is explicit rather than claiming local testing
at an unsupported date. No new dependency or dashboard rebuild was needed.

Test counts and baseline diagnostics are recorded in
`frontend/shadow/cw08/verification.json` after the final checks.

## What still requires future results

The real 339-receipt package remains pregame/pending at this continuation; local
synthetic finals are not evidence of candidate performance. After activation,
collect and grade the untouched protocol period without tuning. Required minimums
remain 100 finalized fixtures per market, 30 original-cohort fixtures and 20 per
observed supported line, alongside paired non-regression and positive-return
uncertainty gates. Pending/late/missing evidence and application release failures
also require review. **CW08 is not cleared for production deployment.**

Final verification: 17/17 focused tests passed. The full frontend suite has
706 passes and the same nine recorded baseline failures (715 total); the last
scheduler-only recovery/audit refinements passed the full focused workflow again.
TypeScript has the same nine baseline diagnostics. Independent replay repeated
368 feature/causality checks and 221 probability, price, EV and side comparisons.
The latest Cloudflare read-only recheck was not executed: automatic approval
review hit a usage limit. This is a review failure, not an unsafe-action finding.
No Cloudflare writes were attempted, and activation remains explicitly pending.

## Activation preflight correction

The first approved manual job `f27c3dcc-0c39-4a15-a5bd-605265f52364`
stopped on a read-only build-trigger API request: the existing build token
returned HTTP 403. No research resource was created. Original dashboard build
commands were restored with automatic builds still paused. The authorized
Cloudflare control connection can verify that pause without changing token
permissions. Activation now requires that exact trigger UUID and an external
verification timestamp less than 15 minutes old, alongside the approved commit.
The script continues to verify the production Worker version before and after
activation. The control connection must reverify the pause and restore build
commands after every manual attempt. No token permissions are broadened.

## Live roster redirect repair

The first natural cycle at 05:15 UTC ran but its manifest exposed 31 roster
HTTP 307 failures. This is not a successful enrollment cycle. The official
`/roster/TEAM/current` endpoint redirects to `/roster/TEAM/20262027`. Collection
was paused while bounded same-origin NHL redirect handling was repaired.
Sportsbook redirects remain rejected, off-host/HTTP redirects are forbidden,
and no feed credentials are attached to official NHL requests. Full workflow
tests now reproduce the actual roster redirect; loop/off-host/credential
forwarding checks and all 18 focused tests pass.

The research-only replacement is fenced against the exact observed old bundle
SHA-256. It reuses the existing SQLite namespace and KV binding, checks ready
enrollment after upload, and avoids reimporting already verified original
receipts. The frozen model, original seed hashes and evaluation protocol are
unchanged. Live status and manifests now expose collection-health counts rather
than treating a technically completed cycle as proof of successful data capture.
