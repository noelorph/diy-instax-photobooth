# Issue #9 and #10 Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the user-approved replacement descriptions for GitHub issues #9 and #10 and synchronize their local publication record.

**Architecture:** Keep the complete descriptions in the existing issue-update document and publish only those two issue bodies using `gh issue edit --body-file`. Re-read GitHub to verify the exact saved bodies and preserve existing issue metadata and the native #10 dependency on #9.

**Tech Stack:** Markdown, GitHub CLI, existing repository documentation.

**Spec:** The descriptions approved by the user on 2026-10-23, reproduced in [the issue-update record](../../github-issue-update-drafts.md), under [ADR-0025](../../adr/0025-package-accounting-and-booth-recovery.md) and the [replacement contract](../specs/2026-10-21-package-accounting-booth-recovery-design.md).

**Approval:** The user selected self-contained descriptions, defined #10 completion as nonproduction application/cutover acceptance, and approved publication of both descriptions. This plan concerns issue publication only. It does not authorize application implementation.

## Global Constraints

- “Planning may proceed now. Implementation begins after #9’s outstanding findings are resolved and its required verification passes.”
- “Complete when the full application and coordinated accounting cutover pass nonproduction acceptance verification.”
- Closing #10 does not authorize real-printer enablement or production launch; #17 and #7 remain those respective gates.
- Publish the approved bodies, preserve issue titles/states/labels/assignees/milestones/dependencies, and create no implementation issues.
- Preserve all eight retirement requirements, their controls/callers/server actions/endpoints/database functions/tests/fixtures trace, denial tests, historical records, audit evidence, applied migrations, and necessary historical readers.
- Use repository paths for unpublished contracts, as shown in the approved descriptions; do not publish branches or create broken GitHub document links.
- Keep #17/#7 drafts unpublished. Do not change application code, database state, historical evidence, or unrelated user files.

## Review Focus

1. Concurrent issue edits: compare refreshed bodies and metadata with the pre-publication snapshot before writing.
2. Partial publication: record each successful update and mark both published only after both fetched bodies match their approved body files.
3. Approval mistaken for implementation permission: verify #10 retains the #9 gate and nonproduction completion boundary; inspect the diff for documentation-only changes.
4. Retirement or history requirements lost: check all eight removal items, every trace surface, denial coverage, and preservation requirements in the extracted #10 body.
5. Unpublished references or stale local status: verify every cited repository path exists, keep unpublished references as paths, and correct active publication notes only after GitHub verification.

## Task 1: Prepare the Approved Descriptions

**Files:** Modify `docs/github-issue-update-drafts.md`; create this plan. Temporary body files and snapshots live outside the repository in a task-specific temporary directory.

**Interfaces:** Consume the approved conversation text and live `gh issue view` JSON. Produce Markdown body files for issues 9 and 10, leaving the #17/#7 draft sections unchanged.

- [x] Refresh #9/#10 bodies, titles, states, labels, assignees, milestones, and #10's native dependency. Confirm no intervening change invalidates the approved replacements.
- [x] Replace the local #9/#10 sections with the approved text and mark publication pending. Preserve the #17/#7 sections verbatim.
- [x] Extract the two body files, normalizing only local section-heading levels. Check all retirement and gate wording, referenced file existence, and the absence of unpublished document URLs. Run a targeted Markdown formatting check and `git diff --check`.

## Task 2: Publish and Verify

**Files:** Modify publication-status wording in `docs/github-issue-update-drafts.md`, `docs/README.md`, `docs/agents/issue-tracker.md`, `README.md`, `PRD.md`, and `AGENTS.md`; update this plan's completion record. These are status corrections, not new product decisions.

**Interfaces:** Consume Task 1's reviewed body files and snapshots. Produce verified GitHub descriptions and an accurate local record of which issues were published.

- [x] Publish #9 with `gh issue edit 9 --repo noelorph/diy-instax-photobooth --body-file <issue-9-body.md>` and verify its fetched body matches.
- [x] Publish #10 with `gh issue edit 10 --repo noelorph/diy-instax-photobooth --body-file <issue-10-body.md>` and verify its fetched body matches.
- [x] Compare issue metadata with the snapshots and verify #10 still depends on open #9. Report a partial outcome honestly if either publication fails.
- [x] Record publication in the local update document and correct active notes that still describe both issues as unpublished. Correct AGENTS.md's stale whole-implementation status to distinguish existing version-2 contracts from outstanding #9 findings and legacy UI.
- [x] Verify exact body equality again, unchanged #17/#7 draft sections, documentation-only diffs, targeted Markdown formatting, and `git diff --check`. Report the two issue links and the remaining #9/#17/#7 gates.

Application tests and physical trials are not part of this editorial task. No new test result or implementation completion may be claimed.

## Completion Record — 2026-10-23

Both [#9](https://github.com/noelorph/diy-instax-photobooth/issues/9) and [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10) were published with `gh issue edit --body-file`, then fetched with `gh issue view`. Their bodies matched the prepared files exactly. Titles, open states, labels, assignees, milestones and the native #10 dependency on open #9 matched their pre-publication snapshots.

One-off assertions verified all eight retirement items and trace surfaces, implementation/release gates, history-preservation requirements, reference-path existence, equality between local and published descriptions, unchanged #17/#7 draft sections, and documentation-only changes. Targeted Prettier checks on all seven changed/new Markdown files and `git diff --check` passed. Independent review of the publication diff and snapshots found no actionable issues; it did not rerun application tests or independently re-fetch GitHub.

Repository-path references were retained as shown in the approved descriptions because the contract documents are not published on GitHub. No branch publication, issue closure, application implementation, database change, or hardware qualification occurred. Existing historical evidence and the unrelated SQL snippet were preserved.
