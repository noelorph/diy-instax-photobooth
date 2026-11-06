# F7 — Operational Visibility and Retained History Implementation Plan

**Reference and scope synchronization — 2026-11-06:** This plan incorporates the already-approved #35 Live Event card, History filters and three-task work order. It records no implementation or acceptance pass. #9 and F3 #31 are completed; the verified upload-disabled F2 milestone satisfies F7’s F2 prerequisite under ADR-0032. Full #30 remains open, completes last and blocks parent #10 closure.

**Published issue:** [#35](https://github.com/noelorph/diy-instax-photobooth/issues/35), native child of [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10). The [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) is the single F7-01–F7-06 requirement/test/evidence record. Follow the [shared command/environment rules](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout:** Use **ponytail:ponytail, full**. Preserve working package reads, current security checks and meaningful tests. Add no analytics platform, second ledger or legacy reader.

**Goal:** The Admin can understand current and upcoming work, recent activity and retained Events through accurate package reporting and immutable History.

**Architecture:** Extend authorized read projections over current package Events and existing activity records. Reuse authoritative package counts; keep mutations and audit production with their existing owners. Render the new Figma references through current shared components, retaining uploads-unavailable and safe Draft-cleanup boundaries.

**Tech Stack:** Existing Next.js/React/TypeScript, Temporal, Supabase read boundaries, shared UI and Vitest/Playwright. No new dependency is required by this plan.

**Spec:** [PRD](../../../PRD.md), [replacement contract](../specs/2026-10-21-package-accounting-booth-recovery-design.md), [functional design](../specs/2026-10-24-issue-10-functional-breakdown-design.md#f7-operational-visibility-and-retained-history). Use the main plan’s [screen reference and presentation contract](2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract): A01/A07/A08, A06 counts/activity and A05 unavailable-media pattern.

## Global Constraints

- Authenticated/private reads only. Preserve `requireAdmin()` live-session checks, Admin RLS and private/no-store responses. Activity contains safe Event/action references without Client contact copies, credentials, signed URLs or Guest photos.
- Monthly Events counts nondeleted Draft, Live and Completed by scheduled start in each Event's venue-local current month; exclude Cancelled. Convert both scheduled start and server time to that venue's zone. Total booked excludes Cancelled/deleted Events across all months. Upcoming/Next considers future Draft/Live starts only, ordered by start then ID. Never count by creation time.
- Dashboard activity uses a server-supplied instant, 7/30-day windows, zero-based pages, 25 rows and `created_at DESC, id DESC` ordering. Apply predicates/pagination in the query and read 26 rows for `hasNextPage`; do not silently truncate Event summaries at the database's default row cap.
- History is Completed/Cancelled only. Its filters change the displayed list, not accounting, retention or Dashboard definitions. Query values must be validated/defaulted; no client-provided state may broaden access to Draft/Live/deleted records.
- Ten prints per Film Package. `printsRemaining = totalBookedPrints - printed`; `printsAvailable = printsRemaining - unresolved`. A fully ejected unusable print stays counted. No stock inventory, quality refund, editable allowance or legacy count fallback.
- Event state and Booth run state are distinct. The Live Event card reflects the current Live Event and authoritative counts/run state, including Paused/Finished runs; it must not label every Live Event as Booth Active. No Live Event and failed read are different states.
- Keep media sections and **“Media uploads are temporarily unavailable.”** Preserve the Admin Event Media reminder: **“Before re-enabling uploads, verify cleanup of interrupted or late uploads and leftover files.”** No media attached must be established by a successful authorized read, not inferred from unavailable delivery or a query failure. No re-enable control is added.
- Terminal records have no edit, reopen, Add Film Packages, redaction or deletion controls. Pending removal retry is scoped to previously deleted Drafts and remains separate from terminal History.
- Query only current package records while the pre-F8 schema still contains legacy objects. A current-version predicate is an exclusion guard, not a dual-version reader; F8 owns removing the obsolete schema/version machinery.
- The main plan’s screen reference governs presentation under ADR-0034; existing product/security rules remain authoritative. Use shared components and preserve the required states/accessibility even when omitted from an example screen.

## Review Focus

1. Venue-month boundaries, DST and out-of-month bookings must not corrupt monthly versus all-time totals — Task 1.
2. Tied activity timestamps, deleted Event references and filter/page changes must not lose stable ordering, expose contact data or manufacture successful empty results — Tasks 1 and 3.
3. No Live Event, a Live Event with a Paused/Finished run, and an unavailable count read must remain distinct — Task 1.
4. History filters and direct terminal URLs must retain correct package counts, contact records and read-only behavior, including unusable ejections — Task 2.
5. Revoked Admin access, failed media reads and pending Draft cleanup must not disclose retained content, falsely report no media or expose terminal mutation controls — Tasks 2 and 3. Enabled URL renewal remains #30 qualification.

## File map and proposed read interfaces

| Files                                                                                                                                   | Responsibility                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Create `src/features/admin/dashboard/{read.ts,types.ts,dashboard.tsx,dashboard.module.css}`                                             | Dashboard projection, types and presentation                                    |
| Modify `src/app/(admin)/dashboard/page.tsx`                                                                                             | Server time, validated activity query and Dashboard rendering                   |
| Modify `src/lib/events/history.ts` and `src/app/(admin)/history/page.tsx`                                                               | Filtered package History with authoritative counts and retained fields          |
| Modify `src/app/(admin)/events/[eventId]/page.tsx`                                                                                      | Dedicated immutable terminal detail; preserve Draft/Live consumers              |
| Create `src/features/admin/events/{history-detail.tsx,history-detail.module.css}`                                                       | Read-only A08 booking, count, activity and media-status view                    |
| Extend `src/features/admin/events/event-media.tsx` only as needed                                                                       | Reuse unavailable/retained presentation without terminal upload/remove controls |
| Modify `src/features/admin/operations/{read.ts,types.ts,panel.tsx}` only where required                                                 | Reuse authoritative package projections, preserve existing operational callers  |
| Create `tests/integration/dashboard-read.test.ts`, `tests/components/dashboard-history.test.tsx`, `tests/e2e/dashboard-history.spec.ts` | Real read, presentation and browser acceptance                                  |
| Extend `tests/integration/admin-operations-read.test.ts`, `tests/components/admin-operations-pages.test.tsx`                            | History/direct-detail regression and existing consumers                         |

Use existing `tests/fixtures/{local-supabase.ts,package-contract.ts,package-browser.ts,test-stack.mjs}`. Add a forward read index/projection migration only if a measured query requires one; no new source of product data. Do not create files already supplied by intervening work.

**Task 1 produces:**

```ts
type ActivityItem = {
  id: string;
  eventId: string | null;
  operationKind: string;
  occurredAt: string;
};
type DashboardLiveEvent = {
  id: string;
  title: string;
  venueAddress: string;
  startsAtUtc: string;
  endsAtUtc: string;
  timeZone: string;
  runState: RunState | null;
  counts: PackageCounts;
};
type DashboardReadResult =
  | {
      status: 'success';
      summary: {
        monthEvents: number;
        upcomingEvents: number;
        totalBookedEvents: number;
        nextEvent: { id: string; title: string; venueAddress: string; startsAtUtc: string; endsAtUtc: string; timeZone: string } | null;
      };
      liveEvent: DashboardLiveEvent | null;
      activity: ActivityItem[];
      hasNextPage: boolean;
    }
  | { status: 'unavailable'; error: string };

readDashboard(input: { now: string; activityDays: 7 | 30; page: number }): Promise<DashboardReadResult>;
```

`PackageCounts` and `RunState` are imported from `src/lib/operations/package-contract.ts`. `now` comes from server code, never arbitrary client time. Put the new types in `dashboard/types.ts` and the read in `dashboard/read.ts`. Use existing package-state reads rather than recalculating a second ledger. A safe Event display label may be joined separately; never expose the raw audit row or Client fields.

**Task 2 produces in `src/lib/events/history.ts`:**

- `HistoryFilter = 'all' | 'Completed' | 'Cancelled'`.
- `HistoryEvent` retains its existing booking/contact/schedule fields and adds `counts: PackageCounts`.
- `listHistory(filter: HistoryFilter = 'all')` retains the existing `{status: 'success'; events: HistoryEvent[]}` / `{status: 'unavailable'; error: string}` convention; existing no-argument callers continue to work.
- `getHistoryEvent(id: string, activityPage = 0)` returns `{status: 'success'; event: HistoryEvent; captures: number; activity: ActivityItem[]; hasNextPage: boolean; mediaAssetCount: number}` or `{status: 'not_found'}` or `{status: 'unavailable'; error: string}`. It reads only nondeleted terminal package Events. `mediaAssetCount` counts attached retained assets through authorized metadata, not abandoned uploads or cleanup records; a failed read returns unavailable.

Terminal activity is retained all-time Event history, newest first with the same stable ordering and 25-row pages; do not apply the Dashboard's 7/30-day retention window. Use the existing count/read boundaries without fetching every Event's print-attempt pages just to render a History list. Validate page values as bounded nonnegative safe integers using the existing operations-read convention; invalid query defaults to page 0. History uses `state=all|Completed|Cancelled`; invalid state defaults to `all`. Terminal activity uses `activityPage` without breaking existing `attemptPage` callers.

## Task 1: Complete Dashboard summaries, Live Event card and activity

**Files:** Dashboard files/tests and Dashboard page from the file map; existing activity producers are consumed interfaces, not new Dashboard mutation responsibilities.

**Interfaces:** Consume current Admin authorization, `PackageCounts`, `RunState`, existing package-state operations and `activity_events`. Produce `readDashboard()` and its types above for the server page; Task 2 reuses the `ActivityItem` type.

- [ ] **Step 1: Write real read and component regressions for the missing projection.** Use fixed server time, venue-local month boundaries/DST, deleted/Cancelled rows, more than 25 activities and tied timestamps. Include the named case `monthly Events includes Draft Live Completed and excludes Cancelled`. With four in-month Events, one per state, assert: Retain the named regression `monthly Events includes Draft Live Completed and excludes Cancelled`.

  ```ts
  expect(result.summary.monthEvents).toBe(3);
  expect(result.summary.totalBookedEvents).toBe(3);
  expect(result.activity).toHaveLength(25);
  expect(result.hasNextPage).toBe(true);
  expect(result.activity[0]).not.toHaveProperty('client_email');
  ```

  Cancelling the Draft reduces both totals to 2 while both Cancelled records remain retained. A separate noncancelled out-of-month control increments total booked but not monthly; a deleted Draft increments neither. Test upcoming/next independently, including tied starts. Assert 7/30-day inclusion boundaries, malformed query defaults, stable page membership on a fixed dataset, unknown audit-kind fallback, deleted Event audit references, revoked Admin and database failure returning unavailable rather than zero.

- [ ] **Step 2: Add Live Event card regressions.** For five original plus one additional package, 37 Printed and one Pending, assert 60 booked and 22 available. Test Active, Paused, Finished and no-run labels while the Event is Live; the link targets `/events/{id}`. No Live Event returns `liveEvent: null`; failure to read counts returns unavailable. Completed/Cancelled/deleted Events never become the Live card. Render the named cases `Live Event card uses authoritative counts and current run state` and `missing Live Event is distinct from unavailable reporting`.
- [ ] **Step 3: Run the new tests before implementation.** Run `npm test -- tests/integration/dashboard-read.test.ts tests/components/dashboard-history.test.tsx`. Expected: the new assertions fail for the missing Dashboard behavior, not fixture/auth startup failure. Reuse any existing passing cases rather than duplicating them.
- [ ] **Step 4: Implement `readDashboard()` in `dashboard/read.ts`.** Use current Admin/RLS and package-only reads, exact summary definitions, stable query ordering and a 26-row activity lookahead. Read all qualifying summary rows without a silent database cap. Return honest unavailable results on required read failures; activity label handling must tolerate unknown current kinds and missing/deleted Event references.
- [ ] **Step 5: Render A01 through `dashboard.tsx`, its CSS and the Dashboard page.** Supply server time, validated query values, summary cards, Live Event card, next/upcoming links, 7/30-day controls, page navigation and contextual empty/error/loading states. Filter changes reset the activity page; page links preserve the selected window. Keep the visible Dashboard heading/accessibility name even if Figma uses a greeting. Use the main plan’s presentation foundations; use no hardcoded example counts or false “Booth Active” status.
- [ ] **Step 6: Run focused read/component and real-browser verification.** Rerun Step 3, then `npx playwright test --config playwright.config.ts tests/e2e/dashboard-history.spec.ts -g 'Dashboard'`. Expected: pass with real seeded data, the rendered four-state monthly count, Live/run-state variants, filters/pages, direct links, both Admin themes and keyboard focus.
- [ ] **Step 7: Commit the verified Task 1 files.** Suggested message: `feat: complete dashboard summaries live event and activity`. Stage only its changed source/tests; no empty commit or unrelated changes.

## Task 2: Complete filtered History and immutable Event detail

**Files:** History/read/page, terminal-detail files and existing operations consumers/tests from the file map. Preserve `src/features/admin/operations/pending-removals.tsx` and its safe Draft receipt flow.

**Interfaces:** Consume authoritative package-state counts and Task 1's `ActivityItem`; produce `HistoryFilter`, extended `HistoryEvent`, `listHistory(filter)` and `getHistoryEvent(id, activityPage)` above. The terminal view receives successful read data; it adds no mutation endpoint or delivery authorization mechanism.

- [ ] **Step 1: Extend real read/page tests with Completed and Cancelled package Events, a deleted Draft and retained asset metadata.** The case `History filters retain immutable package records` verifies all three filters and invalid-query defaulting. Five packages with 13 confirmed ejections—including an unusable fully ejected sheet—must satisfy:

  ```ts
  expect(completed.counts).toMatchObject({
    totalBookedPrints: 50,
    printed: 13,
  });
  expect(completed.counts).not.toHaveProperty('originalPrintAllowance');
  expect(
    screen.queryByRole('button', {
      name: /redact|delete event|add film packages|reopen|edit event/i,
    })
  ).toBeNull();
  ```

  Assert retained contact/schedule/time-zone fields, correct original/additional packages, separate Capture totals including Retakes, no legacy rows/count fallback and deleted Draft exclusion. Terminal activity includes records older than 30 days and paginates stably. Read failures and empty results are distinct. Cover Completed and Cancelled direct URLs, revoked Admin and denied terminal mutations through existing trusted boundaries.

- [ ] **Step 2: Add disabled-media and cleanup regressions.** `terminal media state never treats a failed read as no attachment` checks attached, successfully empty and failed metadata reads. Retained assets stay private/read-only; no usable signed URL, upload/remove control or enabled-transfer proof is invented. Show the unavailable status and persistent cleanup reminder in the Event Media section, including when empty. Verify separate opaque deleted-Draft cleanup retry remains available and does not become a terminal deletion action.
- [ ] **Step 3: Run tests before implementing missing behavior.** Run `npm test -- tests/integration/admin-operations-read.test.ts tests/components/admin-operations-pages.test.tsx tests/components/dashboard-history.test.tsx`. Expected: new assertions expose missing filters, count projection or terminal detail/media state. Existing passing package read/security tests remain intact.
- [ ] **Step 4: Implement `listHistory(filter)` and `getHistoryEvent()` in `src/lib/events/history.ts`.** Keep current Admin authorization/RLS, terminal/deleted/current-package predicates and authoritative counts. Preserve pending Draft-cleanup reads and receipt identity. Eliminate unnecessary per-row operational attempt-page reads in History. Do not add `LegacyHistoryCounts`, schema-version unions, snapshots, correction readers or conversion paths.
- [ ] **Step 5: Render A07 and A08.** Update History query/navigation with All History / Completed / Cancelled filters and retained rows. Route terminal Event URLs to the dedicated immutable detail with booking/contact, package/print/Capture totals, Event activity and honest media status. Preserve Draft/Live pages and existing print-attempt access where applicable. The new terminal view must not reuse editable Draft forms or display Live mutation controls. Existing unavailable media presentation may be reused/refactored without enabling its deferred uploader; authorized retained delivery is consumed only when F2 actually supplies it.
- [ ] **Step 6: Run focused read/component and real-browser verification.** Rerun Step 3, then `npx playwright test --config playwright.config.ts tests/e2e/dashboard-history.spec.ts -g 'History'`. Expected: pass for filter links/reload/direct URLs, 50 booked/13 printed, retained records, read errors, revoked access, disabled media, separate pending Draft cleanup and responsive/keyboard presentation.
- [ ] **Step 7: Commit verified Task 2 files.** Suggested message: `feat: complete filtered package history and immutable detail`. Remove only remaining obsolete F7 application consumers and update all affected callers/tests.

## Task 3: Complete integrated verification and retirement evidence

**Files:** `tests/e2e/dashboard-history.spec.ts`, the focused tests above, and affected F7 source only for demonstrated defects. Synchronize `docs/superpowers/plans/2026-10-24-issue-10-f7-visibility-history.md`, `docs/superpowers/specs/2026-10-24-issue-10-functional-breakdown-design.md`, `docs/implementation/issue-10-retirement-and-acceptance.md` and `docs/github-issue-update-drafts.md`. Update affected `PRD.md`, `docs/superpowers/plans/2026-10-24-issue-10-implementation-plan.md`, design-reference guidance and ADR records where required by the approved additions, following `AGENTS.md`'s decision-confirmation rule. No documentation pass may imply runtime acceptance.

**Interfaces:** Consumes the Task 1/2 pages and read contracts; produces exact candidate/environment evidence and a retirement inventory, not a new runtime abstraction.

- [ ] **Step 1: Audit remaining retirement scope against the execution revision.** Record F3's removal of allowance/stock reads, F5's Wasted Film retirement and later legacy HTTP cleanup (including `655270a`) as upstream implementation evidence, then verify current absence. The reviewed application tree already lacks terminal redaction/delete routes and the old reporting count types/joins; do not recreate them to “complete” their deletion. Identify only actual remaining F7 callers/helpers/tests. Retain negative stale-request tests and factual historical evidence. Shared SQL, generated types, old migration chain and fresh-schema proof remain F8-owned.
- [ ] **Step 2: Add any missing cross-page regression before fixing a demonstrated gap.** Use the real local fixture to prove Dashboard → Live Event and History → terminal detail navigation, filter/query persistence, absence of terminal controls, and current-session denial. Preserve meaningful tests; do not write tests merely mirroring implementation or claim component mocks establish full acceptance.
- [ ] **Step 3: Verify the combined F7 candidate.** Run `npm test -- tests/integration/dashboard-read.test.ts tests/integration/admin-operations-read.test.ts tests/components/admin-operations-pages.test.tsx tests/components/dashboard-history.test.tsx` and `npx playwright test --config playwright.config.ts tests/e2e/dashboard-history.spec.ts` in the main plan’s verification and environment table. Expected: all selected tests pass. Exercise persistent errors, loading/empty/disabled states, compact/medium/wide layouts, portrait/landscape, light/dark Admin, keyboard/focus, 200% zoom and reduced motion. Verify production simulation denial where affected. Record failures and the fixing revision/rerun; no arbitrary retry pass or disabled test substitutes for evidence.
- [ ] **Step 4: Run static checks and reconcile the documentation.** Run changed-file ESLint/Prettier, `npx tsc --noEmit --incremental false` and `git diff --check`; expected exit 0. Check changed Markdown separately with Prettier. Synchronize the approved Figma links, scope additions, actual read interfaces, fixture guidance, already-completed retirement and F7-01–F7-06 acceptance ownership. Preserve dated failed/successful evidence and distinguish disabled-media acceptance from #30's open enabled proof.
- [ ] **Step 5: Record acceptance and commit the evidence.** Record the exact tested source/test revision, date, command/config, selected stack, result and any unperformed checks. Suggested message: `test: verify f7 reporting and record retirement evidence`. Only mark F7 rows passed when their assertions ran successfully. Keep #30, F8, #17/#7 and parent #10 obligations explicit; this task cannot close them.

**Done:** Dashboard and filtered History display accurate authorized package data through real reads, match the November references under the main plan’s presentation contract, and remain usable under empty/error/disabled-media conditions. Terminal detail is immutable. Upstream retirement is verified, remaining F7 consumers are removed and exact F7 acceptance evidence is recorded. F7 can complete using the disabled F2 milestone and existing contract operations/fixtures without waiting for every later UI producer or enabled-media qualification.
