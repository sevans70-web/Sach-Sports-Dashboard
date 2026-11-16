# Withdrawn after live acceptance failure — do not deploy

Approved candidate deployment 79d6b9b0-8014-451a-bd3d-f732bbe15888 failed the NBA dashboard-summary live gate on November 15, 2026 Toronto time. Compatible fallback restored as deployment 4e8f8721-6e0a-4836-b877-9446a0f360d0. Archive retained unchanged for audit; preparation now rejects it. Any corrected candidate requires new validation and approval. Full live browser acceptance did not complete.

Original approved plan follows for historical context.

# Combined recovered-dashboard controlled release

Status: prepared, not uploaded; new explicit user approval required.

Frozen source: `7a2c442fe2e8a2d21969ae69f98a3fc7e3b64b1b` on `cloudflare-compatibility-test`. Worker: `sach-sports-cloudflare-test`. Bundle digest: `31302af418fa34c141220edbd9b73f0c4c7015fc7284c68e0eeb9c89de415c03`. Archive SHA-256: `1db8fd3a085a6ca61fc8a039d2914383db1f54ac827c4271d100af85cbbbb4ab`. See manifest for complete identity.

Scope: existing combined NBA EV/memory, NFL ranking, NHL loading/coverage and bounded capture/recovery repairs; corrected cold Vinext fetch accounting; read-only audit client identity. No prediction model replacement, nflverse production adoption or research Worker changes.

## Before activation

1. Confirm source ancestry, archive SHA and bundle digest using the manifest. Only use the recovered artifact; older failed candidates remain quarantined.
2. Run `node scripts/prepare-dashboard-retry-release.mjs --dry-run --recovered`. This command cannot upload. Confirm production configuration, existing dashboard SQLite DO and KV, 350 subrequests, no migrations/new resources.
3. Read back the existing fallback version `a48c431a-5c3e-4491-8529-38cb20dfa898` and independently verify the compatible fallback archive. Preserve all DO/KV state on rollback.
4. Confirm fresh upcoming NFL/NHL quotes through the existing public dashboard routes with truthful application User-Agent. Saved/frozen rows never satisfy authentication acceptance. A market without verified odds remains unavailable.
5. Confirm automatic builds remain paused and CW08 stays at deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, cron `*/15 * * * *`.
6. Obtain explicit approval before uploading through the existing authorized Cloudflare deployment environment. No token copying, credential rotation, account changes or automatic-build activation.

## Mandatory post-activation gates

Verify real browser and API behavior: all 17 NFL tabs, all seven NBA markets with signed/zero EV and accurate missing-EV reasons, NHL Shots/Points/Assists/Saves with truthful coverage, schedule/card counts, featured picks and history. Unsupported Q1/first-touchdown history must not be invented. Verify no hydration errors, repeated stalls or PR memory failures.

Run a real cold NFL capture and interrupted-job restart: require measurable source checkpoints, preserved first-pick evidence, bounded denial handling, no retry starvation or subrequest failures. Observe NBA/NFL/NHL job independence alongside foreground requests and a scheduled cycle. Confirm fresh quotes where available, original picks/grades unchanged and CW08 remains healthy.

Immediately restore the verified compatible fallback on a critical failed gate; retain namespace and all newly captured evidence. Do not claim completion merely from local tests. No production or research modification is authorized by this document alone.
