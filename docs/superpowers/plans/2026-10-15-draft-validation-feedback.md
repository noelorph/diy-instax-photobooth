# Draft Validation Feedback Implementation Plan

> **Historical plan — NOT AN ACTIVE WORK ORDER (superseded scope, 2026-10-21).** The [replacement contract](../specs/2026-10-21-package-accounting-booth-recovery-design.md) and current root documents govern new work. Package accounting, recovery, access lifecycle, test/quality/inventory controls and retention in this original text may conflict with the approved target. Preserve it as history; do not implement superseded instructions or infer a current pass from old checklists. Unchanged presentation/security details are carried into the active guides.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Draft Event field errors, `aria-invalid`, and the error summary accurate as the Admin edits after a failed save, while removing the duplicated form input conversion and Zod error mapping.

**Architecture:** Use the existing shared Draft parser for client feedback and server validation. Once a save has returned field errors, revalidate the whole current form on each edit so email, counts, venue time zone, and cross-field schedule rules stay in sync. Preserve server-only errors on untouched fields; the server and database remain authoritative on save.

**Tech Stack:** Next.js 16.4, React 19, React Hook Form 7, Zod 4, Temporal polyfill, TypeScript, Vitest, React Testing Library, Playwright.

**Spec:** [Draft Event management (implemented)](../specs/2026-10-13-draft-event-management-design.md), especially validation and accessible form feedback; [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md) invalid input and inline validation rules.

## Global Constraints

- Keep validation quiet before the first save attempt; after an invalid save, reflect current values on each edit.
- Show an error and `aria-invalid` while the current value is invalid; clear them when that condition is fixed. Keep the summary while any field error remains.
- Revalidate schedule fields together when start, end, or venue time zone changes. Reject ambiguous/nonexistent local times and end instants no later than start.
- Preserve entered values, server-only errors on untouched fields, stale-revision guidance, pending behavior, and saved confirmation semantics.
- Server actions and the database must continue rejecting malformed input and gated Event states. Do not add Event operations or dependencies.
- Read the relevant installed Next.js guide before writing code, per `AGENTS.md`.

## Review Focus

- A malformed email changed to another malformed email keeps visible field and summary feedback; Task 2 tests it.
- A start-time change that still leaves end before start keeps the end error; Task 2 tests it.
- A time-zone change that still leaves a DST gap or overlap keeps the local-time error; Task 2 tests it.
- A database-only error on an untouched field survives an unrelated edit and clears when its own field changes; Task 2 tests it.
- Missing, blank, or file-valued counts still fail after input conversion is shared; Task 1 tests it.

---

## File structure

- `src/features/admin/events/draft-event.schema.ts`: own FormData normalization, Zod error mapping, and the existing pure Draft parser. Export `DraftFieldErrors` here so browser code does not import a type from the server-only DAL.
- `src/features/admin/events/actions.ts`: use shared FormData normalization; retain the direct-action non-FormData guard.
- `src/lib/events/drafts.ts`: use shared Zod error mapping; keep authorization, state rejection, and database checks here.
- `src/features/admin/events/draft-form.tsx`: compute live form errors after an invalid save and merge them with untouched server-only errors.
- `tests/unit/draft-event.schema.test.ts`, `tests/components/draft-event-ui.test.tsx`, and `tests/e2e/draft-event.spec.ts`: protect the shared parser and visible feedback.

### Task 1: Share Draft form normalization and error mapping

**Files:** Modify `src/features/admin/events/draft-event.schema.ts`, `src/features/admin/events/actions.ts`, `src/lib/events/drafts.ts`, `src/features/admin/events/draft-form.tsx`, and `tests/unit/draft-event.schema.test.ts`.

**Interfaces:** Export `DraftFieldErrors`, `draftInputFromFormData(data: FormData): Record<string, unknown>`, `draftFieldErrors(error: ZodError): DraftFieldErrors`, and `validateDraftFormData(data: FormData): DraftFieldErrors` from `draft-event.schema.ts`. The normalization must treat missing, blank, and non-string counts as invalid, and preserve duplicate-state rejection for server actions. `validateDraftFormData` uses the existing parser and returns `{}` on success.

- [ ] **Step 1: Write failing unit tests** for missing/blank/file counts yielding field errors, zero counts remaining valid, duplicate state values not silently becoming Draft, and the first Zod issue per field being retained.
- [ ] **Step 2: Run `npx vitest run tests/unit/draft-event.schema.test.ts`** and confirm the new tests fail for missing exports or divergent conversion.
- [ ] **Step 3: Implement the four exports** and replace the client/server conversion and Zod mapping copies with them. Keep `validate(input: unknown)` in the DAL responsible for rejecting non-Draft state before the schema strips unknown keys.
- [ ] **Step 4: Run `npx vitest run tests/unit/draft-event.schema.test.ts tests/integration/draft-events-dal.test.ts tests/components/draft-event-ui.test.tsx`** and `npx tsc --noEmit`; confirm all pass.
- [ ] **Step 5: Commit** the shared-input change and its tests.

### Task 2: Keep live feedback truthful after a failed save

**Files:** Modify `src/features/admin/events/draft-form.tsx`, `tests/components/draft-event-ui.test.tsx`, and `tests/e2e/draft-event.spec.ts`.

**Interfaces:** After `state.status === 'invalid'`, an edit reads `new FormData(event.currentTarget)` and calls `validateDraftFormData`. Display current parser errors for all fields. Retain original server-only errors for fields that have not changed; replace an edited field's old error with its current parser error or clear it. Treat `startsAtLocal` as a dependency of `endsAtLocal`, and `timeZone` as a dependency of both schedule fields. Keep `state` and `expectedRevision` errors until another save or reload. Reset edit tracking and live errors at each submit.

- [ ] **Step 1: Write failing component tests** for invalid email → still-invalid email → valid email; end-before-start surviving one start edit and clearing after a valid edit; a DST gap persisting across two affected zones and clearing in an unambiguous zone; multiple errors retaining the summary until all are fixed; no errors before first save; and an untouched server-only field error surviving an unrelated edit.
- [ ] **Step 2: Run `npx vitest run tests/components/draft-event-ui.test.tsx`** and confirm the still-invalid and dependent-field assertions fail on the current code.
- [ ] **Step 3: Replace unconditional error deletion** with the current parser result merged with untouched server errors. Use field dependencies rather than comparing error-message strings. Keep validation and pending/success rendering in the existing form component.
- [ ] **Step 4: Run `npx vitest run tests/components/draft-event-ui.test.tsx`** and confirm every new assertion passes.
- [ ] **Step 5: Extend the existing Draft browser journey** to submit an invalid email, change it to another invalid value, confirm the error and `aria-invalid` remain, then correct it and confirm both clear without another submit. Assert the booking can still be saved.
- [ ] **Step 6: Run `npx playwright test tests/e2e/draft-event.spec.ts`** and confirm the compact and wide journeys pass.
- [ ] **Step 7: Commit** the feedback change and its regression tests.

## Final verification and review

- [ ] Run `npm run lint`, `npx tsc --noEmit`, `npm run format:check`, `npm test`, `npm run test:e2e`, and `npm run build` on the completed change.
- [ ] Review the diff against issue #14, the Draft spec, and `DESIGN_SYSTEM.md`; confirm no gated operation or data-boundary change was introduced.
- [ ] Keep hosted staging verification and post-gate Booth work listed as pending. Ask for a fresh QA review before claiming a clean issue #14 sign-off.
