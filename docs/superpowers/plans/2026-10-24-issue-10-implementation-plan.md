# Issue #10 Implementation and Publication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout every implementation plan:** Use **ponytail:ponytail, full**. Read its installed `SKILL.md` at execution time. Reuse existing contracts/components, choose the smallest complete change, trace affected callers/tests/fixtures, and preserve authorization, privacy, accessibility and printer safety. This applies to every child and every task, including verification and cleanup.

**Goal:** Deliver eight complete capabilities as native GitHub sub-issues of #10, then implement and verify them after plan approval/publication, using the accepted #9 contracts.

**Architecture:** Integrate the existing version-2 database/HTTP contracts into the current Admin features and one shared Booth controller. Keep each capability's UI, integration, data changes, tests and retirement work together. Coordinate the application/database switch in F8; individual child completion does not activate or release the application.

**Tech Stack:** Installed Next.js 16.4, React 19.3, TypeScript, Zod, Supabase Auth/Postgres/Storage, existing UI components, Vitest and Playwright. Recheck installed versions at execution; do not upgrade the framework as part of this plan.

**Spec:** [Approved functional design](../specs/2026-10-24-issue-10-functional-breakdown-design.md), [replacement contract](../specs/2026-10-21-package-accounting-booth-recovery-design.md), [ADR-0027](../../adr/0027-draft-only-event-media.md).

**Status:** Written on 2026-10-24; revised for review on 2026-10-25. Design approved; implementation/publication plan approval remains pending. #9 is verified and closed as completed; #10 remains open. No child has been published or implemented by this revision. The nine original drafts were copied from the `47f4` worktree at the same documentation baseline `aaf1adc`; revisions in this worktree preserve those originals.

## Global Constraints

- **The #9 software prerequisite is satisfied.** Before F1–F8 execution, verify accepted candidate `2f89a96` and the [dated software acceptance](../../implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25), then reconcile source references with the execution revision. Plan approval/publication and capability prerequisites remain required; #9 repairs are outside these plans.
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
5. Cutover tests must run only in their disposable app/database; partial cutover preserves legacy history and denies obsolete writes without resetting uncertain outcomes: F8 tasks 1–3.

## Capability plans and dependencies

Each row is **one GitHub sub-issue**, not a separate UI/API/database/testing phase. F1–F8 are local identifiers until publication. The [flowcharts](../../diagrams/issue-10-functional-breakdown.md) are the short visual guide.

| ID / proposed issue title                                 | Plan                                                    | Prerequisites besides #9 | Independently demonstrable outcome                             |
| --------------------------------------------------------- | ------------------------------------------------------- | ------------------------ | -------------------------------------------------------------- |
| F1: Complete Admin access and account management          | [F1](2026-10-24-issue-10-f1-admin-access.md)            | None                     | Sign in/recover/manage account with correct session boundaries |
| F2: Complete Event preparation and private media          | [F2](2026-10-24-issue-10-f2-event-preparation-media.md) | F1                       | Valid Draft, private media, safe cancellation/deletion         |
| F3: Complete booked capacity and Additional Film Packages | [F3](2026-10-24-issue-10-f3-package-capacity.md)        | F2                       | Real Admin purchase/count workflow, exactly once               |
| F4: Complete Booth setup, access and lifecycle            | [F4](2026-10-24-issue-10-f4-booth-lifecycle.md)         | F1, F2, F3               | Setup/handoff, phone pause/resume/finish and Event termination |
| F5: Complete the Guest capture-to-print journey           | [F5](2026-10-24-issue-10-f5-guest-printing.md)          | F2, F4                   | One reviewed Capture, at most one send, truthful completion    |
| F6: Complete Booth recovery across devices                | [F6](2026-10-24-issue-10-f6-booth-recovery.md)          | F3, F4, F5               | Resolve outcome and equipment/access blockers safely           |
| F7: Complete operational visibility and retained history  | [F7](2026-10-24-issue-10-f7-visibility-history.md)      | F2, F3                   | Accurate summaries/activity and immutable historical detail    |
| F8: Complete coordinated cutover and final acceptance     | [F8](2026-10-24-issue-10-f8-cutover-acceptance.md)      | F1–F7                    | Combined application and cutover pass nonproduction acceptance |

F7 may follow F3 while F4–F6 proceed in dependency order. F4/F5/F6 sequentially extend `src/features/booth/flow.ts` and `booth-client.tsx`; they must not introduce competing orchestration state machines. The dependency graph does not request delegation now. Implementation method is selected later, after the gate and explicit authorization to implement.

## Acceptance ownership before implementation

The [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) is populated now with requirements, accountable capability/task, named test scenarios and pending evidence. Each owner records revision, exact command/config/environment, result and evidence location before its issue closes. Refer to that single table from child issues instead of maintaining divergent copies. F8 audits and reruns accumulated evidence on the combined candidate; it does not first assign missing requirements at the end.

In particular, F3 owns the exactly-once purchase; **F5 owns exhaustion → phone purchase → a newly admitted Guest**, and F6 owns the variants where pause or another blocker still prevents admission. F4 owns fresh camera/printer readiness after setup handoff. Every required test not yet written or run remains explicitly pending.

## File and interface ownership

| Owner | Existing home to extend                                                                                  | New files allowed by this plan                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| F1    | `src/features/admin/auth/`, `profile/`, `src/components/{ui,shared,layout}/`                             | No new feature layer                                                                                                               |
| F2    | `src/features/admin/events/`, `src/lib/events/drafts.ts`, existing receipt/RPC and media-cleanup helpers | Forward Draft-creation receipt and media migrations, focused media module/routes/UI and shared browser fixtures; exact paths in F2 |
| F3    | `src/features/admin/operations/{read.ts,types.ts,panel.tsx}`                                             | Focused purchase browser regression only; no new ledger                                                                            |
| F4–F6 | `src/features/booth/`, Admin operations, existing #9 HTTP routes                                         | Focused setup/recovery UI modules only where identified; tests reuse existing fixtures                                             |
| F7    | Dashboard/History pages, `src/lib/events/history.ts`, Admin operations read model                        | Dashboard projection/view and read tests                                                                                           |
| F8    | Existing cutover functions, version switches, route/fixture callers and the acceptance trace             | Forward retirement migration and committed cutover rehearsal fixture/config/test                                                   |

Existing wire contracts stay in `src/lib/operations/{package-contract,package-validation,package-state,package-route,package-rpc}.ts`. Client inputs use `operationId` and the exact schemas there, never legacy `operationKey`. `requireAdmin()` supplies `{userId, sessionId}`; read helpers must retain its live-session/RLS checks. Each plan distinguishes existing signatures from proposed application interfaces.

F2 task 1 corrects the direct Draft creation path to use a stable creation ID, existing receipt machinery and one atomic creation/audit commit, and introduces the shared local browser fixture when first needed. F4 consumes it and owns the camera helper's explicit `existing` / `request` permission intent, all initial callers/tests and post-navigation equipment readiness; F5 preserves that boundary and F6 wires Enable Camera to it. These corrections implement approved retry and permission behavior without changing capability dependencies or release gates.

## Verification and environment rules

Use `tests/fixtures/local-supabase.ts` and `package-contract.ts` for isolated local fixtures; refuse hosted URLs. Run database suites and all browser commands **serially across processes**, not merely one worker per file. They share local Auth/data and Next build output. Restore fixture-owned defaults/policy and remove exact fixture IDs in `finally`; never reset a shared stack or remove unrelated rows to make a test pass. Abort on unexpected project identity, occupied app ports or unverified cleanup; do not attach to an existing app.

F2 may temporarily change only the local `events.accounting_version` creation default to 2 for serial creation tests, including browser creation, and restore the original default in `finally`; owner-seed v2 fixtures elsewhere. Keep `active_creation_version` unchanged. F2 owns `tests/fixtures/package-browser.ts`; later capabilities consume it. This tests target creation without global activation. F8 alone rehearses committed owner activation in a disposable copy; its fixture never imports the fixed-56321 owner helper. Do not alter accounting versions on existing records or bypass production guards.

The table describes the **required implemented configuration**, not environments changed by this documentation review. Commands run from the repository root after dependencies/local migrations are prepared. A focused browser command always names its config.

| Command / config                                                                 | Application and evidence mode                                                                                                           | Database / fixture and allowed changes                                                                                                                  |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --reporter=verbose` / `vitest.config.mts`                           | Unit/component tests plus real local integration; no browser server                                                                     | `diy-instax-package-contracts`, API `127.0.0.1:56321`, DB `56322`; exact-ID fixtures, restored defaults/policy; migration activation tests roll back    |
| `npm run test:e2e` or `npx playwright test --config playwright.config.ts <file>` | Production build/start at `127.0.0.1:1437`, `tests/fixtures/browser-server.mjs`; simulation denied, including when its flag is supplied | Same `56321/56322` stack; F2/F3/F7 real data/Storage workflows, F1 Auth and production denial tests; no committed activation                            |
| `npx playwright test --config playwright.booth.config.ts`                        | Development app at `127.0.0.1:1438`; only `booth-simulator.spec.ts`; simulator enabled                                                  | Same local stack, explicit credentials from CLI status via the shared runner; F5/F6 real operations, not inherited request-mocked success               |
| `npx playwright test --config playwright.admin-booth.config.ts`                  | Development app at `127.0.0.1:1439`; only `admin-booth-simulator.spec.ts`; simulator enabled                                            | Same local stack/runner; F4–F6 two-context journeys, fixture-owned policy restored                                                                      |
| `npx playwright test --config playwright.cutover.config.ts`                      | Fixture-owned candidate app at `127.0.0.1:1440`; production build for committed cutover/history/denials, simulation denied              | **Disposable** `diy-instax-package-cutover`, API `127.0.0.1:57321`, DB `57322`; synthetic Auth/data/private Storage, owner activation/restore only here |

**Discovery and startup ownership:** F8 adds `package-cutover.spec.ts` to default `playwright.config.ts.testIgnore` in the same change that creates it; retain the two simulator exclusions. `playwright.cutover.config.ts` matches only that file, uses one worker, and has no competing `webServer`: its `withPackageCutoverFixture` starts/stops the app around activation/recovery and awaits health. The two simulator configs retain exact single-file `testMatch`. F4 extends the existing `admin-booth-server.mjs` to accept only `1438` or `1439` as its port and makes both simulator configs use it, setting local credentials and matching `ADMIN_AUTH_ORIGIN` explicitly; no inherited `.env.local` database selection. F2 extends the ordinary fixture for its v2 creation tests. F8 owns default exclusion and disposable configuration; no ninth capability is introduced.

Before any browser run after changing discovery, run all four `npx playwright test --config <config> --list` commands. The default list must omit all three specialized files; each specialized list must contain only its intended file. Discovery must not provision/reset a stack, change defaults or start an app. The cutover test checks its config/base URL before fixture setup and the fixture checks project/container/ports before mutation, so an explicitly misrouted run fails before touching a database. Keep screenshots, traces and video off for every Guest journey. Cutover evidence must also show that the `56321` stack was unchanged.

Each child runs its focused commands and changed-file lint/type/format checks. Exact candidate commands at F8:

```bash
npm test -- --reporter=verbose
npm run test:e2e
npx playwright test --config playwright.booth.config.ts
npx playwright test --config playwright.admin-booth.config.ts
npx playwright test --config playwright.cutover.config.ts
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

| Retired behavior                        | First owner               | F8 must prove                                                                        |
| --------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| Editable Print Allowance                | F2 Draft; F3 operations   | No editable input, payload or writable independent count                             |
| Individual Additional Prints            | F3                        | Old UI/action/HTTP/DB mutation denied                                                |
| Shared Film Stock                       | F3; F7 historical reading | No active stock ledger/inventory dependency                                          |
| Wasted Film / quality refunds           | F5/F6; F7 old totals      | Full ejection stays counted, retired mutations denied                                |
| In-app Test Print/setup gate            | F4                        | Reminder only, old test mutation denied                                              |
| Client Redaction / past-Event deletion  | F2/F7                     | Terminal details retained; safe Draft cleanup still works                            |
| Old recovery/local takeover             | F4/F5/F6                  | No ordinary pause/fault sign-in or same-photo retry                                  |
| Compatibility adapters/branches/helpers | Every owner               | Remove unused paths after legacy settlement; retain only historical readers/evidence |

Each child records controls, callers, actions, routes, SQL functions, fixtures and tests affected. Preserve old settlement ability in the pre-cutover application until legacy work is terminal; remove final runtime paths and revoke obsolete writes as one F8 cutover. Applied migrations and historical audit records remain.

## Publication tasks — execute only after this plan is approved

### P1: Record approval and prepare the exact eight issue bodies

- [ ] Record the user's plan approval here. Do not interpret design approval as plan approval.
- [ ] Read #10's native sub-issues and existing blockers with `gh api repos/noelorph/diy-instax-photobooth/issues/10/sub_issues --paginate` and `gh api repos/noelorph/diy-instax-photobooth/issues/10/dependencies/blocked_by --paginate`. Reuse a matching child after partial publication.
- [ ] Prepare eight UTF-8 body files from the child plans, including purpose, complete scope, non-goals, task checklist, exact design references, contract reuse, dependencies, owned acceptance-trace rows, test commands/environments, retirement ownership and Ponytail full requirement. Include `Part of #10` and the satisfied #9 prerequisite with its evidence. Include plan/trace content in the body when local links are not yet available on GitHub; never publish broken branch links as the only instructions.
- [ ] Check all eight bodies against the approved dependency and retirement tables. Leave triage labels unset while blocked; do not apply `ready-for-agent`, assign owners, close issues or publish #17/#7 drafts.

### P2: Create native sub-issues and native blocking dependencies

- [ ] For each missing child, use `gh issue create --repo noelorph/diy-instax-photobooth --parent 10 --title '<approved title>' --body-file '<prepared file>'`. Record the returned URL and numeric database ID before proceeding to the next child.
- [ ] For each child, add #9 and every prerequisite in the table as native blockers using `gh api --method POST repos/noelorph/diy-instax-photobooth/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. Fetch existing edges first to avoid duplicate work. Keep #10's own #9 blocker.
- [ ] Update child bodies with the assigned prerequisite numbers using `gh issue edit --body-file`. Preserve parent milestone scope and unrelated metadata. A failed operation is resumed from recorded IDs, not by creating another set of issues.

### P3: Verify publication and complete the planning handoff

- [ ] Read back every child's body, native parent and blockers; verify all eight are attached to #10 and match the dependency table. A body link alone is not native linkage.
- [ ] Replace the pending values below with real issue numbers/URLs, link the plans from the approved design, and record publication status without claiming implementation completion.
- [ ] Commit only the reviewed planning/docs changes after local links, Prettier and `git diff --check` pass. Preserve unrelated SQL and other work. No push or application execution is part of this publication task.

| Local ID | GitHub sub-issue | Publication status     |
| -------- | ---------------- | ---------------------- |
| F1       | Pending          | Awaiting plan approval |
| F2       | Pending          | Awaiting plan approval |
| F3       | Pending          | Awaiting plan approval |
| F4       | Pending          | Awaiting plan approval |
| F5       | Pending          | Awaiting plan approval |
| F6       | Pending          | Awaiting plan approval |
| F7       | Pending          | Awaiting plan approval |
| F8       | Pending          | Awaiting plan approval |

## Completion and self-review

This documentation review prepares the full plan for user approval. After approval, publish and verify the eight native sub-issues, bodies and blockers under P1–P3; application implementation remains a later authorized task. The #9 prerequisite is already satisfied. No extra publication permission is required after plan approval under the approved design; this review does not publish anything.

Self-review checks: each approved capability maps to its plan; dependency interfaces agree; every retirement has an owner; media policy matches ADR-0027; failure conditions in Review Focus have owning test tasks; no #9 repair, hardware qualification, production deployment or new product feature is included. The final documentation validation records actual results in the handoff, not fabricated implementation passes.

**Planning validation, 2026-10-24:** Self-review completed against the approved design and current #9/#10 descriptions. All nine plans include the required headers and Ponytail full reminder; the eight child plans contain 23 implementation tasks. Checked 316 local Markdown links/anchors and 114 existing source/config references; the remaining referenced source paths are explicitly planned creations. Documentation formatting/whitespace checks pass. No application, database, browser or hardware acceptance test was run by this planning change.

**Correction and re-review, 2026-10-24:** At the user's request, corrected F2's creation identity/receipt/audit instructions and F4's shared camera-permission behavior, with matching F5/F6 consumers and index ownership. Independent spec and execution-readiness reviews of all nine plans found both planning findings addressed and no new approval blocker. The approved scope, dependency diagram and release gates remain intact; the separate advisory additions were not applied. Prettier passes for all nine plans; 84 local plan links/anchors and whitespace checks pass. A before/after file comparison confirms only F2, F4, F5, F6 and this index changed. No application, database, browser or hardware tests were run. Plan approval/publication remain pending; implementation still requires #9's final reviewed revision and passing required verification.

**2026-10-25 revision:** The dated entries above describe their original candidates. This revision records #9's accepted handoff, the user's monthly-count clarification, explicit browser-environment separation, acceptance ownership from the start, post-handoff readiness proof and earlier media mechanics/deletion proof. Current documentation review and pending implementation evidence are recorded in the [acceptance record](../../implementation/issue-10-retirement-and-acceptance.md). Approval remains pending; no application, database, browser or hardware acceptance is claimed by this revision.
