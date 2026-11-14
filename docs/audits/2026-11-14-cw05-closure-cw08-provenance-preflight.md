# CW05 tracker closure and CW08 stopped provenance preflight — November 14, 2026

The dashboard repair's **full CW05 row** was moved atomically from `Repair checklist!A20:Z20` to `100% completed!A35:Z35` in the existing completion tracker. The source row was deleted, destination checkbox set true and validated status set `100% COMPLETE`. All other values, notes, formatting, native validation and the existing issue hyperlink were preserved and read back. New closure notes record dashboard deployment `dcad8c9c-ca52-4578-887c-1a6f4a0659b0` and the successful real-browser/count/history/EV checks documented in the preceding release audit. Older notes remain as history, not new certification of unrelated model, mobile or hit-rate work. No other tracker rows were closed.

Tracker: https://docs.google.com/spreadsheets/d/1YVHL_0J_S1El0hKbduRKSySP_-Gh9tXJMNVcgOWeFp8/edit . Native cell metadata verification confirms top-aligned wrapped text, preserved link and checkbox/status validation. No native screenshot was available for this edit; visual verification used cell formatting metadata.

## Approved CW08 attempt — no new deployment

Local isolated build exactly reproduced the approved **151,874 bytes**, SHA-256 `c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4`. The existing research version `08e854d6-fcdb-404a-9820-c156d1485d98` was confirmed retrievable for rollback. All 667 receipt keys were inventoried, then the SHA-256 of each stored object's actual bytes was compared before/after the failed attempt: **667 identical, zero missing or changed**.

Manual Cloudflare build `fe8750e7-ef75-4137-834b-dc84265cf2c2` pinned source `ca30060bb3aa663d3334547264a0724570cc7499`. Its commands only installed frontend dependencies and invoked the guarded research updater; no dashboard build/deploy command ran. Normal dashboard commands were restored immediately after the manual job was created, while automatic branch filters remained paused throughout.

The remote frozen-artifact guard stopped before any code upload: `fatal: invalid object name '007c02b'`. Cloudflare's shallow source checkout lacks the old Git objects required by the existing `git show` provenance comparison. The local checkout contained them, which is why the same guard and digest checks passed locally. This is a build-environment issue, not model/source drift, a provider response or an authentication failure.

The user explicitly required stopping if unexpected release checks failed. **No retry, research code upload, schedule edit, receipt import or credential change occurred after this failure.** Research remains deployment `13a75869-0946-4318-aa1d-e62dea253444`, version `08e854d6-fcdb-404a-9820-c156d1485d98`. There is no new deployment ID to report, and no rollback was needed.

## Verified correction prepared

`frozen-history.mjs`, called by the updater before building, fetches only missing objects for the three full pinned historical commit IDs using `git fetch --no-tags --no-write-fetch-head --depth=1 origin <full SHA>`. It refuses symbolic or abbreviated refs and fails closed if a reference is unavailable. It does not checkout/reset, move HEAD, replace working files, rotate secrets or relax any artifact/digest fence. The original byte-for-byte frozen-model/protocol checks still run after the history is present. A real shallow-clone regression proves that old objects become available while HEAD/current files remain unchanged; unavailable refs still fail. The corrected build retains the exact approved bundle digest. This preparation has not yet been exercised in Cloudflare's environment.

## Existing collector operational evidence

The existing original-code schedule fired at **2:15:23 PM EST**, cycle `1994093`, and completed at **2:18:09 PM EST**. Its immutable run manifest `runs/0263b9f4ab68046c88609d451945266518c653837af7e3f4e08b386650429f1b.json` was retrieved from evidence KV, decompressed and hash-verified. It records healthy collection, zero roster/history failures, ten warmed players and two new receipts. Status: **669 receipts, 56 completed cycles, zero pending uploads, no storage error, zero final grades**. Eligibility/missing-history rejections remain explicit in the manifest. This successful cycle is on the **old transport**, not evidence that the proposed rate-limit handling is live. Earlier 39 HTTP429 rejections remain part of preserved run history.

The unchanged 15-minute cron has its original modification timestamp `2026-11-14T05:24:15.908994Z`. DO/KV identities and credential bindings remain unchanged. The dashboard remains deployment `dcad8c9c-ca52-4578-887c-1a6f4a0659b0`, version `bdd010c7-ab1d-41a1-83fb-bcabab45b86f`. Automatic builds remain paused on `__cw08_manual_release_only__`.

The original collector can continue scheduled work, but the new cooldown/cache/retry behavior cannot be certified operational or intervention-free until deployed and observed. No official-final grade has occurred in the live sample; exact-final grading and immutable storage recovery pass the local workflow test. Frozen model/protocol/validation dates, historical picks, all receipt objects and production predictions are unchanged.

Next: resume the stopped research-only release after this report, pin the correction commit, run the full provenance check in the shallow manual environment, upload only on success, then observe a new scheduled cycle and any natural 429 cooldown/retry. Do not force a 429 from the provider or bypass its limits. Additional official finals and the frozen study's evidence gates still determine model readiness.

Final checks: **749/749 regression tests passed**, zero skipped; **zero TypeScript diagnostics**. Nine focused transport/provenance/reproducibility checks and the complete scheduled workflow test passed. The full suite protects NBA/NFL/NHL, frozen forecasts, original histories, official-final grading and storage/failure recovery. Machine-readable evidence and test counts are in the adjacent JSON. Local retained logs and hash inventories are under `/workspace/work/cw08-resume/`. No secret values are included.
