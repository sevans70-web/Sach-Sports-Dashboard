# November24 controlled R1 manual run — build failed before upload

**No new Worker deployment occurred.** The user’s November24 8:39AM Toronto explicit authorization for the temporary two-command change was accepted. Exactly one manual run was started, pinned to `d6b249decdb4b19049efb20c42c9ec0b70d604dc`, for unchanged artifact **R1-2026-11-23-b8d05e3-c8428f1ae381**. It failed during frozen-package preparation, before the deploy command. No retry, production initialization, source-data writes or candidate acceptance was attempted.

## Reused evidence and narrow current checks

The existing20,478-record recovery evidence, ten-record backup and isolated restore were reused. Fresh read-only production inventory still matches every canonical backup hash:

| Dataset | Records | Inventory |
|---|---:|---|
| history_documents |11615|6e7f1c27dddcbabe945d374b6efd2e4f|
| worker_pregame_originals |6116|23e388533aa4a7d395a34890b603b2b2|
| worker_pregame_picks |1478|56e9ef51bbfdbac767d6fcec9df5db19|
| worker_pregame_grades |1269|0e21950e276648be18bce04e2c468e33|

The verified combined manifest `1hWmvl1AMif5DV6l7YDsc1kU-LPyMA1SU` and ten-record delta `1N7LhqfOPaQCbMNVCPRVIBkuzMbHbnSI_` remain available in the existing backup folder. No full or delta export, historical import, provider investigation, broad tests or prior backup verification was repeated. Post-failure counts remain20,478. Original records/credentials/bindings/schedules and CW08 were not modified.

Local prepare-only confirms exact bundle/config/assets SHA256 `c8428f1ae3815140ff3ca117bceca7c13cf230ac7a22721590e5e13761067597`, archive SHA256 `1d6f37445e1fcee881908e713c64d85a24f46a58c7ccf34decfeec26d2600e62`,430fingerprinted files. Previous targeted/compiled/UI evidence is preserved without broad reruns. This local pass did not include Cloudflare’s Git checkout shape, which is the newly observed release-environment gap below.

## One authorized manual run and exact failure

- Existing trigger `1ab4bcd7-477b-42b6-b7f3-07ba1748b3e7`: only the documented `build_command` and `deploy_command` changed temporarily. Automatic branch include stayed **`__cw08_manual_release_only__`**, exclusions unchanged.
- Build **`34abd6a4-861e-495a-99c1-87a211d838e6`**, source **manual**, exact package pin. Started8:58:06AM Toronto; stopped8:59:52AM with outcome`fail`.
- Cloudflare installed dependencies and reached `node scripts/prepare-r1-performance-release.mjs --prepare-only`. It did not compile the dashboard or execute the deployment command.
- The verifier’s unchanged required ancestry check failed:

```text
git merge-base --is-ancestor b8d05e3b6335233f7a9bd4ce4fc456db492dd552 HEAD
fatal: Not a valid commit name b8d05e3b6335233f7a9bd4ce4fc456db492dd552
```

The checkout did not contain the source commit object required by the package verifier. The package commit’s actual immediate parent is that exact source commit. The failure is reproduced locally with a single-commit shallow checkout. This is a release-environment Git-history limitation, **not a new NBA/provider/model failure** and not proof of corrupted artifact bytes. No access control, checksum or ancestry safeguard was removed.

## Required restoration verified

On detecting failure, both commands were immediately restored. Cloudflare records restoration at **9:00:32AM Toronto**; separate readback confirms exactly:

```sh
# build_command
cd frontend && npm ci && npm run build:vinext
# deploy_command
cd frontend && npm run deploy:vinext
```

Automatic filters stayed paused throughout. Active fallback is still deployment **d86b1e4d-6b43-4b47-b44e-4fbdd5330b08**, version **a48c431a-5c3e-4491-8529-38cb20dfa898**,100%. No Worker version was uploaded, so no rollback was needed. CW08 remains deployment39ea465b/version46e95f99; its15-minute schedule unchanged. No research tables accessed.

## Smallest correction, tested without changing production

`git-depth-rehearsal.json` records a focused local isolated Git test: depth1 reproduces the exact exit128/missing-source error; fetching the exact pinned package at **depth2** makes the original ancestry guard pass. No app code, source statistics, artifact bytes or validation guard changed.

**A new manual run and this revised exact build command require approval.** Proposed temporary build command:

```sh
git fetch --no-tags --depth=2 origin d6b249decdb4b19049efb20c42c9ec0b70d604dc && cd frontend && npm ci && node scripts/prepare-r1-performance-release.mjs --prepare-only
```

The deploy command remains the previously approved one:

```sh
cd frontend && node scripts/prepare-r1-performance-release.mjs --prepare-only && node scripts/deploy-cloudflare.mjs --message "Approved R1 performance b8d05e3 c8428f1ae381; CW08 unchanged"
```

This fetches the pinned package and its immediate parent through the existing authorized Git connection, retaining the exact pin, digest and ancestry checks. If history retrieval is unavailable, preparation stops before upload. Keep paused filters, identical bindings/schedules/credentials, original-command restoration/readback and fallback safeguards. No new paid service or rebuild.

## Acceptance remains open

There was no candidate to verify live. No claims of production statistics loading/accuracy/refresh, NBA7/NFL17/NHL6 desktop/mobile rankings/projections/EV/featured/history, operational initialization,38capture markets,3grading rotations or authentic grading of204olderpending predictions are made. These remain mandatory within the approved90-minute window after a future allowed upload. Missing evidence/picks must never be fabricated. No repair is moved to Completed based on this preparation-only run.

Next decision: approve one new manual run of the same frozen artifact and pin with the bounded Git fetch above. Reuse existing recovery/test evidence if the narrow current-state check still matches; do not reopen provider investigations or repeat backups.
