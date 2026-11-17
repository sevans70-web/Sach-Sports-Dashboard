# R1 — existing manual environment capability check

Continued from `b565507`. **R1 remains blocked; no diagnostic provider request or deployment occurred.** The integration's known outbound-host restriction was not investigated or retried. Existing 48 targeted checks were reused; no broad tests, rebuild or model changes.

## Verified manual-environment result

One explicitly manual Cloudflare job, `dd25748c-8f0a-46c3-bb5e-9a94a5885b8d`, ran pinned commit `e363518b08e867bd0ab4993911769fa095e2b8e6`. It completed successfully on November 17, 2026 at 2:03:52 PM Toronto. **Success means capability inventory completed, not NBA connection success.**

Only the existing trigger's build/deploy command fields were temporarily changed:

```text
build: cd frontend && npm ci --ignore-scripts && node scripts/nba-probe-manual-capabilities.mjs
deploy: node -e 'console.log("R1_DIAGNOSTIC_ONLY_NO_DEPLOY")'
```

This installed the existing lockfile without package lifecycle scripts. Cloudflare also performed its normal root Python dependency installation. No dashboard compilation or deployment command ran. The inventory reads package manifests, checks whether an existing Wrangler executable is on PATH, and hashes the existing probe. It does not read credential values, create sessions/previews, invoke providers or access storage. The no-op deployment marker is retained in `manual-job.json`.

Actual manual environment, at 2:03:49.836 PM Toronto:

| Capability | Result |
| --- | --- |
| Node | v24.22.1 |
| Existing cf CLI | 1.0.0-beta.28 |
| Existing Vite plugin | 2.0.0-beta.v.12 |
| Project Wrangler package | Not installed |
| Wrangler executable on PATH | Not present |
| Separate @cloudflare/dev package | Not installed |

The probe is unchanged: SHA256 `21a22cb14905afeaae27b66991b871eb3b7ff7a9b11a170a85512e47fbbebb4f`.

## Exact limitation and stop decision

The authenticated manual environment can run Node scripts and the existing deployment CLI. **Its verified installed tools do not expose a supported whole-Worker private remote execution interface for this binding-free probe.** This is a tooling limitation, not proof that Cloudflare itself cannot provide remote development.

The installed cf `dev` implementation delegates to a framework/dev server. The installed Vite plugin's public exports are only `cloudflare` and `getLocalWorkerdCompatibilityDate`; its public `PluginConfig` has `remoteBindings`, but no whole-entry-Worker remote execution option. Remote bindings do not move the probe's ordinary `fetch` handler or its ESPN subrequest into a remote Worker. A local run would not answer the production-equivalent connection question. The earlier inspected private-preview helpers are bundled internal implementation functions, not an exported client API.

No supported remote-preview executable was found in the actual manual job. Using an internal-code extraction/patch, installing another client, writing a custom credential-consuming transport, transferring the integration's session credentials, or adding a deployed/proxied endpoint would exceed this existing-tool check. **None was attempted. No second manual job or alternate execution workaround was attempted.**

Consequently the prepared single-request probe was not invoked. ESPN HTTP status, response validity, origin duration and sufficient legitimate historical observations remain **unknown**. No seven-market verification or projection sufficiency claim is justified. The recorded manual job duration is not an ESPN request duration.

## Safety, evidence and next gate

The original build/deploy commands were restored after the job. `state-before.json` and `state-after.json` confirm identical trigger commands and branch filters, dashboard deployment `4699c3c4-5067-4347-b3b7-9d205fee5085` / version `a48c431a-5c3e-4491-8529-38cb20dfa898` at 100%, and CW08 deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` / version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`.

Automatic branch builds remained paused throughout (`branch_includes: ["__cw08_manual_release_only__"]`). No production binding, credential, preview-publicity setting, record, backup, research table or schedule was changed. No token was exposed, copied or transferred to another client. The capability script never consumes managed authentication. Existing production/research credentials were neither tested nor changed in this task.

Syntax checks for inventory and prepared probe pass; evidence consistency confirms matching probe hash, no-op deployment and unchanged before/after deployment/trigger state. Application test evidence is reused, not represented as a new live pass.

The current authorized existing-tool route is exhausted; stop here as instructed. The next requirement is a **separately reviewed, supported authenticated private remote execution capability** (or an operator-controlled existing authenticated Cloudflare private editor/session, without saving/deploying production code). Do not assume such a session is currently available, enable public previews, install another client, or request another R1 release based on this inventory. Its scope must first be agreed before any further execution attempt. R1/CW11/V62 stay blocked/open; no item moves to 100% completed.
