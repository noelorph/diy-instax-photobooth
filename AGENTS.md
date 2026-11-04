<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context layout with a root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Product requirements

Read the root `PRD.md` for the agreed product scope, behavior, and launch constraints.

### Architecture

Read the root `ARCHITECTURE.md` for the proposed system design and technical boundaries.

### Current printer qualification status

Before work on Booth Mode, printer feedback, accounting or hardware gates, read [ADR-0025](docs/adr/0025-package-accounting-and-booth-recovery.md), the [replacement contract](docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md), the [proof checklist](docs/qualification/booth-recovery-proof-checklist.md), and the dated [issue #17 evidence report](docs/qualification/issue-17-trial-report.md). Version-2 contracts and handlers passed #9 software verification on reviewed candidate `2f89a96`; see [dated #9 software acceptance evidence](docs/implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25). GitHub #9 is closed as completed. The #10 plan is approved and F1–F8 are published as #29–#36. F1, F3 and F4 have implementation evidence; F5 Guest capture-to-print and its legacy Booth consumer retirement passed software acceptance on `457a2d4` with [dated evidence](docs/implementation/issue-10-retirement-and-acceptance.md#f5-guest-capture-to-print-evidence--2026-11-04). F6 recovery, F7 reporting and F8 package-only schema work remain; #10 is open. F2 has [verified local disabled-scope implementation](docs/implementation/issue-30-disabled-media-acceptance.md), with media uploads temporarily unavailable under [ADR-0031](docs/adr/0031-temporarily-disable-event-media-uploads.md), preserving planned media sections/designs and prior-authorized cleanup-pending safeguards. [ADR-0032](docs/adr/0032-build-full-f2-with-uploads-unavailable.md) restores full dormant F2/#30 implementation while keeping uploads unavailable; show the Admin Event Media cleanup reminder for interrupted/late uploads and leftover files. Full #30 acceptance still requires supported cleanup and enabled transfer/failure/concurrency/private-delivery/playback proof. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure. Fresh-schema acceptance remains unperformed. #17/#7 physical qualification remains open.

Integrated development may use a nonproduction simulator. Real Booth Mode requires physically qualified automatic normal full-ejection completion and safe recovery; phone inspection is exceptional only. The actual iPad release gate remains open. Seven fresh-film prints matched review in the old iPhone trial; a separate used-sheet run demonstrated the historical local limit. Neither proves the new contract. Do not treat printer-reported count as physical inventory or proof that ten usable sheets were loaded. Manual physical reload confirmation is the approved fallback if automatic detection cannot be proven.

### Documentation authority

Read [docs/README.md](docs/README.md) before using historical specs, plans or mockups. ADR-0025 and the replacement contract govern package/recovery behavior. [ADR-0029](docs/adr/0029-remove-legacy-features-and-reset-development-schema.md) replaces legacy-data preservation/conversion with complete removal and a fresh package-only development schema within #10. Current #9 contracts and safety requirements remain accepted and must be reverified after integration/schema changes. Root PRD, architecture, glossary, design system and current flow guide are aligned target documentation. Obsolete feature specs/plans and mockups are removed from the maintained tree; Git checkpoint `1de2272` preserves them. Retained ADR history and dated #9/physical evidence are not current work orders. The [issue publication record](docs/github-issue-update-drafts.md) distinguishes accepted #9 evidence, the published complete-removal scope and F1–F8 links, and unpublished #17/#7 drafts. Do not infer implementation or issue completion from description publication or doc approval.

### UI/UX

Read the root `DESIGN_SYSTEM.md` before designing or changing an interface. It governs visual language, interaction presentation, responsive layouts, components, and accessibility; `PRD.md` governs product behavior.

### Browser verification

For changes affecting user-facing behavior or layout, verify the affected flow in a running browser using Playwright CLI or existing Playwright tests without waiting for the user to request it. Use the project-local [Playwright CLI skill](.agents/skills/playwright-cli/SKILL.md) as the default for interactive checks. Check relevant viewport sizes and report what was verified or why verification was blocked. Add repeatable regression coverage when appropriate. Documentation-only and backend-only changes do not require browser checks unless they affect a user-facing flow. Existing CI test requirements remain; browser and simulator checks do not replace physical printer or actual-iPad qualification.

### Keep decisions and documentation in sync

Before modifying important documentation such as `PRD.md`, `GLOSSARY.md`, `docs/adr/`, or product specs, ask the user focused questions about the intended decision, its scope, and affected behavior. Wait for the answers before editing those files.

When work adds or changes a durable product or technical decision, document it in `docs/adr/` in the same change. If it replaces an existing decision, identify the superseded ADR and link the new decision from it so the history remains clear. Update every affected document, including `PRD.md`, `GLOSSARY.md`, the README, specs, and relevant guides, so they describe the current decision and behavior. Do not leave conflicting guidance in place.
