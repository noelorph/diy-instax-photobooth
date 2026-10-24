# Package accounting and Booth recovery — documentation plan

**Approved:** 2026-10-21. **Scope:** documentation only; leave changes uncommitted for review.
**Branch:** `codex/package-accounting-booth-recovery-docs`, based on `codex/issue9-accounting-access-printer` at `6f6ae69`. Import the newer `docs/design/` references from `development` at `9af5d5d` as historical proposals.
**Design:** [Replacement contract](../specs/2026-10-21-package-accounting-booth-recovery-design.md).

## Work

1. Create the new branch in an isolated worktree before editing documents.
2. Write one replacement contract and ADR: package accounting, transitions, database/access rules, endpoints, provisional printer observations, guest flow and recovery, remote Admin operations, retained history, and hardware gates.
3. Align PRD, architecture, glossary, design system, README, agent guidance, route guide and diagrams. Distinguish approved target behavior from the existing implementation.
4. Supersede conflicting historical ADRs, specs, plans, prompts and implementation notes; archive misleading mockups without rewriting physical observations or past test results.
5. Add a proof checklist with known evidence, outstanding trials, pass criteria and fallback behavior.
6. Draft GitHub issue #7, #9, #10 and #17 updates locally. Do not publish them in this task.
7. Check documentation links, vocabulary, formulas, transitions, recovery and supersession. Obtain one independent final consistency review, address important findings, and provide review entry points.

## Constraints and review focus

No application, test, migration or runtime changes. No installation, application test run, commit, push, merge or deployment. Document checks are the verification for this task. Historical implementation and physical evidence must remain truthful. The new contract is a target for later implementation, not an assertion of shipped behavior.

Review specifically: possible-send versus definitely-unsent boundaries; pending attempts independent of abandoned guest interaction; lost responses and duplicate submissions; pause/finish races; overlapping readiness blockers; expired/revoked device access; adding a package versus loading film; capacity holds; exceptional inspection versus automatic normal completion; preservation of existing records; and all old executable work orders clearly retired.

## Execution record

See [documentation review](../../documentation-review.md) for the final scope and checks. The temporary execution ledger lives outside the tracked tree; this file records the approved work order, not a code implementation plan.
