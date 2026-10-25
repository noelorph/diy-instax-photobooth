# F3 — Booked Capacity and Additional Film Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout:** Use **ponytail:ponytail, full**. Reuse #9's counts, mutation and receipts. Do not create a second ledger, generic command framework or new stock model.

**Goal:** The Admin sees truthful booked capacity and can add whole packages exactly once, including after an ambiguous response.

**Architecture:** Replace the operational read model's legacy allowance/stock fields with #9's `PackageCounts`. Keep purchases in the existing Event operations feature, using the existing package endpoint and actor-scoped receipt lookup. F4/F5 consume the same counts; physical reload belongs to F6.

**Tech Stack:** Existing Next.js/React/TypeScript/Zod, Supabase contracts, Vitest/Playwright.

**Spec:** [Approved design, F3](../specs/2026-10-24-issue-10-functional-breakdown-design.md#f3-booked-print-capacity-and-additional-film-packages). Parent #10; #9 prerequisite satisfied; additionally requires F2. [Index/shared rules](2026-10-24-issue-10-implementation-plan.md).

**Published issue:** [#31](https://github.com/noelorph/diy-instax-photobooth/issues/31), native child of [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10). Native prerequisites: [#9](https://github.com/noelorph/diy-instax-photobooth/issues/9) (completed), [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30). Published and read-back verified 2026-10-25; implementation remains on hold.

## Global Constraints

- #9 passed on reviewed candidate `2f89a96` and is closed; verify the index evidence. The plan and GitHub publication are approved; implementation remains on hold pending a later user instruction and the capability prerequisites. No repairing #9 in this child.
- `totalBookedPrints = 10 × (originalPackages + additionalPackages)`; `printsRemaining = total − printed`; `printsAvailable = remaining − unresolved`. A pending attempt holds one print; never label remaining as available.
- Additional packages are positive whole units within the #9 aggregate maximum, with a nonblank Client-request note; immutable entries. Eligible while Event is Live, including Paused or after a Finished run. No package removal/refund, automatic Resume or physical-load claim.
- Use [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md), [screen map](../../design/2026-10-21-package-recovery/screen-map.md), [05 Live Event](../../design/2026-10-21-package-recovery/admin/05-live-event.png), [06 phone management](../../design/2026-10-21-package-recovery/admin/06-phone-management.png), [11 feedback](../../design/2026-10-21-package-recovery/admin/11-dialogs-feedback.png), and the capacity reference in [Booth 04](../../design/2026-10-21-package-recovery/booth/04-printer-and-capacity.png).

Follow the [shared command/environment table](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules). Update this capability’s rows in the [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) with actual revision/command/result before closure; pending rows are not passing evidence.

## Review Focus

1. Forty-nine Printed plus one unresolved from five packages means zero available — task 1.
2. Read failure must not display zero or stale data as confirmed current state — task 1.
3. Duplicate click or lost response must add once using the original key/payload — task 2.
4. Terminal Event, revoked Admin, blank note, fractional/overflow package input must fail without change — task 2.
5. Capacity added during pause/unknown print must preserve lifecycle and pending blockers — task 2; integrated Guest admission belongs to F5/F6.

## File map

Modify `src/features/admin/operations/{types.ts,read.ts,panel.tsx,panel.module.css}`, `src/app/(admin)/events/[eventId]/page.tsx`; reuse `src/lib/operations/{package-contract,package-state,package-validation}.ts` and `src/app/api/admin/events/[eventId]/{film-packages,booth/state,operations/[operationId]}/route.ts`. Extend `tests/components/admin-operations.test.tsx`, `tests/integration/admin-operations-read.test.ts`, `package-accounting.test.ts`, `package-http-access.test.ts`; create `tests/e2e/package-capacity.spec.ts`. No new database table or counter. Delete `src/app/api/admin/events/[eventId]/additional-prints/route.ts` and `src/app/api/admin/film-stock/{additions,reconciliations}/route.ts` after tracing imports and shared callers.

## Task 1: Replace operational allowance/stock reads with package counts

**Interfaces:** Preserve `getOperationalEvent(id: string, attemptsPage?: number)`'s success/not-found/unavailable result. Change its successful `OperationalEvent` to contain `counts: PackageCounts`, `runId: string | null`, `runState: RunState | null`, `revision`, booking display, captures and v2 attempts. Remove active `originalAllowance`, `additionalPrints`, `onHand`, stock reservations and usable-Test flags. Use `readPackageAdminState(await requireAdmin(), id)` for authoritative counts/state and authorized reads for the remaining display fields. F4/F6 extend this same model, not parallel projections.

- [ ] Extend read/component tests for package-era totals and failures. Reuse `packageCounts` as an oracle, while asserting integration reads use real server results:

  ```ts
  expect(packageCounts(5, 0, 49, 1)).toMatchObject({
    totalBookedPrints: 50,
    printed: 49,
    unresolved: 1,
    printsRemaining: 1,
    printsAvailable: 0,
  });
  ```

  Verify zero availability does not hide the pending print and a failed read shows a persistent retry state rather than invented totals.

- [ ] Run `npm test -- tests/integration/admin-operations-read.test.ts tests/components/admin-operations.test.tsx`; the new projection assertions should fail against the legacy consumer.
- [ ] Integrate #9 counts and update all callers/fixtures of `OperationalEvent` found with `rg`. Preserve pagination, current authorization and private responses. Remove active shared-stock/independent allowance UI. Delete legacy accounting computations and their stock/allowance reads; F7 consumes package counts only. Update shared callers and fixtures together; no legacy reader is retained.
- [ ] Rerun the task command plus `npm test -- tests/integration/package-accounting.test.ts`; expect pass and matching API/UI counts. No mutable client-side count approximation.
- [ ] Commit with `feat: show package capacity in event operations`.

## Task 2: Complete whole-package purchase and receipt recovery

**Interfaces:** Existing `POST /api/admin/events/{eventId}/film-packages` accepts `z.infer<typeof packageActionSchemas.addPackages>` = `{operationId: string; packages: number; clientRequestNote: string}`. Existing `GET /api/admin/events/{eventId}/operations/{operationId}` recovers the original receipt; then refresh `/booth/state`. Reuse `PackageOperationResult<PackageCounts & {entryId: string}>`; no `expectedRevision` is invented for this existing addition schema.

- [ ] Extend real operation tests and UI/browser tests for exact once, changed-payload conflict, all invalid inputs, revocation and Live/Paused/Finished-run eligibility. With `const f = await createPackageFixture(); f.seedRun('Paused');`, a fixed UUID and `{packages: 1, clientRequestNote: 'Client requested one more package'}`, assert:

  ```ts
  expect(first.data.receipt.result.totalBookedPrints).toBe(20);
  expect(replay.data.replayed).toBe(true);
  expect((await f.readAdmin()).data.counts.additionalPackages).toBe(1);
  ```

  Invoke `f.admin('add_packages', payload, key)` twice; always dispose the fixture. Add a browser case where the server commits but the response is dropped; the recovered receipt must produce one addition, not a new mutation.

- [ ] Run `npm test -- tests/integration/package-accounting.test.ts tests/integration/package-http-access.test.ts tests/components/admin-operations.test.tsx`; existing #9 cases pass and missing consumer recovery cases fail.
- [ ] Implement the Add Film Packages dialog and pending/error/receipt states in the existing panel. Generate one ID per deliberate purchase, freeze its submitted payload, retain only necessary pending purchase metadata across page reload and clear it after acknowledgement. Do not log the Client-request note. Unknown response blocks another submission until same-key replay/receipt resolves; a new edited purchase gets a new ID only after the first is settled. Refresh counts without changing run state, reload state or the unresolved hold. Delete individual Additional Prints and stock controls/callers, their dedicated HTTP routes, input schemas and obsolete success tests. Add stale-request denial checks. Record remaining shared SQL objects for F8 deletion; do not retain a denial-only compatibility endpoint.
- [ ] Rerun focused tests and `npx playwright test --config playwright.config.ts tests/e2e/package-capacity.spec.ts`; verify one real immutable entry/audit, phone-sized accessibility and no load/resume side effects. Run changed-file lint/type/format. Expected pass.
- [ ] Commit with `feat: complete additional film package purchases`.

**Done:** Real Admin purchase/count workflows pass independently of the not-yet-built Guest UI. F5 owns exhaustion → phone addition → fresh Guest admission; F6 proves additions cannot erase another blocker. Record the individual-print/shared-stock retirement trace for F8; no physical loading, outcome resolution or lifecycle transition belongs to this issue.
