# Issue #9 historical implementation checkpoint — 2026-10-17

> **Historical implementation checkpoint.** This records the old issue #9 branch and unfinished work as of its date, not a current work order or a fresh test result. The [replacement contract](superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) supersedes conflicting behavior. The 2026-10-21 branch updates documentation only; old source/tests remain unchanged.

**Historical status at 2026-10-17:** Paused at the owner's request on branch `codex/issue9-accounting-access-printer`. This is a committed work in progress, not a completed or fully reviewed implementation. The approved [contract spec](superpowers/specs/2026-10-16-accounting-access-printer-contracts-design.md) remains unchanged.

The branch contains the operational schema, restricted accounting functions, Admin and Booth handlers, simulated printer and `/booth` flow, redaction and Draft deletion, and Admin operations/History/return UI. Tasks 1–11 received scoped independent reviews. Task 12 was saved in checkpoint commit `b256266` before its independent review. No hosted database or physical printer was changed.

Work resumed on 2026-10-18. This document preserves the evidence and unresolved state at the pause; its remaining-work list is historical. See the [README](../README.md), [current Booth guide](booth-user-flow.md), and final verification report for subsequent status.

## Verification at pause

- The last clean serial full Vitest run was stopped with SIGINT at the owner's request. Its completed suites passed: Test Print/Wasted Film **28/28**, print outcomes **16/16**, and operation HTTP authorization **28/28**. The next suite had no completed result. **There is no full-suite pass for this checkpoint.**
- Task 12's focused component/unit suite passed **79/79**. Focused local integration passed **36/36** before a further Client Redaction retry case; that case and the History read case each passed separately. The final simulated Admin-to-Booth browser journey passed **1/1** after the pause-flow correction. A production handoff browser suite passed **2/2** before the latest History additions. Lint, TypeScript, and formatting checks passed on the Task 12 code.
- Earlier tasks have their own focused, migration, and review evidence. These results do not replace final verification of the combined branch.
- The interrupted database test may have left a local fixture or simulated completion policy behind. Inspect the isolated local Supabase stack and clean only confirmed abandoned test fixtures before rerunning database tests. An earlier interrupted run left a pending printer slot and caused unrelated fixture collisions; its known residue was cleaned. Do not run database and browser suites concurrently against that stack.

## Work remaining on resume

1. Inspect the isolated local database for residue from the final interruption. Complete a clean serial full run with `npm test -- --maxWorkers=1 --no-file-parallelism`.
2. Rerun the production handoff browser suite after the latest History changes, the simulated Admin-to-Booth browser suite with `npx playwright test --config=playwright.admin-booth.config.ts`, and final lint, type check, build, local migration replay, database advisors, privilege/ledger checks, and diff checks.
3. Independently review Task 12, address findings, then review the entire branch against [issue #9](https://github.com/noelorph/diy-instax-photobooth/issues/9), the approved spec, and the deferred review notes. In particular, assess History's per-Event read cost and the interrupted-run fixture cleanup.
4. Synchronize contextual documentation: `/booth` and Admin route guidance, README setup/status (including the canonical `ADMIN_AUTH_ORIGIN` for mutation requests), and any ADR/architecture refinements. Keep `/booth` out of the approved issue #9 spec as previously directed. The existing README and [Booth flow guide](booth-user-flow.md) still contain pre-implementation status text.

The simulated printer is a development adapter. Real printer-backed Booth Mode, Test Prints, physical stock consumption, and Confirmed Print accounting remain disabled pending the physical-ejection decision and validation in [ADR-0021](adr/0021-move-print-qualification-to-integration-checkpoint.md) and [issue #17's evidence report](qualification/issue-17-trial-report.md). The actual-iPad release gate remains open.
