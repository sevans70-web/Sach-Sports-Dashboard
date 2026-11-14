# CW08 — Cloudflare and GitHub status, November 14, 2026

## Hosting correction and push safety

Production is the Cloudflare Worker `sach-sports-cloudflare-test`, serving
`sach-sports-cloudflare-test.sevans70.workers.dev`. The name does not mean an
unused staging instance. No Pages project was found. Railway references in
older audits describe legacy configuration/credential discovery; they are not
production-hosting instructions. The health endpoint's `RAILWAY_GIT_COMMIT_SHA`
lookup is obsolete and returns null on Cloudflare. Deployment API metadata is
the authority for this check.

Commits `e00bd93`, `774f871`, `007c02b`, and `396af74` were local ahead of remote
`b5de46b`. All four were pushed to the existing
`sevans70-web/Sach-Sports-Dashboard:cloudflare-compatibility-test` branch after
explicit user approval to pause that Worker's automatic builds. They remain
ancestors of the branch tip. No branch was replaced, reset or force-pushed.

The Git trigger originally built and deployed every push on this branch.
Automatic builds are now paused by the non-existent branch include
`__cw08_manual_release_only__`, with no matching production branch. This remains
paused until a release is explicitly authorized. Other Workers, runtime cron,
production prediction generation and the running dashboard are unchanged.
Original dashboard build/deploy commands must be restored after each manual
shadow job, while retaining this branch pause. A push must never be assumed
non-deploying without checking the trigger first.

The active deployment throughout this work is
`e85e558a-5c4c-41fc-9e51-ac144759ca80`, version
`49db8837-1cce-425a-8ca8-d821e34ec62d` at 100%, deployed
`2026-11-14T00:21:44.792593Z`. No CW08 code is deployed.

## Credentials and read-only production checks

Both `OWLS_INSIGHT_API_KEY` and `SPORTSGAMEODDS_API_KEY` exist as encrypted
Cloudflare runtime secrets and encrypted Workers Builds variables. Values were
not retrieved, copied locally, committed or logged. The direct source collector
successfully authenticated inside Cloudflare. No essential primary NHL feed
credential needs to be recovered from Railway. The supplement returned no rows
in the audited snapshot, so its presence alone is not proof of supplemental
market coverage.

Health and NBA/NFL/NHL pages returned HTTP 200. Read-only feed checks returned
NBA 9 games, NFL 13 games, NHL 15 games / 6,377 props (including 2,602 goals and
590 assists). This establishes availability, not prediction accuracy. No ranking
or pick-capture endpoint was invoked to generate validation data.

## Isolated Cloudflare shadow execution

`frontend/scripts/run-cw08-cloudflare-shadow.mjs` requires explicit
`CF_CW08_SHADOW_ONLY=1`. It runs as a manually invoked Workers Builds job using
the existing encrypted credentials. It does not compile the dashboard, import
ranking routes, publish predictions or deploy a Worker. The job installs Node
dependencies with lifecycle scripts disabled and uses only the NHL collector.
The temporary deployment command merely prints a shadow-only notice.

The frozen model remains exactly `007c02b`; capture is prospective using the
actual clock, fresh exact two-sided main-line prices and official FUT/PRE
fixtures. Complete packages retain source bundle, raw prior player history,
receipt hashes, frozen models, protocol and rejection logs. The secret scanner
refuses packages containing credentials. The extractor verifies whole-package
checksums, every receipt, cohort uniqueness, causal history, model scope and the
independent Cloudflare timestamp before accepting files. Exclusive creation
refuses replacement.

Two log-export trials are infrastructure tests, not preserved validation:

- Job `500a6353-2d56-4e36-b220-c269ffe2d2ac` captured 351 receipts but its 7.52 MB
  compressed export was truncated in Cloudflare logs. The partial download is
  not approved evidence and contributes zero scored rows.
- Job `58097a53-4f54-4ebb-a806-beadf7a6e491` aborted because the lossless compact
  package exceeded the safe log budget. No incomplete package was approved.
- Job `b7c25add-b8e2-4086-8e4e-d63e09dc8fa6` failed cloning a short Git SHA;
  manual invocations require the full commit hash. No capture occurred.

The durable transport uses existing KV namespace
`644df6a469e84dba90c8f7dac410f895`, solely new content-addressed keys
`cw08-shadow/artifacts/<sha256>.json`, with no expiry. It never uses or replaces
dashboard cache keys. The existing build token stays inside Cloudflare. Storage
permission failure aborts before capture; upload failure keeps evidence
unapproved. Logs contain only a manifest, not the bulk history or credentials.
KV is not WORM storage. A remotely committed pregame manifest anchors package
hashes, and the verified export must be retained independently. Do not claim
that KV alone proves immutability.

## Release requirements

CW08 remains unapproved. The candidate improves full-population count Brier,
but original-cohort assists and actual-priced assists still regress. Exact
priced retrospective candidate returns were negative in both markets. Neither
a direction ratio nor passing unit tests establishes successful calibration.
The recommendation remains to withhold new production goals/assists betting
recommendations and model EV claims until validated. This work has not paused
or changed the running production model.

Complete prospective collection and official-final grading on the fixed
November 14–December 15 protocol. Keep the first eligible receipt per
market/game/player across runs, including abstentions; never replace it with a
later quote. Merge new packages through exclusive-create first-receipt storage
and a committed enrollment ledger before scoring. Record transport failures as
operational missingness. Do not silently backfill them or choose captures based
on outcomes. Do not tune the frozen model using this period. A revised model
requires another freeze and another untouched evaluation period.

The protocol requires at least 100 final fixtures per market, 30 original-cohort
fixtures and 20 per observed supported line, paired Brier non-regression and
positive-return uncertainty gates. These are minimums, not automatic release
approval. Resolve the previously recorded application test/typecheck failures
before any release. No unrelated-sport repair or deployment is authorized here.

## First complete Cloudflare capture — verified before puck drop

Manual job `88ea3d67-0d81-4f07-9867-d1ea5965b746` at full collector commit
`a6007c4ecfd77125ad2894c1949a453231134f33` succeeded. Cloudflare logged its
manifest at `2026-11-14T02:59:07.212Z`, before the first target's 18:00 UTC start.
The complete package is retained in KV and in this repository at
`frontend/model-research/cw08-nhl-v3/shadow-evidence/2026-11-14T025901Z.br`.
The committed manifest and target/receipt enrollment ledger are
`cloudflare-shadow-manifests.json` beside it. The new verified enrollment starts
with this successful package; earlier transport trials remain excluded and
were never graded or used for tuning.

Package SHA-256:
`1f6ef2385261a920bb87db79a418a238456818175e69cd9f3c0abf366500f669`.
All 339 receipt hashes, causal histories, exact line/price calculations,
probabilities, EVs, selections/abstentions and baseline forecasts reproduced.
There are 242 goals and 97 assists receipts across 13 fixtures, with target
starts from November 14 at 18:00 UTC to November 15 at 03:00 UTC. Source capture
had 395 entries and 123 source rejections; 56 entries failed receipt eligibility.
No zero, stale quote or synthetic player was substituted for a rejection.
These are pregame research records, not 339 validated or profitable picks.
Zero official-final grades exist at this point. All release gates remain unmet.

This operational path is verified; a recurring collector has not been deployed
or scheduled. Repeat jobs must remain serialized and enforce the committed
first-receipt enrollment ledger. Do not restore the production Git branch
trigger merely to run shadow collection.

## Regression results for this continuation

- Focused NBA/NFL/NHL protection tests: 63/63 passed.
- Shadow/export/extraction/enrollment tests: 13/13 passed, including exact export bytes,
  credential refusal, whole-package/receipt tampering, changed EV with a
  recomputed receipt hash, before-puck-drop anchoring and overwrite refusal.
- Full frontend suite: 699 passed / 9 failed / 708 total. The nine failure
  locations match the prior recorded baseline. The new extractor and enrollment tests were
  additionally run after that full suite and passed.
- TypeScript: the same nine previously recorded diagnostics; no new diagnostic.
- Independent frozen-model replay repeated successfully: 368 feature and
  causality checks, 221 probability/price/EV/side comparisons. No model tuning.
- Original saved records remain preserved; this continuation made no database
  writes and introduced no production application-module changes.

See `frontend/model-research/cw08-nhl-v3/cloudflare-status-receipt.json` for
machine-readable results. The older readiness receipt is retained as historical
provenance rather than rewritten to hide its original credential finding.

The complete evidence and enrollment ledger were pushed in Git commit
`27324da` before any target started. Later jobs now automatically filter the
committed enrollment ledger without inspecting side, EV or outcomes. The real
395-entry source replay skipped all 339 already-enrolled targets and retained
only the 56 previously unenrolled entries. Original source and filtered capture
bundles plus the exclusion report are preserved in subsequent packages. Run
manual jobs serially and anchor each verified package/update its enrollment
ledger before starting another; do not use concurrent snapshots to replace
first receipts. Both goals (242) and assists (97) currently have zero settled
records; the scorer correctly reports all 339 pending.
