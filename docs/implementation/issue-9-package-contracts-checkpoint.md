# Issue #9 package contracts implementation checkpoint

> **Historical evidence, not a current work order (scope updated 2026-10-25):** This record describes its original revision. #9 remains accepted/closed on `2f89a96`. [ADR-0029](../adr/0029-remove-legacy-features-and-reset-development-schema.md) supersedes old preservation/conversion/migration-retention instructions for #10. Keep the current #9 package/access/recovery contracts; remove obsolete conversion machinery and reverify the final baseline. Prior failures, counts and evidence below are unchanged historical statements.

**Paused at user request:** 2026-10-21. This is a work checkpoint, not an acceptance record. The approved implementation plan remains [the task order](../superpowers/plans/2026-10-21-issue-9-package-contracts-implementation.md), with the [replacement contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) as authority.

## Committed work

The clean worktree is on `codex/package-accounting-booth-recovery-docs` at `861b6ab`, after the approved plan commit `4c583a4`.

| Task                                                          | Commit    | Status                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — target DTOs, formulas and strict request boundaries       | `d3d2fd1` | Committed; independent spec and Ponytail review passed. Focused tests 55/55 and unit tests 160/160 passed.                                                                                                                                                           |
| 2 — versioned schema, grants, fixture and access restrictions | `861b6ab` | Committed; **independent review interrupted before verdict**. Final focused schema/access gate 50/50 passed, affected legacy regressions 179 passed, three browser smoke tests passed. TypeScript, focused lint, generated types and local database advisors passed. |

Task 2 used six forward, CLI-generated migrations, from `20261021045309_package_contract_schema.sql` through `20261021055732_package_contract_integrity.sql`. It added a separate local Supabase project, `diy-instax-package-contracts`, on ports 56321–56329 because the old #9 worktree owns the original 5532x container stack. The old stack and its volume were not changed. The new stack was started without a database reset or hosted connection. Local test fixtures and browser setup were updated for that isolation.

The full `npm test` run is **not complete**. Two extra serial runs were stopped after source changes or after deciding to reserve the full gate for Task 11; their partial passes are not a suite result. Task 2's focused and affected regressions above are the verification evidence for this checkpoint. No #10 UI work, real printer enablement, physical trial, hosted migration, issue publication or issue closure occurred.

## Open review and next step

Resume Task 2's independent spec/code/Ponytail review from the committed diff `d3d2fd1..861b6ab` and its test report in `.superpowers/sdd/2026-10-21-issue-9-package-contracts-implementation/`. The reviewer had **not reached a verdict** when paused. Preserve and verify its candidate finding: `validate_package_parent` checks Event/run and Capture/Attempt chains but may not validate `booth_handoffs.grant_id` or `activity_events.attempt_id`; a version-2 child might reference a different-version or different-run parent. Check those actual table relationships and add a failing regression before any fix. Also finish checking which version-aware legacy RPC guards belong to Task 2 versus later tasks.

After resolving the Task 2 review, continue at Task 3 in the approved plan, one implementer and task review at a time. Task 3 version-2 receipts must populate `committed_revision`; Task 6 version-2 Captures must populate `shutter_operation_id`. Task 11 owns the complete serial test suite, static checks, final review and implementation acceptance record. Keep the #17 automatic full-ejection and #7 actual-iPad gates open.

`AGENTS.md` requires a focused answer before Task 11 status edits to important product documents; that question was sent and remained unanswered at this pause. Do not edit those documents until it is answered. A single anonymized Next.js feedback candidate is retained in the ignored Task 2 report for the required final reporting pass; the feedback instructions command has already run once, and no review form was opened or submitted.
