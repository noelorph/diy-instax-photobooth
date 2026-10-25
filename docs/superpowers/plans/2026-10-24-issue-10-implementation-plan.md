# Issue #10 Implementation and Publication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout every implementation plan:** Use **ponytail:ponytail, full**. Read its installed `SKILL.md` at execution time. Reuse existing contracts/components, choose the smallest complete change, trace affected callers/tests/fixtures, and preserve authorization, privacy, accessibility and printer safety. This applies to every child and every task, including verification and cleanup.

**Goal:** Deliver eight complete capabilities as native GitHub sub-issues of #10, then implement complete legacy removal and a fresh package-only installation after plan approval/publication, using the accepted #9 contracts.

**Architecture:** Integrate the existing version-2 database/HTTP contracts into the current Admin features and one shared Booth controller. Keep each capability's UI, integration, data changes, tests and retirement work together. Remove each obsolete application path with its owning capability; F8 removes shared leftovers and replaces the migration chain with a verified package-only baseline. Individual child completion does not release the application.

**Tech Stack:** Installed Next.js 16.4, React 19.3, TypeScript, Zod, Supabase Auth/Postgres/Storage, existing UI components, Vitest and Playwright. Recheck installed versions at execution; do not upgrade the framework as part of this plan.

**Spec:** [Approved functional design](../specs/2026-10-24-issue-10-functional-breakdown-design.md), [replacement contract](../specs/2026-10-21-package-accounting-booth-recovery-design.md), [ADR-0027](../../adr/0027-draft-only-event-media.md).

**Status:** Revised 2026-10-25 for the user-approved complete removal decision in [ADR-0029](../../adr/0029-remove-legacy-features-and-reset-development-schema.md). The user approved the revised plan on 2026-10-25 and requested its documentation commit first. Publication and implementation are on hold until the user says to start. #9 remains accepted and closed; #10 remains open. Checkpoint `1de2272` preserves the pre-revision docs. This task commits the approved docs only; no publication, implementation, database reset or push is authorized.

## Global Constraints

- **The #9 software prerequisite is satisfied.** Before F1–F8 execution, verify accepted candidate `2f89a96` and the [dated software acceptance](../../implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25), then reconcile source references with the execution revision. Plan approval is recorded; publication, a later implementation instruction and capability prerequisites remain required; #9 repairs are outside these plans.
- All existing data is disposable development/test data; the client has not bought the project. Remove legacy feature specs/plans from the maintained tree and use Git history as the archive. Do not build legacy readers, snapshots, Draft conversion/review or compatibility fallbacks. Keep dated #9/physical evidence clearly separate from work orders.
- One Admin, one booth, one printer, at most one Live Event and one unresolved Print Attempt. Use `PRINTS_PER_PACKAGE = 10`, `MAX_TOTAL_PACKAGES = 214_748_364`, `STATE_POLL_MS = 2_000`, `READINESS_MAX_AGE_MS = 5_000`, five-minute handoff, 24-hour renewable grant idle expiry and two-minute bounded late Capture window from #9; do not create alternate values.
- Use `PrinterAdapterV2`, `SimulatedPrinterV2`, `BrowserBoothMetadataJournal`, `dispatchReservedAttempt` and `recordAndReportObservation`. Simulation stays nonproduction. #17 gates physical automatic completion/recovery; #7 gates actual-iPad release.
- Guest photos exist only in browser memory/direct printer transport. Stable operation IDs, same-payload receipt recovery, no automatic resend, private/no-store responses, current authorization and same-origin protection apply throughout.
- Preserve accepted Event Media limits from ADR-0027: Draft-only mutations; still JPEG/PNG/WebP ≤10,000,000 bytes; MP4 H.264/AVC ≤50,000,000 bytes and `0 < duration ≤ 30` seconds; muted playback; trusted content validation; no conversion/editing.
- Monthly Events counts Draft, Live and Completed by venue-local scheduled start; excludes Cancelled and deleted Drafts. Four in-month Events with one Cancelled yields **3**. See [ADR-0028](../../adr/0028-define-monthly-event-count.md).
- Every child uses [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md), the [screen map](../../design/2026-10-21-package-recovery/screen-map.md) and its named sheets in [the approved gallery](../../design/2026-10-21-package-recovery/index.html). No new mockups, routes or product capabilities outside the approved scope.
- Before app code, read `AGENTS.md` and relevant installed Next guides: `node_modules/next/dist/docs/01-app/02-guides/{forms,authentication,server-actions}.md` and `01-app/01-getting-started/{05-server-and-client-components,15-route-handlers}.md` under that docs root.
- Apply Ponytail to each task: preserve working implementations and existing meaningful tests. Add a failing regression only for a missing behavior; an existing passing acceptance case warrants reuse, not a rewrite or duplicate test. Commit only changed task files; no empty commits or unrelated SQL snippets.

## Review Focus

1. A lost mutation response must not create a duplicate Draft/audit, purchase, handoff or send: F2 task 1, F3 task 2, F4 task 1, F5 task 2.
2. Interrupted/invalid media, Start/Cancel during upload and deletion with a late transfer must be proven safe before polishing the editor: F2 tasks 2–3; presentation follows in task 4.
3. Setup readiness cannot be reused blindly after local sign-out/navigation; explicit camera actions can request permission, passive checks cannot prompt, and independent blockers/stops survive: F4 tasks 1–2 and F6 tasks 1–3.
4. A delayed newer Capture or journal loss must not select another photo or imply no physical send: F5 tasks 1–2 and F6 task 1.
5. A fresh install must reproduce every current #9 security/accounting safeguard while omitting all legacy objects; resets are restricted to named disposable local projects and never settle a runtime uncertain print: F8 tasks 1–3.

## Capability plans and dependencies

Each row is **one GitHub sub-issue**, not a separate UI/API/database/testing phase. F1–F8 are local identifiers until publication. Human review diagrams are separate from agent execution instructions.

| ID / proposed issue title                                            | Plan                                                    | Prerequisites besides #9 | Independently demonstrable outcome                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| F1: Complete Admin access and account management                     | [F1](2026-10-24-issue-10-f1-admin-access.md)            | None                     | Sign in/recover/manage account with correct session boundaries     |
| F2: Complete Event preparation and private media                     | [F2](2026-10-24-issue-10-f2-event-preparation-media.md) | F1                       | Valid Draft, private media, safe cancellation/deletion             |
| F3: Complete booked capacity and Additional Film Packages            | [F3](2026-10-24-issue-10-f3-package-capacity.md)        | F2                       | Real Admin purchase/count workflow, exactly once                   |
| F4: Complete Booth setup, access and lifecycle                       | [F4](2026-10-24-issue-10-f4-booth-lifecycle.md)         | F1, F2, F3               | Setup/handoff, phone pause/resume/finish and Event termination     |
| F5: Complete the Guest capture-to-print journey                      | [F5](2026-10-24-issue-10-f5-guest-printing.md)          | F2, F4                   | One reviewed Capture, at most one send, truthful completion        |
| F6: Complete Booth recovery across devices                           | [F6](2026-10-24-issue-10-f6-booth-recovery.md)          | F3, F4, F5               | Resolve outcome and equipment/access blockers safely               |
| F7: Complete operational visibility and retained history             | [F7](2026-10-24-issue-10-f7-visibility-history.md)      | F2, F3                   | Accurate summaries/activity and immutable historical detail        |
| F8: Complete legacy removal, fresh installation and final acceptance | [F8](2026-10-24-issue-10-f8-cutover-acceptance.md)      | F1–F7                    | Package-only schema and combined app pass nonproduction acceptance |

F7 may follow F3 while F4–F6 proceed in dependency order. F4/F5/F6 sequentially extend `src/features/booth/flow.ts` and `booth-client.tsx`; they must not introduce competing orchestration state machines. The dependency graph does not request delegation now. Implementation method is selected later, after the gate and explicit authorization to implement.

## Acceptance ownership before implementation

The [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) is populated now with requirements, accountable capability/task, named test scenarios and pending evidence. Each owner records revision, exact command/config/environment, result and evidence location before its issue closes. Refer to that single table from child issues instead of maintaining divergent copies. F8 audits and reruns accumulated evidence on the combined candidate; it does not first assign missing requirements at the end.

In particular, F3 owns the exactly-once purchase; **F5 owns exhaustion → phone purchase → a newly admitted Guest**, and F6 owns the variants where pause or another blocker still prevents admission. F4 owns fresh camera/printer readiness after setup handoff. Every required test not yet written or run remains explicitly pending.

## File and interface ownership

| Owner | Existing home to extend                                                                                  | New files allowed by this plan                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1    | `src/features/admin/auth/`, `profile/`, `src/components/{ui,shared,layout}/`                             | No new feature layer                                                                                                                                                      |
| F2    | `src/features/admin/events/`, `src/lib/events/drafts.ts`, existing receipt/RPC and media-cleanup helpers | Development Draft-creation receipt and media migrations, consolidated into the F8 baseline, focused media module/routes/UI and shared browser fixtures; exact paths in F2 |
| F3    | `src/features/admin/operations/{read.ts,types.ts,panel.tsx}`                                             | Focused purchase browser regression only; no new ledger                                                                                                                   |
| F4–F6 | `src/features/booth/`, Admin operations, existing #9 HTTP routes                                         | Focused setup/recovery UI modules only where identified; tests reuse existing fixtures                                                                                    |
| F7    | Dashboard/History pages, `src/lib/events/history.ts`, Admin operations read model                        | Dashboard projection/view and read tests                                                                                                                                  |
| F8    | Remaining old routes/version switches, migration chain, fixtures and acceptance trace                    | Complete package baseline, absence/security tests and fresh-install fixture/config                                                                                        |

Existing wire contracts stay in `src/lib/operations/{package-contract,package-validation,package-state,package-route,package-rpc}.ts`. Client inputs use `operationId` and the exact schemas there, never legacy `operationKey`. `requireAdmin()` supplies `{userId, sessionId}`; read helpers must retain its live-session/RLS checks. Each plan distinguishes existing signatures from proposed application interfaces.

F2 task 1 corrects the direct Draft creation path to use a stable creation ID, existing receipt machinery and one atomic creation/audit commit, and introduces the shared local browser fixture when first needed. F4 consumes it and owns the camera helper's explicit `existing` / `request` permission intent, all initial callers/tests and post-navigation equipment readiness; F5 preserves that boundary and F6 wires Enable Camera to it. These corrections implement approved retry and permission behavior without changing capability dependencies or release gates.

## Verification and environment rules

Use `tests/fixtures/local-supabase.ts` and `package-contract.ts` for local fixtures; refuse hosted URLs. Run database and browser commands **serially across processes**, because they share local Auth/data and build output. Normal tests clean exact fixture IDs and restore only fixture-owned policy; they never reset a stack. Abort on unexpected identity, occupied app ports or unverified cleanup.

Before F8, F2 may temporarily change only the local `events.accounting_version` creation default to 2 for serial creation tests and restore it in `finally`; leave `active_creation_version` unchanged. F2 owns the shared `package-browser.ts` fixture. This is temporary test setup for the existing schema, not a compatibility feature. F8 removes both old creation/activation machinery and the fixture toggles. Its final baseline creates package Events by default and contains no conversion path.

F8 first proves an empty install on its separately owned `57321/57322` stack without touching the ordinary stack. Only after that proof, F8 rebuilds the identified disposable `diy-instax-package-contracts` stack at `56321/56322` from the new baseline, then runs the full suite there. Stop apps/workers and disconnect/quiesce physical printers before rebuilding. This one setup rebuild is the explicit exception to normal exact-ID cleanup. No shared/hosted/unidentified project may be reset; revisit ADR-0029 if data is no longer disposable.

The table describes the **required implemented configuration**, not environments changed by this documentation review. Commands run from the repository root after dependencies/local migrations are prepared. A focused browser command always names its config.

| Command / config                                                                 | Application and evidence mode                                                                                                           | Database / fixture and allowed changes                                                                                                                                       |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --reporter=verbose` / `vitest.config.mts`                           | Unit/component tests plus real local integration; no browser server                                                                     | `diy-instax-package-contracts`, API `127.0.0.1:56321`, DB `56322`; exact-ID fixtures, restored defaults/policy; current contracts; pre-F8 conversion tests are retired by F8 |
| `npm run test:e2e` or `npx playwright test --config playwright.config.ts <file>` | Production build/start at `127.0.0.1:1437`, `tests/fixtures/browser-server.mjs`; simulation denied, including when its flag is supplied | Same `56321/56322` stack; F2/F3/F7 real data/Storage workflows, F1 Auth and production denial tests; no conversion or reset during normal tests                              |
| `npx playwright test --config playwright.booth.config.ts`                        | Development app at `127.0.0.1:1438`; only `booth-simulator.spec.ts`; simulator enabled                                                  | Same local stack, explicit credentials from CLI status via the shared runner; F5/F6 real operations, not inherited request-mocked success                                    |
| `npx playwright test --config playwright.admin-booth.config.ts`                  | Development app at `127.0.0.1:1439`; only `admin-booth-simulator.spec.ts`; simulator enabled                                            | Same local stack/runner; F4–F6 two-context journeys, fixture-owned policy restored                                                                                           |
| `npx playwright test --config playwright.baseline.config.ts`                     | Fixture-owned candidate app at `127.0.0.1:1440`; production build for fresh installation/package History/denials, simulation denied     | **Disposable** `diy-instax-package-baseline`, API `127.0.0.1:57321`, DB `57322`; empty install and synthetic Auth/data/private Storage; fixture-owned setup/teardown         |

**Discovery and startup ownership:** F8 adds `package-baseline.spec.ts` to default `playwright.config.ts.testIgnore` in the same change that creates it; retain the two simulator exclusions. `playwright.baseline.config.ts` matches only that file, uses one worker, and has no competing `webServer`: its `withPackageBaselineFixture` starts/stops its own app around fresh-install checks and awaits health. The two simulator configs retain exact single-file `testMatch`. F4 extends the existing `admin-booth-server.mjs` to accept only `1438` or `1439` as its port and makes both simulator configs use it, setting local credentials and matching `ADMIN_AUTH_ORIGIN` explicitly; no inherited `.env.local` database selection. F2 extends the ordinary fixture for its v2 creation tests. F8 owns default exclusion and disposable configuration; no ninth capability is introduced.

Before any browser run after changing discovery, run all four `npx playwright test --config <config> --list` commands. The default list must omit all three specialized files; each specialized list must contain only its intended file. Discovery must not provision/reset a stack, change defaults or start an app. The baseline test checks its config/base URL before fixture setup and the fixture checks project/container/ports before mutation, so an explicitly misrouted run fails before touching a database. Keep screenshots, traces and video off for every Guest journey. Independent baseline evidence must also show that the `56321` stack was unchanged.

Each child runs its focused commands and changed-file lint/type/format checks. Exact candidate commands at F8:

```bash
npm test -- --reporter=verbose
npm run test:e2e
npx playwright test --config playwright.booth.config.ts
npx playwright test --config playwright.admin-booth.config.ts
npx playwright test --config playwright.baseline.config.ts
npm run lint
npx tsc --noEmit
npm run format:check
npm run build
npx supabase db lint --local --schema public,private --level warning --fail-on error
git diff --check
```

Every command must exit 0; report any failure and its subsequent fix/rerun accurately. Validate Markdown separately with Prettier because `format:check` omits docs. Keep production-build tests that deny simulation, alongside development simulation journeys. F8 must not report inherited legacy browser tests as proof of new flows. No actual printer/iPad test is authorized by these plans.

Every applicable capability verifies persistent errors, loading/empty/disabled states, keyboard and focus behavior, light/dark Admin, Booth dark theme, compact/medium/wide layouts, portrait/landscape, 200% zoom, reduced motion and safe areas. Tests must assert outcomes against real #9 operations where available; component mocks alone do not close a capability.

## Retirement ownership

| Retired behavior                        | First owner               | F8 must prove                                                                             |
| --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| Editable Print Allowance                | F2 Draft; F3 operations   | No allowance input, read, payload, independent column or write function                   |
| Individual Additional Prints            | F3                        | Old UI/actions/routes/RPCs/tables removed; stale calls fail                               |
| Shared Film Stock                       | F3; F7 reader deletion    | No stock ledger/table/function or historical reader                                       |
| Wasted Film / quality refunds           | F5/F6; F7 reader deletion | Full ejection stays counted; correction code/schema absent                                |
| In-app Test Print/setup gate            | F4                        | Reminder only; Test kind, routes, functions and setup gate absent                         |
| Client Redaction / past-Event deletion  | F2/F7                     | Redaction routes/functions absent; package History and safe Draft cleanup remain          |
| Old recovery/local takeover             | F4/F5/F6                  | No ordinary pause/fault sign-in or same-photo retry                                       |
| Compatibility adapters/branches/helpers | Every owner               | Remove all v1 branches/conversion objects; retain current v2 contracts and dated evidence |

Each child records controls, callers, actions, routes, SQL objects, fixtures and tests affected. Delete obsolete application paths in their owning task; remove shared database remnants and the old migration chain in F8 with the complete baseline. No old-record settlement/conversion, historical reader or legacy migration remains. Preserve required current security and calibration behavior; dated evidence can name removed features without becoming executable work.

## Publication tasks — approved, on hold until the user says to start

### P1: Record approval and prepare the parent amendment plus eight issue bodies

- [x] User approved the revised implementation/publication plan on 2026-10-25 and requested its documentation commit before further work. Publication and implementation remain on hold under the user's explicit “Do not start yet” instruction.
- [ ] Read #10's native sub-issues and existing blockers with `gh api repos/noelorph/diy-instax-photobooth/issues/10/sub_issues --paginate` and `gh api repos/noelorph/diy-instax-photobooth/issues/10/dependencies/blocked_by --paginate`. Reuse a matching child after partial publication.
- [ ] Prepare eight UTF-8 body files from the child plans, including purpose, complete scope, non-goals, task checklist, exact design references, contract reuse, dependencies, owned acceptance-trace rows, test commands/environments, retirement ownership and Ponytail full requirement. Include `Part of #10` and the satisfied #9 prerequisite with its evidence. Include plan/trace content in the body when local links are not yet available on GitHub; never publish broken branch links as the only instructions.
- [ ] Prepare the exact #10 parent amendment from [the local publication draft](../../github-issue-update-drafts.md#issue-10-approved-body-awaiting-publication). Preserve all unchanged Admin/Guest/media/recovery scope, accepted #9 prerequisite and #17/#7 limits; replace legacy preservation/conversion with complete removal and fresh installation. Keep #9 closed and its original acceptance/evidence intact.
- [ ] Check the parent amendment and all eight bodies against the approved dependency and retirement tables. Leave triage labels unset while blocked; do not apply `ready-for-agent`, assign owners, close issues or publish #17/#7 drafts.

### P2: Publish the parent amendment and native child dependencies

- [ ] After the user says to start publication, update #10 with the exact reviewed parent body using `gh issue edit 10 --body-file <prepared-file>` and read it back. Do not edit #9 or publish #17/#7 drafts. This current docs-only task performs none of these writes.
- [ ] For each missing child, use `gh issue create --repo noelorph/diy-instax-photobooth --parent 10 --title '<approved title>' --body-file '<prepared file>'`. Record the returned URL and numeric database ID before proceeding to the next child.
- [ ] For each child, add #9 and every prerequisite in the table as native blockers using `gh api --method POST repos/noelorph/diy-instax-photobooth/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. Fetch existing edges first to avoid duplicate work. Keep #10's own #9 blocker.
- [ ] Update child bodies with the assigned prerequisite numbers using `gh issue edit --body-file`. Preserve the revised parent scope and unrelated metadata. A failed operation is resumed from recorded IDs, not by creating another set of issues.

### P3: Verify publication and complete the planning handoff

- [ ] Read back every child's body, native parent and blockers; verify all eight are attached to #10 and match the dependency table. A body link alone is not native linkage.
- [ ] Replace the pending values below with real issue numbers/URLs, link the plans from the approved design, and record publication status without claiming implementation completion.
- [ ] The initial approved documentation commit was requested on 2026-10-25. Validate any later publication-record changes with local links, Prettier and `git diff --check`; follow the user's later commit instructions. No push or application execution is part of publication.

| Local ID | GitHub sub-issue | Publication status            |
| -------- | ---------------- | ----------------------------- |
| F1       | Pending          | Approved; publication on hold |
| F2       | Pending          | Approved; publication on hold |
| F3       | Pending          | Approved; publication on hold |
| F4       | Pending          | Approved; publication on hold |
| F5       | Pending          | Approved; publication on hold |
| F6       | Pending          | Approved; publication on hold |
| F7       | Pending          | Approved; publication on hold |
| F8       | Pending          | Approved; publication on hold |

## Completion and self-review

This revision is ready only after the full spec/plan reread, builder design check, local link/anchor/reference checks, formatting and documentation scope checks pass. Record actual results in the [review record](../../implementation/issue-10-retirement-and-acceptance.md#documentation-review-2026-10-25). No old review count is evidence for this revision.

Review each capability against the current PRD, architecture, glossary, ADR-0025/26/27/28/29, replacement contract and live #9/#10. Preserve the accepted #9 runtime requirements; explicitly account for its obsolete conversion work. Verify every removal has an owner, every shared interface/test environment agrees, and every acceptance row remains pending until implementation proves it. No legacy History/conversion task or “retain old migrations” instruction may survive as active guidance.

The live issues were read on 2026-10-25: #9 is closed/accepted and #10 is open. Both still contain the earlier preservation scope; the local publication record identifies that difference and provides the approved #10 amendment for later publication. Do not silently treat a stale issue body as authority over ADR-0029, or claim it has already been updated.

The user approved the revised plan on 2026-10-25 and authorized committing the completed documentation first. They explicitly asked not to start yet. Wait for their start instruction before the remaining P1–P3 publication tasks; application implementation requires its later instruction. This approval/commit starts no code changes, resets no database, enables no real printing and closes no issue.
