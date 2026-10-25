# F5 — Guest Capture-to-Print Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout:** Use **ponytail:ponytail, full**. Extend F4's single Booth controller and #9's journal/dispatch implementation. Never replace their one-send protections with a simpler optimistic print flow.

**Goal:** A Guest can capture, review, Retake and receive one honestly completed simulated print, with no retained image or duplicate send.

**Architecture:** F4 owns run/access state; this issue adds normal Guest execution and immediate safe fault reactions to the same controller. F2 supplies private Event Media. Bind the explicitly selected acknowledged Capture to #9 reservation/dispatch and observe completion separately from transport acceptance. F6 later completes restoration, not the initial safety response.

**Tech Stack:** Existing React/TypeScript camera code, `PrinterAdapterV2`, `SimulatedPrinterV2`, metadata journal/dispatch helpers, Vitest and Playwright.

**Spec:** [Approved design, F5](../specs/2026-10-24-issue-10-functional-breakdown-design.md#f5-guest-capture-to-print-journey), [ADR-0026](../../adr/0026-order-captures-by-shutter-time.md), replacement contract sections 3–5. Parent #10; #9 prerequisite satisfied; additionally requires F2 and F4. [Index/shared rules](2026-10-24-issue-10-implementation-plan.md).

## Global Constraints

- #9 passed on reviewed candidate `2f89a96` and is closed; verify the index evidence and await plan approval/publication. Simulator is nonproduction; command acceptance is not full ejection or completion.
- Welcome → Start → mirrored preview → Take Photo → **3–2–1** → unmirrored matching crop/review → Retake or Print. **Print complete** lasts **3 seconds**, only after full ejection and server acknowledgement.
- Warn at **75 seconds**, discard/end at **90 seconds** in preview/review; Continue resets. No Guest inactivity timer during countdown/printing.
- Count completed shutters once, including Retakes. Latest acknowledged `captured_at` governs; equal timestamps permit the selected Capture. Reservation/dispatch recheck it without substitution. Preserve #9's two-minute bounded metadata-only terminal reconciliation.
- No image bytes/blob URLs/base64 in storage, requests, logs, telemetry, history, screenshots/traces or journal. Direct transport may hold bytes only until safe disposal. No automatic resend or old-photo retry after a fault.
- Use [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md), [screen map](../../design/2026-10-21-package-recovery/screen-map.md), [Booth 01](../../design/2026-10-21-package-recovery/booth/01-welcome-capture.png), [02](../../design/2026-10-21-package-recovery/booth/02-review-printing-complete.png), [04 capacity](../../design/2026-10-21-package-recovery/booth/04-printer-and-capacity.png), [05 stop states](../../design/2026-10-21-package-recovery/booth/05-pause-finish-access.png).

Follow the [shared command/environment table](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules). Update this capability’s rows in the [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) with actual revision/command/result before closure; pending rows are not passing evidence.

## Review Focus

1. Late/out-of-order and equal-time Capture acknowledgements cannot substitute the chosen photo — task 1.
2. Missing/corrupt journal, lost reservation/dispatch response and duplicate Print cannot send twice — task 2.
3. The final Reserved unit must dispatch even when available falls to zero — task 2.
4. Ejection without server acknowledgement and command acceptance without ejection never show completion — task 2.
5. Optional media failure, inactivity, stop/fault during shutter or transport preserve privacy and safe admission — tasks 1–3.

## File map and interfaces

Modify `src/features/booth/{flow.ts,booth-client.tsx,camera.ts,booth.module.css}`; reuse `src/features/qualification/image.ts` only for its tested crop/encoding utility, `src/features/booth/{print-journal,print-dispatch}.ts` and `printer/{contract-v2,simulator-v2}.ts`. Consume F2's `EventMedia` through `/api/booth/media`; do not add direct Booth database/storage access. Extend `tests/unit/{booth-flow,booth-camera,package-print-dispatch,package-print-journal}.test.ts`, `tests/components/booth-flow.test.tsx`, `tests/integration/{package-dispatch,package-late-capture}.test.ts`, `tests/e2e/{booth-simulator,admin-booth-simulator}.spec.ts` and F2's shared browser fixture. Update existing CSS, test camera and simulator consumers together.

Consume F4's corrected `BoothCamera.start(video, disconnected, permission: 'existing' | 'request'): Promise<void>`, `.capture(): Promise<Photo>`, `.stop(): void`; `Photo = {bytes: Uint8Array; url: string; discard: () => void}`. Normal Guest rendering/readiness uses `existing` and never prompts; the explicit setup/recovery gestures use F4's `request` path, with recovery wired by F6. Preserve those permission tests while extending camera/crop behavior. Extend F4's `BoothFlow` with the existing method names `start(): Promise<void>`, `countdown(): void`, `shutter(capture: () => Promise<Photo>): Promise<void>`, `retake(): void`, `print(): Promise<void>`, `timeout(): Promise<void>`, `welcome(): Promise<void>`; new public `reconcilePending(entries: readonly JournalEntry[]): Promise<'clear' | 'pending'>` is the shared boundary F6 extends. `View` is an in-memory render snapshot, never durable; its optional photo URL and every photo byte stay out of the journal.

## Task 1: Complete welcome, camera and acknowledged Capture selection

**Interfaces:** POST `/api/booth/sessions` uses `.startSession`; POST `/api/booth/captures` uses `.recordCapture = {operationId, sessionId, captureId, capturedAt}`; POST `/sessions/{sessionId}/end` uses `.endSession`. `BrowserBoothMetadataJournal` stores only its allowed `JournalEntry` union. F2's `EventMedia` supplies optional background/montage; F4 supplies current admission state.

- [ ] Extend controller/camera/component tests for montage priority, default/media load failure, muted/pause/reduced-motion presentation, mirrored preview versus unmirrored review, shutter count and selected Capture order. Use synthetic camera bytes and the existing simulator fixture; assert:

  ```ts
  expect(recordCaptureBodies).toHaveLength(2); // two completed shutters after Retake
  expect(reservationBody.captureId).toBe(selectedCaptureId);
  expect(recordCaptureBodies.every((body) => !('image' in body) && !('url' in body))).toBe(true);
  ```

  Include older/tied acknowledgement arriving late, truly newer acknowledgement arriving after reservation, pre-shutter cancellation and capture completion racing a stop. The latter journals metadata only within #9's existing exception.

- [ ] Run `npm test -- tests/unit/booth-flow.test.ts tests/unit/booth-camera.test.ts tests/components/booth-flow.test.tsx tests/integration/package-late-capture.test.ts`; existing #9 ordering tests pass; new integrated selection/media failures identify missing behavior.
- [ ] Implement welcome and Guest phases on F4's controller, reusing camera/crop code. Keep camera readiness independently observable on welcome while admitting Guests; do not claim readiness from a stopped stream or a stale permission flag. Stop camera when lifecycle/access requires it. Journal Capture IDs/timestamps before metadata submission, wait for acknowledgement before enabling Print, and retain the explicitly selected image only in memory. Retake disposes the previous image. Keep Start usable over moving media and on fallback; media failure is not a readiness blocker.
- [ ] Rerun focused tests and `npx playwright test --config playwright.booth.config.ts`; expect pass with synthetic images, no media/Guest-photo bytes sent to server, and readable controls in portrait/landscape.
- [ ] Commit with `feat: complete welcome and guest capture selection`.

## Task 2: Integrate one-send dispatch and truthful completion

**Interfaces:** Reuse `dispatchReservedAttempt(input: DispatchInput, deps: DispatchDependencies): Promise<void>` and `recordAndReportObservation(runId, observation, journal, report)`. Supply real `.reserve`, `.dispatch`, `.observe`, `.reconcile` HTTP operations from #9. `reconcilePending` reads original scoped receipts/current attempt and acknowledges journal entries only after confirmed commit; it never treats missing local entries or one missing receipt as proof of no send. `canSendNow` samples F4 stop/access and current equipment state immediately before transport.

- [ ] Extend the existing `rig()` in `package-print-dispatch.test.ts` and real controller/browser fixtures. Pin final-unit reservation, double click, same-session concurrent calls, journal failure, lost reserve/dispatch response, superseding Capture, stop at each awaited boundary and observation replay. Representative existing-helper assertions:

  ```ts
  await dispatchReservedAttempt(input, deps);
  expect(printer.commandCount).toBe(1);
  await expect(dispatchReservedAttempt(input, deps)).rejects.toThrow();
  expect(printer.commandCount).toBe(1);
  ```

  Separately assert acceptance leaves phase `printing`; ejection with a dropped server response leaves completion unconfirmed; only acknowledged Printed enters `confirmed` and exits after 3,000 ms. A five-package Event at 49 Printed plus its one Reserved hold can dispatch at zero available.

- [ ] Run `npm test -- tests/unit/package-print-dispatch.test.ts tests/unit/package-print-journal.test.ts tests/unit/booth-flow.test.ts tests/integration/package-dispatch.test.ts`; preserve all existing one-send regressions.
- [ ] Replace the legacy dispatch/observation path in `BoothFlow` with those helpers. Record observations through the metadata journal, preserve pending outcome/hold independently of Guest Session completion, and release image ownership exactly once when transport permits. Reconcile server state even with an empty/lost journal; close the old session before allowing a missing reservation receipt to be interpreted, so a late reserve cannot cross fresh admission. Unknown outcomes remain unavailable without resend. F6 extends this baseline reconciliation for complete recovery UI; safety is complete here.
- [ ] Rerun focused tests and both simulator browser configs. In the real Admin/Booth fixture verify exactly one Print Attempt/count, final-unit dispatch, response-loss receipt recovery and no false completion. Expect pass; simulator event controls stay test-only and nonproduction.
- [ ] Commit with `feat: integrate one send printing and confirmed completion`.

## Task 3: Complete inactivity, immediate fault stops and capacity recovery admission

**Interfaces:** Extend the same `View`/controller with warning state and immediate fault stop. Preserve `Photo.discard`, F4's persisted lifecycle and F3's refreshed `PackageCounts`; F6 receives the shared `reconcilePending` boundary and sanitized current attempt state, not image bytes.

- [ ] Add fake-clock assertions at 74,999/75,000/89,999/90,000 ms, Continue reset, no timeout during countdown/printing, stale camera callbacks and fault/stop during image encoding or an authorized transport. Oracle:

  ```ts
  await vi.advanceTimersByTimeAsync(75_000);
  expect(screen.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(discard).toHaveBeenCalledOnce();
  ```

  Add the named real two-device test `package addition after exhaustion admits a fresh Guest` in `tests/e2e/admin-booth-simulator.spec.ts` (trace F5-04): exhaust the booking, prove Start/session admission is denied, purchase one package on the phone, refresh readiness and click Start to create a **new persisted Guest Session**. Assert +10 capacity from the one purchase, new session identity and no old photo/Capture reuse; a welcome screen alone is insufficient. Add pause/pending-outcome variants that still prevent admission, with F6 owning combined-blocker restoration. Assert no old image, Capture or session is reused after fault/timeout.

- [ ] Run `npm test -- tests/unit/booth-flow.test.ts tests/components/booth-flow.test.tsx tests/unit/booth-camera.test.ts`; expect uncovered timer/fault assertions to fail before changes.
- [ ] Complete preview/review timers and safe stop at every phase. On fault discard/end unsent interaction; preserve independent pending attempts and in-flight transport buffers only until safe. Never resume the old review after repair. Remove legacy Guest exit/pause gestures, Wasted Film/quality-refund effects and independent stock/allowance consumers. Use exact PRD capacity/connection messages and accessible focus/status changes.
- [ ] Run focused tests, `npx playwright test --config playwright.booth.config.ts` and `npx playwright test --config playwright.admin-booth.config.ts`, then changed-file lint/type/format. Verify request/storage/log spies never contain synthetic photo bytes or blob URLs; screenshots, traces and video stay off for Guest journeys. Expected pass.
- [ ] Commit with `feat: complete guest timeouts and safe fault boundaries`.

**Done:** The normal journey and immediate safety reactions work through real #9 operations and the simulator, including exhaustion/addition. F6 owns restoration after failures; it must not be needed to prevent duplicate sends/data retention in F5. Record legacy Guest flow/stock/waste retirements for F8. No physical printer success or actual-iPad acceptance is claimed.
