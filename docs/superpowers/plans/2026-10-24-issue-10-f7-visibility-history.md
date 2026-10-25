# F7 — Operational Visibility and Retained History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout:** Use **ponytail:ponytail, full**. Read existing Events, activity and historical accounting; add no analytics platform, new ledger, charts or reconstructed historical data.

**Goal:** The Admin can understand upcoming work, recent activity and retained Events with accurate package-era and clearly labeled legacy totals.

**Architecture:** Add authorized read projections over existing records and keep historical accounting separate from current package operations. Each mutation owner records its audit; F7 displays it. Reuse F2 private media delivery and current page/shared UI structure.

**Tech Stack:** Existing Next.js/React/TypeScript, Temporal, Supabase read boundaries, UI components and Vitest/Playwright.

**Spec:** [Approved design, F7](../specs/2026-10-24-issue-10-functional-breakdown-design.md#f7-operational-visibility-and-retained-history). Parent #10; #9 prerequisite satisfied; additionally requires F2 and F3. [Index/shared rules](2026-10-24-issue-10-implementation-plan.md).

## Global Constraints

- #9 passed on reviewed candidate `2f89a96` and is closed; verify the index evidence and await plan approval/publication. Authenticated/private reads only; no contact/photo copies in activity or logs.
- Monthly Events counts nondeleted Draft, Live and Completed whose scheduled start falls in the current month in each Event's venue time zone; exclude Cancelled. Total Events booked also excludes Cancelled. Upcoming/Next use future scheduled starts of Draft/Live only. Never count by creation time. See [ADR-0028](../../adr/0028-define-monthly-event-count.md). Activity is newest first, **7/30-day filters**, **25 rows per page**, stable ID tie-breaker.
- History is Completed/Cancelled and read-only, including retained contact/media. Preserve labeled original legacy totals/corrections and already-deleted/redacted historical state. Never convert old individual prints into invented packages.
- Use [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md), [screen map](../../design/2026-10-21-package-recovery/screen-map.md), [01 dashboard](../../design/2026-10-21-package-recovery/admin/01-dashboard.png), [09 history](../../design/2026-10-21-package-recovery/admin/09-history.png) and read-only patterns in [05 detail/activity](../../design/2026-10-21-package-recovery/admin/05-live-event.png).

Follow the [shared command/environment table](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules). Update this capability’s rows in the [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) with actual revision/command/result before closure; pending rows are not passing evidence.

## Review Focus

1. UTC/venue month boundaries and DST cannot count by the wrong month — task 1.
2. Same-timestamp activity and page/filter changes cannot duplicate, skip or disclose contact data — task 1.
3. Empty results and failed reads must be distinct; zero cannot mask an error — tasks 1–2.
4. Legacy Wasted Film corrections and independent totals must remain historical, not become package-era refunds — task 2.
5. Terminal detail via a direct URL, expired media URL or revoked Admin cannot expose mutation controls/private data — task 2.

## File map and proposed read interfaces

Create `src/features/admin/dashboard/{read.ts,types.ts,dashboard.tsx,dashboard.module.css}`; modify `src/app/(admin)/dashboard/page.tsx`, `src/app/(admin)/history/page.tsx`, `src/app/(admin)/events/[eventId]/page.tsx`, `src/lib/events/history.ts`, `src/features/admin/operations/{read.ts,types.ts,panel.tsx}`. Reuse `src/components/shared/` and F2 media delivery. Create `tests/integration/dashboard-read.test.ts`, `tests/components/dashboard-history.test.tsx`, `tests/e2e/dashboard-history.spec.ts`; extend `tests/integration/admin-operations-read.test.ts`, `tests/components/admin-operations-pages.test.tsx`. Add a forward read index/projection migration only if required by the proven query, with no new product data source.

`readDashboard(input: {now: string; activityDays: 7 | 30; page: number}): Promise<DashboardReadResult>` in `dashboard/read.ts`; `now` is supplied by server code, not an authorization or arbitrary client clock. Result is `{status: 'success'; summary: {monthEvents: number; upcomingEvents: number; nextEvent: {id: string; title: string; startsAtUtc: string; timeZone: string} | null; totalBookedEvents: number}; activity: ActivityItem[]; hasNextPage: boolean}` or `{status: 'unavailable'; error: string}`. `ActivityItem = {id: string; eventId: string | null; operationKind: string; occurredAt: string}`; join only a safe display label when needed, not contact fields. History keeps `listHistory()`'s result convention and extends `HistoryEvent` with `accountingVersion: 1 | 2` and a matching `counts` variant; exact count variants come from F3/legacy reads below.

## Task 1: Complete Dashboard summaries and activity

**Files:** Dashboard files/tests and existing activity producers in F2/F3 as consumed interfaces. No new audit-writing responsibility moves into Dashboard.

- [ ] Write real read tests using fixed server time, Events around venue-local month boundaries, cancelled/deleted rows, >25 activities and tied timestamps. Assert the approved values:

  ```ts
  expect(result.activity).toHaveLength(25);
  expect(result.hasNextPage).toBe(true);
  expect(result.activity[0]).not.toHaveProperty('client_email');
  expect(result.summary.totalBookedEvents).toBe(nonCancelledCount);
  ```

  Use explicit fixture instants on either side of a venue's month boundary and assert month/upcoming/next separately. Add 7/30-day selection, malformed page/query defaults, unauthorized and database-error cases; a failed query returns unavailable, not successful zero.

- [ ] Add `monthly Events includes Draft Live Completed and excludes Cancelled` to `tests/integration/dashboard-read.test.ts` and its rendered-card assertion in `tests/e2e/dashboard-history.spec.ts` (trace F7-01). At fixed `now`, seed four in-month Events, one of each state; assert `monthEvents === 3` and `totalBookedEvents === 3`. A Completed Event still counts; cancelling the Draft reduces both to 2 without removing either Cancelled record from History. Add out-of-month and deleted-Draft controls that do not contribute. The card counts bookings, not just future or unfinished work.

- [ ] Run `npm test -- tests/integration/dashboard-read.test.ts tests/components/dashboard-history.test.tsx`; new read/view assertions should fail before implementation.
- [ ] Implement the defined read projection with current Admin authorization and stable `created_at DESC, id DESC` activity ordering. Apply time/filter/pagination predicates in the data query, read 26 rows to determine the next 25-row page, and use the existing Temporal/venue semantics for monthly counts. Exclude deleted/Cancelled Events from booked/month totals; Upcoming/Next consider future scheduled starts of Draft/Live Events, with start then ID ordering. The 7/30-day activity window is measured back from the server-supplied `now`; page numbering is zero-based. Query all qualifying Events without a silent Supabase default-row cap. Present summary, next/upcoming links, filters, persistent errors and contextual empty states with existing components. Display every required activity kind from #9/F2/F3/fixtures; an unknown retained historical kind receives a safe label rather than crashing.
- [ ] Rerun focused tests and `npx playwright test --config playwright.config.ts tests/e2e/dashboard-history.spec.ts`; verify actual read data, filter/page navigation, direct links, both themes and keyboard focus. Expected pass; no charts/revenue or Guest media.
- [ ] Commit with `feat: complete dashboard summaries and activity`.

## Task 2: Complete retained History and immutable Event detail

**Interfaces:** `listHistory()` returns terminal Events under Admin RLS. Package-era rows use `PackageCounts` from authoritative version-2 reads. Legacy detail uses a clearly separate `LegacyHistoryCounts = {originalPrintAllowance: number; additionalPrints: number; confirmedPrints: number; captures: number}` computed from preserved original records/corrections; it never calls a live mutation or invents packages. F2's Admin `EventMedia` delivery is reused for retained assets.

- [ ] Extend historical read and page tests with a v2 Completed Event, v1 terminal totals that are not multiples of ten, legacy Wasted Film evidence, previously redacted contact, deleted Draft tombstone and private retained media. Oracles:

  ```ts
  expect(legacy.accountingVersion).toBe(1);
  expect(legacy.counts.originalPrintAllowance).toBe(13);
  expect(legacy.client_email).toBeNull(); // previously erased; never reconstructed
  expect(
    screen.queryByRole('button', { name: /redact|delete event|add film packages/i })
  ).toBeNull();
  ```

  Assert actual original corrected totals and that direct terminal detail URLs remain read-only. Add expired URL renewal/current authorization denial and database error/empty states.

- [ ] Run `npm test -- tests/integration/admin-operations-read.test.ts tests/components/admin-operations-pages.test.tsx tests/components/dashboard-history.test.tsx`; new history cases identify any assumptions of live package data.
- [ ] Extend the History read model/list/detail with schedule/venue/contact, explicit version labels and retained media. Isolate the old calculation from F3's live counts without duplicating it. Never query private cutover snapshots with newly broadened grants when existing authorized historical rows suffice. Remove terminal redaction/delete/edit/reopen controls and callers; retain pending cleanup only for allowed Draft deletion, with any pre-cutover legacy cleanup handled in F8. Preserve private responses and authorization on direct links and media renewal.
- [ ] Run focused tests and `npx playwright test --config playwright.config.ts tests/e2e/dashboard-history.spec.ts`; run changed-file lint/type/format. Verify read-only history, legacy labels, no Guest photos, responsive tables/status and readable errors. Expected pass.
- [ ] Commit with `feat: complete retained event history`.

**Done:** Dashboard and History display accurate authorized data through real read queries and remain usable under empty/error/private-media conditions. Can complete after F3 using existing contract operations/fixtures for later activity types. F8 owns cutover preservation proof and final denial of all old redaction/deletion/stock writes; no reporting expansion belongs here.
