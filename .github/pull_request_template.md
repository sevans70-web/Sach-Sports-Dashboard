## Release evidence (L10 — required before merging or deploying)

**No deployment is complete just because a commit or build succeeded.** Leave any unchecked item explicitly blocked and keep the tracker row open.

### Change identity
- [ ] List every changed file and summarize the actual user-facing behavior.
- [ ] Record branch, commit SHA, exact deployed Cloudflare version, and deployment URL.
- [ ] Confirm production is on the intended version (not a previously rolled-back version).

### Regression and data safety
- [ ] Run relevant automated tests and a clean production build; record results.
- [ ] Confirm NBA, NFL and NHL slate and pick counts do not unexpectedly fall to zero.
- [ ] Verify original selections, player/game identities, ranking order, lines, odds, EV and timestamps persist across refresh and deploy.
- [ ] Verify saved history and frozen/completed picks do not regenerate or disappear.
- [ ] Check scheduled, live, final and across-midnight slate behavior; record actual evidence, not just mocked tests.
- [ ] Verify inactive/injured player eligibility and explain any unavailable market rather than inventing picks.

### Phone and visible results
- [ ] Check home, NBA, NFL and NHL pages on a phone-sized viewport, including cards and navigation.
- [ ] Check at least one scheduled, live and completed state (or mark unavailable with a reason and arrange a later check).
- [ ] Verify relevant market-specific fields (prediction, projection, line, EV where supported) and no misleading placeholders.
- [ ] Record **What you should see** on the live dashboard, with direct URLs and before/after evidence.

### Release decision
- [ ] Record pass/fail for each check, outstanding risks, rollback version and whether deployment was authorized.
- [ ] Update the completion tracker **only after live verification**; move genuinely finished items from Repair checklist to 100% completed.
- [ ] If user action is needed, state the precise action; otherwise continue without asking for repeated approval.

Scope: NBA, NFL and NHL currently active. CBB and CFB are paused unless reactivated. MLB, WNBA and soccer are deferred; preserve their history.
