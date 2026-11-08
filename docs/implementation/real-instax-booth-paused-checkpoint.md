# Real Instax Booth integration — paused checkpoint

**Historical checkpoint, superseded after owner-authorized resume:** use [current integration status](real-instax-booth-integration.md). The pause and next-action text below record the earlier state; Tasks 2–4 have since completed source review. Required database/browser acceptance remains outstanding.

Paused on 2026-11-08 at the owner's request. Implementation is incomplete and must not be presented as operationally qualified. No implementation agent remains running. No Task 2 fix was dispatched after the pause.

## Location and authorization

- Worktree: `.worktrees/instax-integration` under the original project checkout.
- Branch: `feat/real-instax-booth`.
- Implementation HEAD before this checkpoint: `1e0bc4f`.
- Original baseline: `8c003f14195c53297e6e2b76ecf8156711578a6a`.
- The original `development` checkout still has the owner's pre-existing README.md edit. It was not overwritten; implementation has not been merged into that checkout.
- Owner authorized implementing the approved five-task plan with subagent-driven development and Ponytail full. All implementation/review agents used GPT-6.1 Sol medium. No Astra agents were used. Continue with GPT-6.1 Sol at most medium or GPT-6 Sol at most high.
- Source plan: `/private/tmp/instax-booth-plan-2026-11-07/2026-11-07-real-instax-booth-implementation-plan.md`.
- Source design: `/private/tmp/instax-booth-plan-2026-11-07/2026-11-07-real-instax-booth-design.md`.
- Per-plan local ledger and detailed reports: `.superpowers/sdd/2026-11-07-real-instax-booth-implementation-plan/` in the implementation worktree. This directory is ignored; this committed checkpoint preserves the key restart facts.

## Implementation status

| Task                                                                    | Status                                                                                             | Evidence / remaining work                                                                                                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Bounded development authority and correlated outcomes                | Implemented; independent source review clean after one fix round. Database acceptance outstanding. | `fc03911` adds mode, strict identities, pinned policy, forward SQL and ADR-0035/current contract updates. `c18284e` fixes ambiguous non-send release and terminal inspection safety conflict. |
| 2. Physical adapter reusing harness                                     | Implemented candidate, NOT accepted: one Important review finding remains.                         | `1e0bc4f` adds actual device identity, FI033/0102 validation, serial polling, one-send latch, accepted ejection detector and interruption handling. Fix described below is next.              |
| 3. Setup / Booth selection, completion and receipt-recovery integration | Not started.                                                                                       | Physical adapter is not selected by the real Booth flow yet; physical entry stays blocked. Must also preserve pinned existing-run reconciliation when new-work mode is disabled.              |
| 4. Automatic reload and phone fallback                                  | Not started.                                                                                       | Separate reload observation contract, database attribution, observer/controller/journal integration and existing-page phone controls remain.                                                  |
| 5. Final documentation, browser/full verification and handoff           | Not started.                                                                                       | Task 1 made the accompanying bounded decision/contract updates only. Final evidence record, consistency pass, integrated browser proof and whole-branch review remain.                        |

## Exact next action: Task 2 fix round 1

Review file: `task-2-review.md` in the local ledger directory. Both spec and quality verdicts are Needs fixes. There are no Critical findings and one Important finding:

`src/features/booth/printer/mini-link3-v2.ts:295` awaits an in-flight poll after checking readiness age. Its subsequent check at approximately line 302 checks owner/readiness/safety but does not recheck age. A status can be fresh initially, followed by a history exchange delayed beyond 5,000 ms; sending then enters the harness with stale readiness. The history exchange timeout permits this interval.

Resume the original Task 2 implementer if available, otherwise dispatch a fresh allowed-model implementer with the brief/report/finding. Follow the subagent-development fix-loop skill. Add a fake-timer regression that delays history beyond 5,000 ms after a valid idle status; assert no upload or execute. Recheck non-null timestamp and readiness age after awaiting polling, before the send-phase possible-involvement boundary. Use the existing definitely-not-sent path for that clean pre-write failure, preserving prior safety and consumed dispatch identity. Commit the fix separately, append commands/output to the report and obtain scoped independent re-review against `1e0bc4f`. Do not start Task 3 until this gate is clean.

Task 2 interface note: `disconnect(): Promise<void>` permanently retires the physical owner. Ordinary transport faults permit explicit reconnect on the same owner. Task 3 must discard a terminal owner on explicit registry release; route subscription cleanup must only unsubscribe, never tear down the authorized job. No new generic owner framework is required.

## Checks actually performed

- Task 1 final focused boundary/controller/component run: 277 tests passed across eight files. TypeScript, changed-file ESLint, Prettier and diff checks passed. Task 1's 12 direct database policy scenarios were collected, not executed.
- Task 1 independent review found two Important gaps. The fix and scoped re-review addressed both: unknown/interrupted physical work cannot later be released by an unsupported non-send claim; contradictory terminal inspection invalidates physical safety while preserving terminal accounting.
- Task 2 final non-database command: `npm test -- src tests/unit tests/components tests/integration/package-http-contracts.test.ts` — 35 files / 690 tests passed. TypeScript, scoped ESLint and formatting passed.
- Task 2 bare `npm test` run completed with 30 failed / 35 passed files; 53 failed / 690 passed / 339 skipped tests. The 30 failing files were database-dependent and failed local Supabase discovery (sandbox EPERM telemetry write), before database behavior was tested. This run preceded final adapter refinements; the final non-database run covered those refinements.
- An escalated independent environment preflight reached Docker but `docker info` and `docker ps` returned EOF. Opening Docker Desktop and checking again did not restore the daemon. No further unchanged retries were made. An optional question about Docker availability was left with the owner; no answer is recorded at this checkpoint.
- No new migration was applied. Database integration, direct RPC behavior, SQL lint and full Booth browser journeys remain unverified. No database stack was reset, owner work settled/deleted, policy enabled or hosted setting changed.
- Reviewers inspected exact diffs; they did not independently rerun the reported passing tests.
- No physical Bluetooth connection, print, reload, reset, actual-iPad check, deployment, push, merge or issue closure occurred.

## Resume safeguards and remaining release gates

Read AGENTS.md, current PRD/architecture, ADR-0025 and ADR-0035, replacement contract, proof checklist, dated qualification evidence, approved plan/design, ledger and latest reports before resuming. Keep Ponytail full and fresh implementer/task review per task, then a final whole-branch review. Database/browser suites must run serially against a safely verified named local stack; never bypass nonempty/Live/Pending fixture guards or reset owner data. Shared `node_modules` is a symlink to the original checkout's installed dependencies.

Preserve accepted FI033/0102 normal ejection, physical-last-used-sheet, known-empty negative and normal-reload results. They need not be repeated merely to integrate. Software tests do not establish hardware qualification. Automatic reload clears only the matching film requirement, with phone confirmation fallback; it adds no capacity, resolves no Pending attempt, clears no explicit pause and proves no old-job clearance. Never automatically resend an uncertain image or silently substitute the simulator.

Operational release remains blocked by unfinished software integration/verification and the proof checklist: remaining P1/P2 integrated normal/fresh-film proof; P3 reliable no-output or qualified generic-fault/inspection route; P4/P10/P11 safe physical old-job clearance and recovery; P6–P9/P13–P14 interruption, capacity and lifecycle scenarios; actual iPad A16/Bluefy P12; and remaining P5 false-positive checks before automatic reload receives production authority. Accepted normal detection remains accepted. Wider F6/F8/media and deployment acceptance remain separate. This checkpoint closes no issue and grants no physical-trial or production permission.
