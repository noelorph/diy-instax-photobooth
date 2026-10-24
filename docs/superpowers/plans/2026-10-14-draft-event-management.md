# Draft Event Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the sole Admin create, find, inspect, and edit persistent Draft Events without exposing operational Event or printing actions.

**Architecture:** The Admin access plan supplies the active-session predicate, RLS pattern, and AppShell. A pure validation module converts venue-local schedule input to UTC without guessing at DST transitions. A Draft-only table and server data-access functions enforce the same fields and use a revision for conflict detection. The Events UI consumes only those functions.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript, Supabase Postgres/RLS, Zod, React Hook Form, a pinned Temporal polyfill, Vitest, React Testing Library, Playwright.

**Spec:** [Draft Event management (implemented)](../specs/2026-10-13-draft-event-management-design.md)

## Global Constraints

- The Admin access and shell plan is the prerequisite; reuse its authorization predicate, server guard, and AppShell.
- Only Draft create, list, read, and edit are available. No delete, Live transition, Booth, media, stock, Test Print, reservation, or accounting mutation may be callable.
- Each Event owns its Client contact snapshot; there is no shared Client table.
- Film Package count and original Print Allowance are independent whole nonnegative counts; zero is allowed while Draft.
- Reject invalid IANA zones, nonexistent or ambiguous local times, and end instants no later than start. Store UTC instants and the venue time zone.
- A stale edit must report conflict, never silently overwrite a newer save.
- Local Supabase is the TDD target. Remote migrations follow separate staging-first promotion after the project environment is identified.
- Read the relevant installed Next.js guides before writing product or test code.

## Review Focus

- Blank values made only of whitespace must fail without partial inserts; Task 1 tests this.
- A schedule crossing a time-zone offset change must compare UTC instants, not wall-clock strings; Task 1 tests this.
- A direct state-changing request must fail even when the UI has no control for it; Task 2 tests RLS and constraints.
- A second device's stale edit must preserve the newer row and show a recoverable conflict; Tasks 3 and 4 test it.
- A malformed or unknown Event ID must not disclose Client details; Tasks 3 and 4 test it.

---

## File structure

- `supabase/`: a versioned `events` migration with Draft-only writes, constraints, RLS, and a revision column.
- `src/features/admin/events/draft-event.schema.ts`: form/server validation and venue-local-to-UTC conversion.
- `src/lib/events/drafts.ts`: protected create/list/read/update functions with no general Event-state mutation.
- `src/app/(admin)/events/`: Draft list, new form, and specific Draft page replacing the Events foundation placeholder.
- `src/features/admin/events/`: form, list, and detail components following `DESIGN_SYSTEM.md`.
- `tests/`: pure validation, database authorization/concurrency, component, and Playwright journey tests.

### Task 1: Draft input and schedule validation

**Files:** Create `src/features/admin/events/draft-event.schema.ts` and `tests/unit/draft-event.schema.test.ts`; add and lock Zod, React Hook Form, and a Temporal polyfill when implementation starts.

**Interfaces:** Export `parseDraftEventInput(input: unknown): ValidatedDraftEvent` and `DraftEventInput`/`ValidatedDraftEvent` types. The validated output contains trimmed identity/contact/venue text, whole nonnegative counts, a validated IANA zone, and `startsAtUtc`/`endsAtUtc` ISO instants. The form uses the same validation rules; the server always calls the parser again.

- [ ] Write failing tests for all required fields, invalid email, negative/fractional counts, zero counts, invalid zone, end-before-start, whitespace-only values, and UTC ordering across an offset change. Use `America/New_York` 2026-03-08 02:30 as a nonexistent time and 2026-11-01 01:30 as an ambiguous time; assert both are rejected with field-specific errors.
- [ ] Run the unit file and confirm failures before the parser exists.
- [ ] Implement local-to-UTC conversion with explicit DST `reject` disambiguation, not JavaScript's implicit local-time parsing. Preserve the chosen IANA zone in the output.
- [ ] Run the unit file and type check; commit the pure validation unit.

### Task 2: Draft-only storage and authorization

**Files:** Create a CLI-generated migration under `supabase/migrations/` and `tests/integration/draft-events-rls.test.ts`. Reuse the local Supabase setup from the Admin access plan.

**Interfaces:** `public.events` has an opaque UUID ID, `state='Draft'`, title, Event-specific Client name/email/phone, venue address/zone, UTC start/end, whole nonnegative package/allowance counts, and integer `revision` initially 1. Admin SELECT/INSERT/UPDATE policies use `private.is_active_admin()`; no client DELETE grant or policy exists. Constraints deny non-Draft state and invalid count/order values. An update trigger requires `NEW.revision = OLD.revision + 1`, so a direct stale update with its old revision cannot bypass the conflict contract.

- [ ] Write failing database tests for Admin create/read/update, independent Client snapshots, signed-out/non-Admin/revoked denial, no DELETE, no Live-state insert/update, invalid counts, end-before-start, and a direct stale-revision update. Exercise direct Data API requests as well as app code.
- [ ] Run the focused integration file and confirm failure before the table/policies exist.
- [ ] Create the migration with RLS, grants, constraints, and indexes for Draft list ordering. Do not add stock, print, or Booth tables in this task.
- [ ] Run the focused integration file and Supabase database advisors; commit the Draft data boundary.

### Task 3: Protected Draft data access and conflicts

**Files:** Create `src/lib/events/drafts.ts`, `tests/integration/draft-events-dal.test.ts`, and focused server actions for Draft saves.

**Interfaces:** Export `listDrafts()`, `getDraft(id: string)`, `createDraft(input: unknown)`, and `updateDraft(id: string, expectedRevision: number, input: unknown)`. All call `requireAdmin()` and use Task 1 validation. `updateDraft` succeeds only when ID, Draft state, and revision match, then increments revision; a mismatch returns a typed conflict with no write. Do not accept a client-supplied Event state.

- [ ] Write failing tests for create → read → update persistence, independent Client snapshots, invalid input with no partial write, unknown/malformed ID, direct non-Admin/revoked requests, and two-device stale revision conflict.
- [ ] Run the focused tests and confirm expected failure.
- [ ] Implement the narrow data functions/actions, preserving field errors and separating not-found, conflict, and transient failures without returning Client data to unauthorized callers.
- [ ] Run the focused tests and type check; commit the server API.

### Task 4: Draft list, form, and detail UI

**Files:** Replace `src/app/(admin)/events/page.tsx`; create `src/app/(admin)/events/new/page.tsx`, `src/app/(admin)/events/[eventId]/page.tsx`, components in `src/features/admin/events/`, `tests/components/draft-event-ui.test.tsx`, and `tests/e2e/draft-event.spec.ts`.

**Interfaces:** `/events` lists Drafts with an empty state and overdue state; `/events/new` saves a Draft; `/events/[eventId]` shows and edits its fields and current revision. Dashboard and History remain protected foundation pages. No operational button or endpoint is introduced.

- [ ] Write failing component/browser tests for create/list/view/edit persistence, local time-zone labels, zero counts shown as Draft, empty/overdue states, field errors, saved feedback only after commit, stale conflict with form values retained, unknown ID privacy, keyboard operation, and compact/wide 200% zoom.
- [ ] Run the focused tests and confirm failure before the pages exist.
- [ ] Implement the pages and components using shared Admin tokens, responsive form patterns, and the Task 3 actions. Keep Client details out of logs and activity data.
- [ ] Run component and Playwright journeys, type check, lint, and build; commit the Draft UI.

## Final verification and review

- [ ] Run the full lint, type check, unit/component, database integration, Playwright, and build checks on the combined Admin branch.
- [ ] Review the whole branch against both approved specs, issue #14, ADR-0017, and the gated-operation exclusions. Resolve important findings and rerun the affected checks.
- [ ] Record the remaining Booth/cross-device integration and hardware cases for #10/#17. Claim issue #14 complete only after the combined review and fresh verification pass.
