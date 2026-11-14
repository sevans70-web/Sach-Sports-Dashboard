# Corrected dashboard release and stopped CW08 update — November 14, 2026

The approved dashboard source `f93184a2a421f75018c0262c7b820b5ce9d95b76` is deployed and live verified. The separately approved research update was stopped before upload when a release digest differed, as required by the user's stop-on-unexpected-problem condition. No research resource, secret, schedule, receipt, model or protocol was changed.

## Dashboard

- Worker: `sach-sports-cloudflare-test`.
- Manual build: `096f5a49-0d3c-401d-b2eb-3eca6791ad01`, successful, pinned to the exact approved commit.
- Deployment: `dcad8c9c-ca52-4578-887c-1a6f4a0659b0` at November 14, 2:01:59 PM EST.
- Version: `bdd010c7-ab1d-41a1-83fb-bcabab45b86f`, 100% traffic.
- Available rollback: `46f9dc62-01e2-407f-b1c3-845d10e613d9`, the verified CW06 dashboard. No rollback was necessary for this release.
- Local production build, prebuilt dry run, Cloudflare remote production build and deployment passed. Existing compatibility date/flags, assets, KV, secret binding names and subrequest configuration match the approved setup.
- Automatic builds remain paused with branch filter `__cw08_manual_release_only__`. Neither build commands nor trigger configuration changed.

Real Chromium browser verification navigated Home → NBA with warm session summary data, then NBA/NFL/NHL. No page exceptions or React hydration errors occurred. Expanded NBA boards showed positive and negative EV, with 39 negative EV values observed across seven markets. Missing EV explanations included equal projection/line and unavailable joint combination probabilities. No exact zero EV occurred in the live sample; the actual component and regression tests cover zero without manufacturing a live example.

| Expanded market | Rankings | Eligible picks |
| --- | ---: | ---: |
| NBA points | 22 | 9 |
| NBA rebounds | 23 | 5 |
| NBA assists | 17 | 6 |
| NBA threes | 25 | 10 |
| NBA PRA | 25 | 9 |
| NBA PR | 25 | 11 |
| NBA PA | 21 | 8 |
| NFL November 15 Q1 passing | 14 | 6 |
| NHL today shots | 11 | 2 |

Counts were independently recomputed from the exact live ranking response rows matching rendered player IDs using the shared eligibility checks; they match the browser labels. The initial five-card previews are subsets of these expanded boards, not additional picks. NBA/NFL/NHL schedule counts 14/14/19 matched the schedule API fixture IDs and dashboard summary preview IDs. Unknown aggregate market coverage remains partial or unavailable, not a claim of verified zero; the live sample did not cover every possible football or hockey market. Injected provider failures/expiry/confirmed-empty behavior passed regression checks. NHL today and tomorrow rankings each returned 25 rows successfully.

All 576 original history records retained original pick, line, projection, game, capture timestamps and rank. All four original NBA featured players remained rendered (Julius Randle, Michael Porter Jr., Giannis Antetokounmpo, Bam Adebayo). NBA EV repair behavior is preserved. Dashboard repair release acceptance is satisfied within this stated scope; sportsbook market availability can still legitimately be partial.

## CW08 stopped release check

The existing research deployment remains `13a75869-0946-4318-aa1d-e62dea253444`, version `08e854d6-fcdb-404a-9820-c156d1485d98`. Cron remains `*/15 * * * *`, with its original modification timestamp November 14 05:24:15.908994 UTC. Existing DO `24d604463d7f410f880ba8366769e853`, evidence KV `94a4f6693e144aa1ae92d2939d563014`, feed/bootstrap secret bindings and frozen source artifacts are unchanged.

A root-directory rebuild produced 152,072 bytes / SHA-256 `8cf8006abee738c09c2587be57e065924f3c8d9a8e8e460b085f90fd2657efb6`, differing from approved 151,874 bytes / `c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4`. Complete comparison proved the entire difference was `// frontend/...` source path comments. Pinning Rolldown's `cwd` to the application root reproduces the exact approved bytes from either directory. The new reproducibility test protects this release check.

A new, tested code-only uploader is prepared but **has never been executed**. It checks exact approved commit, dashboard/research versions, namespaces, secret binding names, cron, frozen artifacts and bundle digest; uses Cloudflare `keep_bindings: ['secret_text']` rather than reading/copying secret values; and checks existing receipt identity references before/after. It neither imports receipts nor pauses or edits cron. Its resource/version checks intentionally reject unexpected existing state. It is not the original bootstrap/activation script.

Latest observed original-code status: 667 receipts, 55 completed cycles, no active job, zero pending uploads, no storage error, zero official-final grades. All 339 original content-addressed receipt references independently match the verified enrollment package (`1f6ef2385261a920bb87db79a418a238456818175e69cd9f3c0abf366500f669`). Latest health is degraded: 15 roster failures and 24 history failures, 39 recorded HTTP429 rejections, one newly enrolled receipt. Failures remain recorded in immutable run evidence; do not claim the undeployed transport repair has improved live rate limiting. No new NHL prediction model has been promoted.

Next operational step: resume the stopped research-only release after reporting this unexpected check, use the now reproducible exact approved bundle with the prepared guarded uploader, then observe an actual 15-minute scheduled collection/grading cycle and verify pacing, backoff and receipt retention. Additional official game results and the frozen November 14–December 15 evidence gates remain necessary before any NHL model decision.

Final regression: **747 passed, zero failed or skipped**; TypeScript: **zero diagnostics**. The full suite includes scheduler/official-final grading, duplicate prevention, retry/backoff, immutable receipt import, schedule-failure behavior, all seven EV markets, and the new reproducible-build/uploader guards. See the companion JSON for machine-readable IDs and checks. Local retained evidence is under `/workspace/work/f93184a-release/` (browser results/screenshots, live responses, independent count comparisons, preservation checks, original-reference checks and build/test logs). No sensitive configuration values are included in this GitHub audit.
