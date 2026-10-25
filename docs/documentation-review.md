# Documentation alignment review — 2026-10-21

> **Historical evidence, not a current work order (scope updated 2026-10-25):** This record describes its original revision. #9 remains accepted/closed on `2f89a96`. [ADR-0029](adr/0029-remove-legacy-features-and-reset-development-schema.md) supersedes old preservation/conversion/migration-retention instructions for #10. Keep the current #9 package/access/recovery contracts; remove obsolete conversion machinery and reverify the final baseline. Prior failures, counts and evidence below are unchanged historical statements.

**Scope:** approved documentation-only plan. Branch `codex/package-accounting-booth-recovery-docs` is based on issue #9 at `6f6ae69`; newer design references come from `development` at `9af5d5d`. Application source, tests, configuration and migrations remain unchanged. No commit, push, deployment or GitHub publication is part of this task.

## Review entry points

- [Replacement contract](superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md): detailed target design.
- [ADR-0025](adr/0025-package-accounting-and-booth-recovery.md): rationale and supersession map.
- [PRD](../PRD.md) and [route/flow guide](booth-user-flow.md): product reading order.
- [Proof checklist](qualification/booth-recovery-proof-checklist.md): evidence, pending trials and fallback behavior.
- [GitHub drafts](github-issue-update-drafts.md): local proposed issue-body changes only.

## Changes

Root requirements, architecture, glossary, presentation and agent guidance now use the package/recovery model. Old ADRs, specs, plans, prompts and checkpoint carry explicit scope/supersession notices. The #17 observations remain intact under a current-policy notice. October 20 design proposals are archived with their original raster images and generation data; no new mockups are claimed. Existing local setup/test commands are retained in the historical implementation guide.

## Execution choices

- Use the native managed worktree location rather than creating a second project-local worktree. Review this branch's worktree, not the untouched original checkout.
- Preserve historical text with clear notices and archive old raster proposals. Retired terms intentionally remain in evidence and legacy implementation descriptions; they are not current feature instructions.
- Use document checks and an independent document review, with no application/TDD run or commit: this task changes documentation only and cannot demonstrate runtime or hardware readiness.

## Verification record

- Local links and anchors: all 65 Markdown documents and the archived HTML gallery were checked; 427 local references resolved. Documentation JSON parses successfully.
- Formatting: the 19 active changed/new Markdown documents were formatted with the existing project Prettier. Historical evidence bodies were preserved rather than reformatted.
- Change scope: 78 changed/new files are documentation; application source, tests, configuration and migrations are untouched. The index remains empty and HEAD remains `6f6ae69`; the original development and issue #9 checkouts remain clean.
- Preservation: the original #17 report/runbook and issue #9 checkpoint bodies are unchanged below their new notices. Twenty archived image/JSON assets are byte-identical to `development`; archive README/gallery have historical notices. Every older spec/plan/prompt has a retirement notice.
- Whitespace and contract checks cover new stage-specific readiness, final reserved-unit dispatch, same-run access replacement and safe cancellation of definitely-unsent work. These are document checks, not application tests.

## Independent review and fixes

One fresh-context reviewer inspected the uncommitted documentation. It found no Critical findings and three Important contract gaps. Each was addressed in one documentation fix pass:

| Finding                                                                                 | Resolution                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A universal readiness predicate blocked first setup and dispatch of the last held print | Separate setup, guest, reservation, dispatch, Resume and reconciliation predicates. Dispatch accepts its own Reserved hold at zero available. Clarify five-second dynamic freshness and same-printer physical-load confirmation scope.                                            |
| Replacing failed/expired device access lacked a transition/API                          | Add authenticated same-run recover-access, inactive replacement handoff and grant-only activation into Paused; phone Resume remains explicit; Finishing/Finished cannot be revived.                                                                                               |
| A definitely-unsent Reserved attempt had no routine cancellation operation              | Add idempotent device reconciliation and equivalent Admin recovery. Cancel only if dispatch never committed; a competing dispatch retains Pending. Close the old session before resolving a lost reservation response so delayed requests cannot create new holds after recovery. |

Focused document assertions failed before these fixes and passed afterward. The reviewer’s readiness-freshness clarification was incorporated into the first fix because a stage-specific guard needs defined observation validity. No separate cosmetic changes were added. No second review or application pass is claimed.

### Review boundaries

Runtime/schema/test correctness was outside this documentation task; unchanged application code is not asserted compliant. Printer feedback, safe clearing and actual iPad operation require the outstanding physical trials. Archived raster visual quality was not reassessed or regenerated. Live GitHub bodies were not rewritten or certified synchronized; only local publication drafts were prepared. These boundaries preserve the approved scope rather than imply those future tasks passed.

## Remaining work after documentation review

A later code implementation/migration plan must reconcile existing issue #9 behavior with the new target and retire old write paths. Physical proofs in the checklist remain open, including automatic full ejection and actual iPad Guided Access operation. GitHub issue changes require separate publication. These are explicit pending activities, not unfinished application work performed by this docs branch.
