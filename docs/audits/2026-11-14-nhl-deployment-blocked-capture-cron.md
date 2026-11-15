# NHL deployment stopped at shared capture cron release gate

On November 14 at **9:28 PM Toronto time**, the approved release of `b2e9357` / audit `5982902` was stopped **before a deployment attempt**. The user explicitly required stopping if the shared capture cron remained a material risk. No manual build, Worker upload, configuration change, schedule change or rollback was performed.

## Failed critical check

The production dashboard still has a **350-subrequest limit per invocation**. Its unchanged scheduled handler runs two rotating market captures serially through `dashboard.fetch(...)`, then runs recent grading replay in the **same scheduled invocation**. There is no independent request-budget boundary for each market or for the replay. The candidate changes neither `worker-entry.mjs`, `worker-pregame-capture.mjs` nor `cloudflare.config.ts` from the prior release.

Read-only live Cloudflare telemetry across six hours returned180 capture events, including:

- **9:05:11 PM EST** (`2026-11-15T02:05:11.055Z`): NFL Q1 passing capture returned14 eligible rows, then NFL Q1 rushing failed with `Too many subrequests by single Worker invocation`.
- **6:35:05 PM EST** (`23:35:05.439Z`): NFL Q1 receiving preceded NHL Shots failure `rankings_http_503`.
- **5:57:05 PM EST** (`22:57:05.326Z`): NFL Q1 receiving preceded NHL Shots failure with the explicit subrequest-limit error.
- **5:19:04 PM EST** (`22:19:04.016Z`): NFL Q1 receiving exhausted the invocation budget and NHL Shots subsequently returned503.

This is an active capture-reliability failure, not a hypothetical limit. It can prevent original pregame evidence from being captured. Later UI recovery cannot reconstruct a forecast that was never captured before puck drop. The candidate's improved NHL request deadlines and saved-pick restoration do not establish a bound for the preceding NFL work or for combined capture-plus-grading requests.

The350 limit is **per invocation**, not a single global counter shared with every foreground HTTP request. These logs alone do not prove that the cron directly exhausted a separate live browser request's quota. However, ranking construction and module-level pending/cache state are reused by both paths, and isolation under a cold, failing capture invocation has not been established. The required release claim that the cron cannot regress capture or interfere with live ranking availability therefore cannot be made.

## Checks confirmed without mutation

- Production dashboard remains deployment **dcad8c9c-ca52-4578-887c-1a6f4a0659b0**, version **bdd010c7-ab1d-41a1-83fb-bcabab45b86f**.
- The currently working version is retrievable through the version API and available as the rollback target for a future release.
- Current compatibility date remains2026-11-06 and subrequest limit350.
- Automatic dashboard builds remain paused on `__cw08_manual_release_only__`; normal build/deploy commands are unchanged.
- The candidate's prior validation remains752 passed tests, zero TypeScript diagnostics, successful production compile and prebuilt dry run. A fresh compile and post-deployment browser/API checks were not represented as completed after this failed first gate.
- No new deployment ID, new live ranking counts or live performance-improvement claim exists for this attempt. The earlier3→8 SOG result remains a candidate replay, not deployed behavior.

CW08 research is untouched: deployment **39ea465b-ca3f-47f8-9bd2-50eb2f1ad174**, version **46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b**. Read-only status shows **708 receipts,94 grades,84 completed cycles**, no pending uploads, no storage error, no active cycle, and healthy latest collection with zero source failures/deferrals. Its schedule, model, protocol, namespaces, credentials and historical evidence were not modified.

## Next release requirement

Implement a bounded or isolated execution design for the dashboard capture and grading work, preserving every sport's capture coverage, immutable original selections, existing schedules and the separate CW08 system. Do not merely raise350, reorder starvation onto NFL, reduce capture coverage, silently skip failed markets or fabricate missing evidence. Test cold caches, mixed NFL/NHL capture, slow/failed upstream reads, grading work and foreground ranking requests together. Then repeat the release gates and only deploy when those checks pass.

The adjacent JSON records machine-readable gate evidence. This document records a failed release check, not a completed deployment or production repair.
