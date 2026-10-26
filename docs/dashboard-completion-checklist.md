# Dashboard completion checklist

Target: functional walkthrough by Friday, October 30, 2026 (Toronto).
A target is not a claim that model quality or missing source coverage is resolved.

Check off a task only after code, tests/build, production deployment, readiness,
and the named live workflow have passed. Shared changes cover all eight sports.
WNBA, MLB and Soccer remain hidden; their history and capture remain supported.

- [ ] 6. History reliability, completeness and speed — IN PROGRESS
  - [ ] Cold performance loads do not wait for final-stat provider calls.
  - [ ] Verified saved results survive failed background refreshes.
  - [ ] Reconcile original records by fixture/market/player without replacement picks or double counts.
  - [ ] Verify archived-only research selections remain recoverable after local retention.
  - [ ] Resolve cloud read failures and verify real records across all eight sports.
  - [ ] Verify Today/Yesterday/Week/Month/Season on production, including a cold load.
  - [ ] Verify seven Toronto days locally and archive-before-deletion safeguards unchanged.
- [ ] 8. Player search — reliable supported-player discovery and correct detail destination.
- [ ] 4. NBA reliability — market loads, injury filtering, slate dates, final results, tabs; list source gaps separately.
- [ ] 3. NFL cards/markets — supported projections, exact lines, progress and results; authentic quarter inputs.
- [ ] 9. Saving safeguards — observe actual pregame checkpoint and complete verified Drive backup cycle.
- [ ] 5. Featured picks — repair remaining failures; verify original locks and distinct players; document quote gaps.
- [ ] 2. Model quality — probability display/grading repair shipped in PR69; meaningful predictive accuracy remains unproven.
- [ ] 7. Waller original-pick investigation — authenticated original designation/odds still required for a verified result.
- [x] 1. Direction chosen: replace public GI with Estimated EV (PR68 deployed). This does not certify probability accuracy or every EV integration.
- [ ] Final mobile walkthrough, followed by aesthetics review.

## History investigation

Starting evidence: cold NFL history requests took 46–95 seconds; cached repeat
request took 9 ms. Supabase has records for all eight sports (899 documents,
approximately 19 MB at inspection). API logs show PGRST002 schema-cache connection
failures; a healthy project status does not establish healthy REST reads.
No historical records have been deleted or rewritten by this repair.

## History repair — implementation checkpoint

Implemented and tested (361 tests, production build passed; live verification pending):
- Cold responses read saved records and protected final receipts before any live-provider reconciliation.
- Coalesced background reconciliation updates derived views; failures retain existing verified records.
- Source-document cache is bounded and invalidated by file changes; local reads use bounded concurrency.
- Archived-only locked boards, protected pregame checkpoints and protected final receipts participate in history recovery, with cloud checksums retained.
- Duplicate copies reconcile by fixture day, market and player. A later official final grades the locked original line without replacing its projection or odds.
- Official final cache rejects checksum mismatches and writes only within the existing seven-day Toronto retention window.
- Period changes clear the prior scope; active reconciliation refreshes in five seconds and is labelled.
- Cloud errors retain the provider error code without exposing response details or credentials.

Supabase accepted a documented schema-cache reload request at 2026-10-26 18:15:45 UTC.
Successful cloud reads and production behavior still need verification; no checkmark is assigned from this request alone.

Cloud diagnosis continued: reload logs showed SQLSTATE57014 while building the
PostgREST schema cache. The authenticator role's statement_timeout was8s. It was
changed to30s with config/schema reload notifications; anonymous3s and authenticated8s
limits and lock_timeout8s remain unchanged. Read-back verified the role setting.
Rollback: ALTER ROLE authenticator SET statement_timeout='8s'; then NOTIFY pgrst,'reload config'.
This is a bounded metadata-service recovery adjustment, not a dashboard/client timeout increase.
Cloud recovery still requires successful live reads.

All eight performance-page integrations now use the shared reader, retaining Soccer's
league filter. Official-result selection prefers the most recently observed final over
an older protected first-final receipt, so later authenticated corrections can survive.
362 tests and the updated production build passed before release.
