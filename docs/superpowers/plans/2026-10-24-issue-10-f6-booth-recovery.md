# F6 — Booth Recovery Across Devices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout:** Use **ponytail:ponytail, full**. Extend F4/F5's existing controller, journal and contracts. Keep equipment repair, outcome resolution and explicit Admin stop independent; do not add a recovery engine or automatic retries of photos.

**Goal:** Restore safe operation after equipment, connectivity, page or access failure without guessing an old outcome or losing a deliberate pause.

**Architecture:** Reconcile existing #9 receipts/attempts before new Guest admission. The Booth offers only Connect to Instax and Enable Camera; phone Admin handles physical reload and exceptional inspection. F4 supplies persisted lifecycle/replacement; F5 supplies safe stopping and the one-send boundary.

**Tech Stack:** Existing React/TypeScript controller, Supabase HTTP contracts, version-2 simulator/journal and Vitest/Playwright.

**Spec:** [Approved design, F6](../specs/2026-10-24-issue-10-functional-breakdown-design.md#f6-booth-recovery-across-devices), replacement contract section 4. Parent #10; #9 prerequisite satisfied; additionally requires F3, F4 and F5. [Index/shared rules](2026-10-24-issue-10-implementation-plan.md).

**Published issue:** [#34](https://github.com/noelorph/diy-instax-photobooth/issues/34), native child of [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10). Prerequisites published 2026-10-25 (historical): [#9](https://github.com/noelorph/diy-instax-photobooth/issues/9) (completed), [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31), [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32), [F5 #33](https://github.com/noelorph/diy-instax-photobooth/issues/33). Published and read-back verified 2026-10-25. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure.

## Global Constraints

- #9 passed on reviewed candidate `2f89a96` and is closed; verify the index evidence. The plan and GitHub publication are approved; F3–F8 may use the verified upload-disabled F2 milestone under ADR-0032 without waiting for full #30 closure; other capability prerequisites still apply. #30 remains in #10 and is completed last. Nonproduction simulation only; #17/#7 remain physical gates.
- Unknown print retains its hold and printer slot. No timeout, reload, package addition or missing journal clears it. Not printed inspection requires no ejection and no possible later output from the old job; full ejection counts Printed even if unusable.
- Restore every blocker independently. A valid grant survives normal fault/pause; no ordinary sign-in/local takeover. Replacement stays Paused; Finishing/Finished cannot be replaced or resumed.
- Dynamic readiness expires at 5,000 ms; visible polling/reporting every 2,000 ms plus focus/reconnect refresh. No old-photo retry, resend or printer-count inventory.
- Use [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md), [screen map](../../design/2026-10-21-package-recovery/screen-map.md), [07 phone recovery](../../design/2026-10-21-package-recovery/admin/07-phone-recovery.png), [06 management](../../design/2026-10-21-package-recovery/admin/06-phone-management.png), [11 feedback](../../design/2026-10-21-package-recovery/admin/11-dialogs-feedback.png), [Booth 03](../../design/2026-10-21-package-recovery/booth/03-connection-recovery.png), [04](../../design/2026-10-21-package-recovery/booth/04-printer-and-capacity.png), [05](../../design/2026-10-21-package-recovery/booth/05-pause-finish-access.png), and [paired-device journey](../../design/2026-10-21-package-recovery/journeys/01-ipad-phone-recovery.png).

Follow the [shared command/environment table](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules). Update this capability’s rows in the [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) with actual revision/command/result before closure; pending rows are not passing evidence.

**Complete removal:** [ADR-0029](../../adr/0029-remove-legacy-features-and-reset-development-schema.md) applies. Delete this capability's obsolete UI, actions, routes, validation, helpers, exports and success fixtures/tests as their current flows become ready; update every shared caller. Retain no legacy reader, denial-only route or version-1 fallback. Record shared SQL dependencies for F8's package-only baseline. Reuse #9's current contracts and safety tests; do not redesign them.

## Review Focus

1. Missing reservation receipt while its request is still in flight cannot authorize a fresh Guest — task 1.
2. Clearing Bluetooth while camera is down/Booth Paused cannot show ready welcome — task 2.
3. Enable Camera can request permission while passive checks cannot; denial preserves the blocker, and camera loss during printing does not prevent settlement or release transport bytes early — tasks 1–2.
4. Physical reload or attempted Not printed inspection cannot clear a job still capable of output — task 2.
5. Revoked/expired proof and replacement racing Finish cannot create a second run or restore Guest authority — task 3.

## File map and interfaces

Modify `src/features/booth/{flow.ts,booth-client.tsx,booth.module.css}`, `src/features/admin/operations/{types.ts,read.ts,panel.tsx,panel.module.css}`; create `src/features/admin/operations/booth-recovery.tsx` for phone recovery controls. Reuse F4 setup/handoff and its corrected `src/features/booth/camera.ts`, plus F5 `reconcilePending(entries: readonly JournalEntry[]): Promise<'clear' | 'pending'>`, `Photo.discard`, journal and observation helpers. Extend tests in `tests/unit/{booth-flow,package-print-dispatch,package-print-journal}.test.ts`, `tests/components/{booth-flow,admin-operations}.test.tsx`, `tests/integration/{package-readiness,package-outcomes,package-grants,package-http-access}.test.ts`, `tests/e2e/{booth-simulator,admin-booth-simulator}.spec.ts` and F2's shared browser fixture; retain `tests/unit/booth-camera.test.ts` as the shared permission-boundary regression.

`BoothRecovery({event, onCommitted}: {event: OperationalEvent; onCommitted: () => void})` consumes the F3/F4 read model extended with #9 `reloadRequests`, readiness/blockers and allowed actions. Keep those wire values intact. Extend F4's existing `BoothFlow.connectPrinter(): Promise<void>` for recovery; retain its initial-arrival behavior. The shared local Enable Camera handler in `BoothClient` calls F4's corrected `BoothCamera.start(video, disconnected, 'request')` directly from the permitted user gesture, then F4's `reportEquipment(observation)` only with actual current camera state. Passive rendering/polling uses `existing` and never requests permission. Do not restore the inherited blanket `permission.state !== 'granted'` restriction or add another camera helper. No local action may add packages, inspect output or change lifecycle.

## Task 1: Complete receipt/server reconciliation after fault or reload

**Interfaces:** Existing GET `/api/booth/operations/{operationId}` and `/state`; POST `/sessions/{sessionId}/end`, `/print-attempts/{attemptId}/reconcile` and `/observations`. F5's reconciliation boundary returns clear only after authority, old-session closure and server attempt state establish safety. No photo or grant secret is added to the journal.

- [ ] Extend controller/integration/browser cases for lost Capture/reservation/dispatch/observation responses, corrupt or missing journal, page reload before/after authorization, late reservation crossing session end and delayed outcome acknowledgement. Using the existing simulator/journal fixture:

  ```ts
  expect(await flow.reconcilePending([])).toBe('pending');
  expect(printer.commandCount).toBe(1);
  expect(flow.getSnapshot().phase).not.toBe('welcome');
  ```

  The server fixture must hold an unresolved possibly delivered attempt. Also prove a Reserved attempt settles NotPrinted only when the server establishes dispatch never committed. End-session and dispatch races must serialize through #9, not local timing assumptions.

- [ ] Run `npm test -- tests/unit/booth-flow.test.ts tests/unit/package-print-journal.test.ts tests/unit/package-print-dispatch.test.ts tests/integration/package-outcomes.test.ts`; existing protections pass, uncovered recovery sequences fail.
- [ ] Complete F5's reconciliation loop: recover original receipts, close the previous session, query authoritative pending attempt, replay only metadata/observations with the same IDs, and clear acknowledged local entries when no longer needed. A missing receipt alone is not clear; delay fresh admission until late work is barred and server state confirms it. Release photos independently of slower network reconciliation. Unknown printer acceptance/output remains pending without resend; contradictions preserve #9's discrepancy blocker/audit.
- [ ] Rerun focused tests and `npx playwright test --config playwright.booth.config.ts`; expect safe reload results and zero duplicate sends. Check persisted/sessionStorage data contains allowed metadata only.
- [ ] Commit with `feat: reconcile interrupted booth work safely`.

## Task 2: Complete independent equipment repair, reload and inspection

**Interfaces:** POST `/api/booth/readiness` uses `.reportReadiness`, including `kind: 'connection_changed'` and the current generation when applicable. Phone POST `/api/admin/events/{eventId}/reload-requests` and `/reload-confirmations` use `.requestReload`/`.confirmReload`. POST `/api/admin/print-attempts/{attemptId}/resolve` uses `.resolveAttempt = {operationId, expectedRevision, outcome: 'printed' | 'not_printed', inspectionReason, oldJobCleared}`. Use exact schemas/receipt reads; the device cannot submit inspected outcomes.

- [ ] Pin every PRD failure-matrix row and combinations: Bluetooth+camera, known offline versus server failure, no-film versus exhausted booked capacity, camera loss during pending print, reload with unknown outcome, old generation/episode confirmation, inspection without reason/clearance, and conflicting reliable outcome/inspection. Core oracles:

  ```ts
  expect(afterReload.counts).toEqual(beforeReload.counts);
  expect(afterReload.pendingAttemptId).toBe(beforeReload.pendingAttemptId);
  expect(afterReconnect.state).toBe('Paused');
  expect(afterReconnect.blockers).toContain('camera');
  ```

  Add Printed-with-unusable-image counting once and NotPrinted rejection when the old job can still eject. All mutation tests include origin, revoked Admin, duplicate and lost-response cases using existing #9 coverage where sufficient.

- [ ] Add Enable Camera integration/component cases starting in `prompt`, with an unavailable/rejected permission query, and after browser denial. Assert only the explicit click requests media, denial leaves the action/blocker available, and success clears camera readiness only after a live feed. Exercise this while Paused and while an old print is unresolved: permission success must preserve both states. Retain F4's late-stream cleanup tests and its browser case without pregranted camera permission; pregranted happy paths alone cannot close this task.
- [ ] Run `npm test -- tests/unit/booth-camera.test.ts tests/integration/package-readiness.test.ts tests/integration/package-outcomes.test.ts tests/integration/package-http-access.test.ts tests/components/admin-operations.test.tsx tests/components/booth-flow.test.tsx`.
- [ ] Implement limited local Connect to Instax / Enable Camera controls from server allowed actions while preserving stop state and other blockers. Reconnect the expected printer, report the new generation and verify fresh readiness; same-printer reconnection does not invent a fresh physical load. Show exact PRD messages for known Wi-Fi loss versus other connection failure. Add phone reload-request/confirmation and exceptional inspection with required reason/old-job safety confirmation. Preserve stable IDs and receipt recovery; unknown outcomes are a separate action from loading film or buying packages. A camera fault during printing blocks the next Guest while existing observation/settlement continues.
- [ ] Rerun focused tests and `npx playwright test --config playwright.admin-booth.config.ts`; exercise independent repair orders and two-device operations through real HTTP/database contracts. Expect pass and no automatic Resume or inspection prompt for an already reliably known outcome.
- [ ] Commit with `feat: complete phone and booth equipment recovery`.

## Task 3: Complete exceptional access recovery and combined-device acceptance

**Interfaces:** Phone POST `/api/admin/print-attempts/{attemptId}/recover` uses `.recoverAttempt = {operationId, expectedRevision, reason}` when device proof is lost. Then F4's `recover-access`/issue/confirm path restores same-run access into Paused. F4 owns the transition implementation; F6 owns detecting access loss and invoking it only after reconciliation.

- [ ] Add real two-context cases for expired/revoked/missing grant, lost journal, phone recovery of proven-unsent reservation, possible delivery requiring resolution, replacement before/after Finish, pause followed by Bluetooth failure/reconnect, and package purchase with another blocker still present. Assert:

  ```ts
  expect(recoveredRun.id).toBe(originalRun.id);
  expect(recoveredRun.state).toBe('Paused');
  await expect(boothPage.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
  ```

  Name the purchase/blocker regression `package addition preserves pause and independent blockers` (trace F6-03); assert a real session request remains denied after purchase and after only one fault clears. Then explicitly Resume from phone after every blocker clears and verify a fresh welcome/session without the old photo. Finishing/Finished cases must refuse replacement. F5-04 remains the owner of ordinary exhaustion-to-purchase-to-new-Guest acceptance.

- [ ] Run `npm test -- tests/integration/package-grants.test.ts tests/integration/package-http-access.test.ts tests/unit/booth-flow.test.ts tests/components/booth-flow.test.tsx`; add no parallel grant implementation to make these tests pass.
- [ ] Connect the protected sign-in/setup return from F1/F4, retaining neutral access-loss copy and correct dark presentation. Keep normal faults inside `/booth`. Remove remaining legacy local takeover, reconnect revocation, Wasted Film and same-photo recovery consumers; document every affected caller/test/route for F8.
- [ ] Run both simulator browser configs plus task tests and changed-file lint/type/format. Compare the complete paired-device journey and all PRD matrix rows, including keyboard/focus/status and 200% zoom. Expected pass; record the revision and scenarios, not hardware claims.
- [ ] Commit with `feat: complete exceptional booth access recovery`.

**Done:** Restoration passes for each fault and overlapping faults, while counts, pending holds, explicit stops, access scope and image privacy remain correct. F8 verifies the combined application and coordinated retirement; physical old-job clearing/automatic ejection remain #17 evidence obligations.
