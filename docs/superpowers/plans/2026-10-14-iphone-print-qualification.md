# iPhone Print Qualification Implementation Plan

**Historical plan:** Its pre-build gate timing was superseded by [ADR-0021](../../adr/0021-move-print-qualification-to-integration-checkpoint.md). Use the [current issue #17 trial report](../../qualification/issue-17-trial-report.md) for actual evidence and film state. This plan is not a current instruction to keep integrated development blocked or to repeat completed harness work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run the isolated iPhone 15 Plus qualification harness for issue #17, then record a pass or fail against physical Mini Link 3 output.

**Architecture:** A development-only Next.js page hosts a browser-only camera and Web Bluetooth trial. Focused modules handle Instax packet framing, BLE exchange, image encoding, print command delivery, local attempt state, and non-photo evidence; no product database or Admin flow is involved. The operator marks observed ejection for trial accounting, while raw printer responses are retained for the separate gate decision about reliable automatic ejection feedback.

**Tech Stack:** Next.js 16.4 App Router, React 19.3, TypeScript, browser camera/Canvas/Web Bluetooth APIs, Vitest, React Testing Library, local HTTPS via the existing `npm run dev:https` command.

**Spec:** [Approved iPhone print qualification design](../specs/2026-10-13-iphone-print-qualification-design.md); [issue #17](https://github.com/noelorph/diy-instax-photobooth/issues/17).

## Global Constraints

- The iPhone is a development/test device; the iPad A16 remains the sole first-release booth and retains its separate launch gate.
- The harness is supervised and isolated. It creates no Event, Guest Session, Test Print, Print Attempt, reservation, stock entry, Booth Access Grant, or Supabase record.
- Guest photos remain in browser memory and go directly to the printer. Logs and exports contain no photo bytes or Guest identity.
- A command acknowledgement or Film Remaining change alone never means film ejected. Ambiguous post-command outcomes block further printing and never trigger an automatic resend.
- The local allowance starts at three qualification prints; Retake consumes none. Only an operator-observed physical ejection advances it during this trial.
- An operator's observation advances only the trial counter; it cannot by itself pass the printer-feedback criterion. The gate still needs a reproducible printer signal or sequence correlated with physical ejection.
- Pairing and camera/Bluetooth permissions happen during operator setup. The compact trial flow keeps Capture, Retake, review crop, and Print usable in Bluefy under Guided Access.
- All printer constants below are **trial hypotheses** from the [earlier source](https://github.com/noelorph/diy-souvenir-spot-photobooth/tree/95990570b013a37aefb127f9a8ec64a90bbfab7f/src/lib/instax), not evidence of reliable ejection or iPad support. Never port its Film Remaining based `confirmed` state.
- Read the relevant local Next.js docs in `node_modules/next/dist/docs/` before changing App Router code, as `AGENTS.md` requires. This plan was prepared against the local page, `use client`, and Vitest guides.

## Review Focus

1. Bluefy lacks `navigator.bluetooth` or denies pairing: setup remains blocked with a retryable message; Task 6 tests it.
2. Camera permission is denied or the stream ends: the trial cannot show a stale preview or enable Capture; Task 6 tests it.
3. Print is tapped twice or the browser reloads after a command may have been sent: no duplicate command occurs and operator reconciliation is required; Task 5 tests it.
4. Printer disconnects after `PRINT_IMAGE` begins: the outcome is uncertain even if the command promise rejects; Tasks 4 and 5 test it.
5. A malformed, progressive, oversized, or wrong-size JPEG reaches the printer boundary: reject it before any print command; Tasks 3 and 4 test it.

## File map

| File                                                                   | Responsibility                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/features/qualification/instax/protocol.ts`                        | Packet constants, encoding, response parsing and stream reassembly.                                   |
| `src/features/qualification/instax/bluetooth.ts`                       | Web Bluetooth pairing, model/firmware reads, serialized exchanges and all response observations.      |
| `src/features/qualification/instax/session.ts`                         | Safe preflight, JPEG upload, one print command, and bounded post-command status sampling.             |
| `src/features/qualification/image.ts`                                  | Portrait crop math, unmirrored Canvas capture, 600 × 800 JPEG validation, and preview URL lifecycle.  |
| `src/features/qualification/trial-log.ts`                              | Typed non-photo timestamps and JSON export.                                                           |
| `src/features/qualification/trial.ts`                                  | Three-print local allowance, single-flight attempts, uncertain lock and reload reconciliation marker. |
| `src/features/qualification/QualificationClient.tsx` and `.module.css` | Operator setup, compact Guest trial, camera lifecycle and truthful status UI.                         |
| `src/app/qualification/iphone-print/page.tsx`                          | Development-only route; production returns `notFound()`.                                              |
| `src/app/layout.tsx` and `src/styles/globals.css`                      | Load DM Sans and provide the design system's shared font fallback.                                    |
| `docs/qualification/issue-17-runbook.md`                               | Physical trial order, observation sheet and gate review checklist.                                    |

Each TypeScript module gets a colocated `.test.ts` or `.test.tsx` file where the task below names one. Use the current Vitest configuration; add no runtime dependency for the trial unless a concrete browser or protocol problem requires it.

---

### Task 1: Instax packet framing

**Files:** Create `src/features/qualification/instax/protocol.ts` and `protocol.test.ts`.

**Interfaces:** Produces `InstaxOpcode`, `InstaxResponse`, `INSTAX_BLE_UUIDS`, `INSTAX_OPCODES`, `buildRequest(opcode: InstaxOpcode, payload?: Uint8Array): Uint8Array`, `parseResponse(packet: Uint8Array): InstaxResponse`, and `InstaxResponseStream.push(chunk: Uint8Array): InstaxResponse[]` for Tasks 2 and 4.

- [ ] **Write failing packet tests.** Assert request magic `41 62`, big-endian length/opcode and checksum; accept a split response; reject bad magic, length, checksum, and an impossible declared length. Use the historical protocol source only for the trial values: service UUID `70954782-2d83-473d-9e5f-81e1d02d5273`, write `70954783-2d83-473d-9e5f-81e1d02d5273`, notify `70954784-2d83-473d-9e5f-81e1d02d5273`; opcodes `0000`, `0002`, `1000`, `1001`, `1002`, `1080`; 900-byte image payload chunks. Include a `responseFrame()` fixture in the test file:

  ```ts
  it('reassembles split responses', () => {
    const stream = new InstaxResponseStream();
    const packet = responseFrame(INSTAX_OPCODES.handshake, [0]);
    expect(stream.push(packet.subarray(0, 3))).toEqual([]);
    expect(stream.push(packet.subarray(3))).toEqual([
      { opcode: INSTAX_OPCODES.handshake, payload: new Uint8Array([0]) },
    ]);
  });
  ```

- [ ] **Run** `npm test -- src/features/qualification/instax/protocol.test.ts`; expect failures from missing exports.
- [ ] **Implement** the named functions and stream, including bounds checks before allocation. Keep packet payloads out of any logger.
- [ ] **Run** the focused test; expect all packet cases to pass.
- [ ] **Commit** `protocol.ts` and its test as `feat: add qualification Instax packet framing`.

### Task 2: Observable Web Bluetooth connection

**Files:** Create `src/features/qualification/instax/bluetooth.ts` and `bluetooth.test.ts`.

**Interfaces:** Consumes Task 1. Produces `PrinterConnection` with `modelNumber: string`, `firmwareRevision: string`, `exchange(opcode: InstaxOpcode, payload?: Uint8Array, timeoutMs?: number): Promise<InstaxResponse>`, and `disconnect(): Promise<void>`; `connectMiniLink3(bluetooth: WebBluetoothPort, callbacks: { onResponse(response: InstaxResponse): void; onDisconnect(): void }): Promise<PrinterConnection>`. Define narrow `WebBluetoothPort` and GATT types in this file rather than adding a package.

- [ ] **Write failing fake-GATT tests.** A matching `FI033` device with sequential Device Information reads connects and exposes firmware; a different model fails before print-service use; split notifications resolve exactly one pending exchange; unsolicited responses still reach `onResponse`; disconnect rejects a pending exchange and fires `onDisconnect`. Assert a second concurrent exchange is rejected. Name the cases `connectsAndReadsFirmware`, `rejectsWrongModel`, `reassemblesNotifications`, `reportsUnsolicitedResponse`, `rejectsConcurrentExchange`, and `abortsOnDisconnect`; for the last case assert:

  ```ts
  await expect(pendingExchange).rejects.toThrow('disconnected');
  expect(onDisconnect).toHaveBeenCalledTimes(1);
  ```

- [ ] **Run** `npm test -- src/features/qualification/instax/bluetooth.test.ts`; expect failures from missing connection behavior.
- [ ] **Implement** device selection by `INSTAX-` name prefix, required print service and Device Information service, notification startup, 182-byte BLE write slices, serialized exchanges, response timeouts, and cleanup. Use write without response when supported, otherwise write with response; fail setup if neither is supported. The `onResponse` callback receives parsed printer responses, including unsolicited ones; it never receives outbound JPEG packets.
- [ ] **Run** the focused test and `npx tsc --noEmit`; expect both to pass.
- [ ] **Commit** the connection module and test as `feat: observe Mini Link 3 Bluetooth responses`.

### Task 3: Printable image

**Files:** Create `src/features/qualification/image.ts` and `image.test.ts`.

**Interfaces:** Produces `coverCrop(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): Crop`, `capturePrintableFrame(video: HTMLVideoElement): Promise<{ jpeg: Uint8Array; previewUrl: string }>`, `revokePreview(url: string): void`, and `validateTrialJpeg(jpeg: Uint8Array): void` for Tasks 4 and 6.

- [ ] **Write failing image tests.** Assert center-cover crop for landscape and portrait sources, rejection of zero dimensions, and JPEG rejection for progressive SOF, wrong dimensions, missing markers, and over 55,000 bytes. The trial encoder targets unmirrored 600 × 800 baseline JPEG; preview uses the same Canvas pixels sent to the printer. Name the tests `centersLandscapeCrop`, `rejectsZeroDimensions`, `rejectsProgressiveJpeg`, `rejectsWrongSize`, and `rejectsOversize`; for a 1600 × 900 source assert `coverCrop(1600, 900, 600, 800)` returns `{ x: 462.5, y: 0, width: 675, height: 900 }`.

  ```ts
  expect(coverCrop(1600, 900, 600, 800)).toEqual({ x: 462.5, y: 0, width: 675, height: 900 });
  expect(() => validateTrialJpeg(progressiveFixture)).toThrow('baseline');
  ```

- [ ] **Run** `npm test -- src/features/qualification/image.test.ts`; expect failures from missing functions.
- [ ] **Implement** crop/Canvas encoding and JPEG validation in `image.ts`. The preview URL must display the same Canvas pixels used for the print JPEG.
- [ ] **Run** the focused test and `npx tsc --noEmit`; expect both to pass. Verify an actual browser-generated JPEG in the later device dry run because jsdom has no real camera/Canvas encoder.
- [ ] **Commit** these two files as `feat: prepare qualification print image`.

### Task 4: Safe print command

**Files:** Create `src/features/qualification/instax/session.ts` and `session.test.ts`.

**Interfaces:** Consumes `PrinterConnection`, Task 1 opcodes, and `validateTrialJpeg` from Task 3. Produces `preflightPrinter(connection: PrinterConnection): Promise<{ filmRemaining: number }>`, `sendTrialPrint(connection: PrinterConnection, jpeg: Uint8Array, onPhase: (phase: PrintPhase) => void): Promise<SendResult>`, and `startStatusObservation(connection: PrinterConnection, onStatus: (response: InstaxResponse) => void, onError: (error: Error) => void): () => void`. Define `PrintPhase` as `preflight | uploading | command-sent | command-acknowledged`; define `SendResult` as `{ kind: 'accepted' } | { kind: 'rejected-before-command'; message: string } | { kind: 'uncertain'; message: string }`. It never says `confirmed`.

- [ ] **Write failing fake-connection tests.** Preflight accepts 600 × 800 image support and nonzero film; upload sends `downloadStart`, 900-byte `downloadData` payloads, then `downloadEnd`, then one `printImage`; a failure before `printImage` is `rejected-before-command`; any failure or disconnect after `printImage` starts is `uncertain`; an acknowledged print is only `accepted`. Name the tests `preflightChecksImageAndFilm`, `uploadsThenPrintsOnce`, `rejectsBeforeCommand`, `disconnectAfterCommandIsUncertain`, `ackIsNotEjection`, and `statusObservationDoesNotConfirm`. The last test uses fake timers to assert status queries every two seconds for at most 60 seconds, callbacks contain the raw status responses, and no ejection outcome is emitted.

  ```ts
  expect(await sendTrialPrint(connection, validJpeg, onPhase)).toEqual({ kind: 'accepted' });
  expect(opcodes.filter((opcode) => opcode === INSTAX_OPCODES.printImage)).toHaveLength(1);
  expect(phases).not.toContain('ejected');
  ```

- [ ] **Run** `npm test -- src/features/qualification/instax/session.test.ts`; expect failures from missing functions.
- [ ] **Implement** preflight/upload/command in `session.ts`. Trial hypotheses from the earlier source: attempt handshake `0x0000` but proceed after its failure only if support info succeeds; use support info selector `0x00` for 600 × 800 capability and `0x02` for printer status, 50 ms between image chunks, and 1,000 ms between download end and print command. Emit each phase through `onPhase` so Task 5 can timestamp it.
- [ ] **Implement** `startStatusObservation`: after acknowledgement, make serialized status queries every two seconds for at most 60 seconds, stopping when the returned cancellation function is called. Pass raw inbound status responses to `onStatus`; report query errors without declaring success. Neither status sampling nor Film Remaining may produce a confirmed outcome.
- [ ] **Run** the focused test and `npx tsc --noEmit`; expect both to pass.
- [ ] **Commit** these two files as `feat: send supervised Mini Link 3 print command`.

### Task 5: Non-photo evidence and local attempt state

**Files:** Create `src/features/qualification/trial-log.ts`, `trial-log.test.ts`, `src/features/qualification/trial.ts`, and `trial.test.ts`.

**Interfaces:** Consumes `SendResult` from Task 4. Produces `createTrialLog(clock: { now(): number; iso(): string }): TrialLog` with `record(event: TrialEventInput): TrialEvent` and `exportJson(): string`; `createTrialController(printer: { send(jpeg: Uint8Array): Promise<SendResult> }, log: TrialLog, storage: Storage): TrialController` with `startPrint(jpeg: Uint8Array): Promise<void>`, `observeEjection(observedAt: string): void`, `markUncertain(reason: string): void`, `beginNewRun(physicalSheetsChecked: boolean): void`, and `getState(): TrialState`. `TrialState` exposes `remaining: number`, `phase: 'ready' | 'sending' | 'awaiting-observation' | 'uncertain' | 'exhausted'`, and `needsReconciliation: boolean`.

- [ ] **Write failing log tests.** Assert run/attempt IDs, ISO and elapsed timestamps, ordered export, and a fixed allowlist of event fields (`kind`, `opcode`, `statusByte`, `filmRemaining`, `responseHex`, `message`, `attemptId`); passing a `jpeg`, `photo`, or arbitrary payload field cannot appear in JSON. `responseHex` is bounded to 128 bytes of **inbound printer status/unsolicited response**, never an outbound image-transfer payload. Name the test `exportsOnlyAllowedMetadata`; assert `exportJson()` lacks the strings `jpeg`, `photo`, and the test's sentinel image bytes.
- [ ] **Write failing controller tests.** Initial allowance is three; duplicate `startPrint` calls send once; acknowledgement stays pending until `observeEjection`; duplicate ejection observations decrement once; three observed ejections exhaust allowance; pre-command rejection releases the attempt without decrement; post-command uncertainty or disconnect blocks another print. Before issuing a command, persist a non-photo unresolved marker in `localStorage`; after a simulated reload, block printing until `beginNewRun(true)` explicitly reconciles physical sheets. `beginNewRun(false)` must fail. Name the tests `oneCommandPerAttempt`, `ackKeepsAllowanceHeld`, `ejectionObservationIsIdempotent`, `threeObservationsExhaustAllowance`, `rejectionBeforeCommandReleasesAttempt`, and `reloadRequiresReconciliation`. For `ackKeepsAllowanceHeld` assert:

  ```ts
  await controller.startPrint(jpeg);
  expect(controller.getState()).toMatchObject({ remaining: 3, phase: 'awaiting-observation' });
  controller.observeEjection('2026-10-14T10:00:00Z');
  expect(controller.getState().remaining).toBe(2);
  ```

  For `reloadRequiresReconciliation`, construct a second controller with the same fake `Storage` and assert `needsReconciliation === true`, `startPrint` rejects, and `beginNewRun(false)` rejects.

- [ ] **Run** `npm test -- src/features/qualification/trial-log.test.ts src/features/qualification/trial.test.ts`; expect failures from missing modules.
- [ ] **Implement** the typed event allowlist, timestamps, IDs, and JSON export in `trial-log.ts`.
- [ ] **Implement** the local controller in `trial.ts`. Keep the raw JPEG only as a call argument; never store it in state, storage, or logs after command delivery. Task 6 clears and revokes the selected preview after ejection observation, cancellation, or uncertain stop.
- [ ] **Run** focused tests and `npx tsc --noEmit`; expect both to pass.
- [ ] **Commit** these files as `feat: track supervised qualification attempts`.

### Task 6: Development-only iPhone trial page

**Files:** Create `src/app/qualification/iphone-print/page.tsx`, `src/features/qualification/QualificationClient.tsx`, `QualificationClient.module.css`, and `QualificationClient.test.tsx`. Modify `src/app/layout.tsx` and `src/styles/globals.css` to load DM Sans with `next/font/google` and keep a system sans-serif fallback.

**Interfaces:** Consumes Tasks 2–5. The page renders `QualificationClient` only when `process.env.NODE_ENV === 'development'`; otherwise call `notFound()`. The Client Component owns camera stream start/stop, connects the real printer from a user gesture, invokes the controller, and shows the operator setup and compact trial states.

- [ ] **Write failing React tests.** Missing Web Bluetooth or denied camera permission shows a persistent setup blocker with retry; an ended camera track disables Capture; Retake returns to preview without changing allowance; Print disables immediately; an acknowledged command shows “Waiting for film ejection” rather than success; a 60-second observation timeout becomes uncertain and offers operator inspection with no resend. Test the setup-to-trial transition without Guest permission prompts. Name these `blocksUnsupportedBluetooth`, `retriesDeniedCamera`, `stopsOnEndedTrack`, `retakeKeepsAllowance`, `disablesDuplicatePrint`, `ackShowsPending`, and `observationTimeoutIsUncertain`. For `ackShowsPending` assert the status text is present and no success text is shown after the fake printer returns `{ kind: 'accepted' }`.

  ```tsx
  expect(screen.getByText('Waiting for film ejection')).toBeDefined();
  expect(screen.queryByText('Print complete')).toBeNull();
  ```

- [ ] **Run** `npm test -- src/features/qualification/QualificationClient.test.tsx`; expect failures from the missing component.
- [ ] **Implement** the route in `page.tsx` with a render-path `notFound()` outside development.
- [ ] **Implement** `QualificationClient.tsx` and its module CSS. Use dark Booth tokens, visible focus and 44 px minimum touch targets; keep the review image unmirrored and controls inside the usable viewport. After acknowledgement, start Task 4's status observation and stop it after operator observation or uncertain stop; at 60 seconds without observed ejection, mark the attempt uncertain. Show raw diagnostic events and a manual **Observed film ejection** action only in the supervised operator view. Label it as a trial observation, not automatic printer confirmation. Show **Reconcile physical sheets** before resetting an uncertain or reloaded run.
- [ ] **Load** DM Sans with `next/font/google` in `layout.tsx`, with the system sans-serif fallback in `globals.css`.
- [ ] **Run** the focused test, `npm run lint`, `npx tsc --noEmit`, `npm run format:check`, and `npm run build`; expect all to pass. In a local browser, check that `/qualification/iphone-print` loads in development and returns 404 from a production start.
- [ ] **Commit** the route, component, styles, tests, and any font change as `feat: add supervised iPhone qualification page`.

### Task 7: Runbook and device dry run

**Files:** Create `docs/qualification/issue-17-runbook.md`; modify `README.md` to link the local trial instructions.

**Interfaces:** Consumes the working page and produces a repeatable operator checklist and blank evidence record. It records actual versions and observations at trial time, never pre-fills them from reported values.

- [ ] **Write** the runbook with setup checks for trusted HTTPS, same-network reachability, Bluefy and printer versions, pairing and permissions, camera/crop preview, browser chrome, Guided Access, a pre-command disconnect/reconnect, continuous printer power, three physical prints with one Retake, zero-allowance blocking, per-attempt printer timeline and physical ejection, and privacy inspection. Provide pass/fail/not-observed fields and a sheet-count reconciliation line.
- [ ] **Run** `npx prettier --check docs/qualification/issue-17-runbook.md README.md` and a relative-link check; expect no formatting or link errors.
- [ ] **Create local HTTPS files** with installed `mkcert` for the actual iPhone-reachable hostname or address at ignored `certificates/booth-key.pem` and `certificates/booth.pem`. Never commit the key or CA.
- [ ] **Trust the local CA on the iPhone** with the owner's help, then start `npm run dev:https` and confirm Bluefy shows a secure context.
- [ ] **Complete the no-print device checks** in the runbook and export one non-photo diagnostic log. Do not send a command until camera, crop, statuses, and log are reviewable. Record any browser or protocol mismatch and fix the owning task before spending film.
- [ ] **Commit** the runbook and README change as `docs: add iPhone qualification runbook`.

### Task 8: Fresh-film trial and gate record

**Files:** Add `docs/qualification/issue-17-trial-report.md` after the owner operates the actual devices; update issue #17 with a link to the report and evidence. Do not edit gate criteria based on a failed attempt without a separate product decision.

**Interfaces:** Consumes the runbook and exported non-photo timelines. Produces one pass/fail/not-observed decision per spec criterion and the observed ejection-signal conclusion used by issue #9.

- [ ] **Record** actual iPhone/iOS, Bluefy, printer/firmware and film state before sending a command.
- [ ] **Run** three consecutive successful physical Guest-flow prints with a Retake and continuous power. Correlate command acceptance, each candidate status signal, and observed physical ejection; photograph or video only non-identifying test output if useful.
- [ ] **Verify** correct crop/orientation on each sheet, allowance exhaustion without a fourth command, safe disconnect recovery, and no photo bytes in the exported log. If an outcome is ambiguous, stop, inspect, reconcile, and record a failure or not-observed result; never auto-resend.
- [ ] **Write** the trial report with the per-criterion evidence table, sheet counts, run/attempt IDs, signal timing, and explicit gate decision.
- [ ] **Run** `npx prettier --check docs/qualification/issue-17-trial-report.md` and `git diff --check`; expect both to pass.
- [ ] **Commit** the report.
- [ ] **Post** its link and concise conclusion to issue #17 with `gh issue comment 17 --body-file` and a prepared local Markdown file. Close #17 only after all criteria pass and the physical evidence has been reviewed; a pass does not close iPad issue #7.

## Final verification

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run format:check`, and `npm run build` after code tasks. The iPhone dry run and physical trial are separate evidence checks: simulation does not establish physical ejection or pass the printer-backed completion checkpoint, while integrated development may proceed with a simulated printer under ADR-0021. Before reporting completion, review the branch diff, the trial report, issue #17, and the Next.js agent-feedback instructions in `AGENTS.md`.
