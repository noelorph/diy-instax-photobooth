# F4 — Booth Setup, Access and Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout:** Use **ponytail:ponytail, full**. Integrate the existing #9 lifecycle/handoff endpoints into the current operations feature and Booth controller. Do not add a second lifecycle engine or new test-print workflow.

**Goal:** Start a prepared Booth safely, control its run from the phone, recover scoped access when eligible and finish the Event separately.

**Architecture:** Setup runs under Admin authority on the booth device; existing handoff issue/confirm handlers perform local sign-out and scoped activation. F4 also corrects the shared camera helper so explicit setup/recovery actions can request permission while passive observation cannot prompt. The shared `BoothFlow` consumes version-2 state, while phone operations use persisted server transitions. F5 extends this controller for capture/printing and F6 reuses the corrected camera helper and supplies fault reconciliation before requesting F4's protected replacement flow.

**Tech Stack:** Existing Next.js/React/TypeScript, Supabase contracts, `PrinterAdapterV2`, simulator, Vitest/Playwright.

**Spec:** [Approved design, F4](../specs/2026-10-24-issue-10-functional-breakdown-design.md#f4-booth-setup-access-and-lifecycle). Parent #10; #9 prerequisite satisfied; additionally requires F1, F2 and F3. [Index/shared rules](2026-10-24-issue-10-implementation-plan.md).

**Published issue:** [#32](https://github.com/noelorph/diy-instax-photobooth/issues/32), native child of [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10). Prerequisites published 2026-10-25 (historical): [#9](https://github.com/noelorph/diy-instax-photobooth/issues/9) (completed), [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29), [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31). Published and read-back verified 2026-10-25. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure.

## Global Constraints

- #9 passed on reviewed candidate `2f89a96` and is closed; verify the index evidence. The plan and GitHub publication are approved; F3–F8 may use the verified upload-disabled F2 milestone under ADR-0032 without waiting for full #30 closure; other capability prerequisites still apply. #30 remains in #10 and is completed last. Reuse `Prepared → Active`, `Paused`, `Finishing`, `Finished`; Event states remain separate.
- Setup reminder only: **“Always test the printer before starting Booth Mode.”** No in-app Test Print, inspected test output or stock gate.
- Poll/report every 2,000 ms while visible; dynamic readiness older than 5,000 ms is unusable. Same printer/connection generation and physical load/power/Guided Access confirmations are required under #9.
- Explicit local setup and Enable Camera actions may request camera permission. Passive polling/rendering never prompts; readiness requires an actual live feed, and denial leaves the camera blocker active.
- Initial issue endpoint signs Admin out locally; phone Auth survives. Replacement activates access into Paused, never automatically resumes and cannot replace Finishing/Finished or possible pending delivery.
- Successful handoff is not proof of usable equipment. After navigation to `/booth`, establish a live camera and current printer readiness under the scoped grant before admitting a Guest; released/stale setup resources keep admission blocked.
- Use the main plan’s [screen reference and presentation contract](2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract): A04/A06/A16/A19–A21; B20–B25/B30; D05–D10. PDF pages and supplementary Figma frames are identified separately there; missing variants remain written verification obligations.

Follow the [shared command/environment table](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules). Update this capability’s rows in the [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) with actual revision/command/result before closure; pending rows are not passing evidence.

**Complete removal:** [ADR-0029](../../adr/0029-remove-legacy-features-and-reset-development-schema.md) applies. Delete this capability's obsolete UI, actions, routes, validation, helpers, exports and success fixtures/tests as their current flows become ready; update every shared caller. Retain no legacy reader, denial-only route or version-1 fallback. Record shared SQL dependencies for F8's package-only baseline. Reuse #9's current contracts and safety tests; do not redesign them.

## Review Focus

1. Local sign-out/navigation may release setup resources; a confirmed handoff cannot admit a Guest until fresh scoped camera/printer readiness is established, including lost issue/confirmation responses — task 1.
2. Prompt-state or unsupported permission queries cannot prevent an explicit camera request; passive checks cannot prompt or treat stale readiness as usable — tasks 1–2.
3. Pause/Finish before dispatch denies it; an already authorized attempt must settle — task 2.
4. A Finished run cannot Resume and completing a still-unresolved Event must fail — task 3.
5. Replacement with lost access cannot create a second run, clear pause or reverse Finishing — task 3.

## File map and shared interfaces

Modify `src/features/admin/operations/{panel.tsx,types.ts,read.ts,panel.module.css}`, create focused `src/features/admin/operations/booth-setup.tsx`; modify `src/features/booth/{flow.ts,booth-client.tsx,camera.ts,entry.tsx,booth.module.css}` and `src/app/(admin)/events/[eventId]/page.tsx`. Reuse existing lifecycle/handoff/readiness routes, `package-contract.ts`, `package-validation.ts`, `print-journal.ts` and `printer/{contract-v2,simulator-v2}.ts`.

Update `tests/{unit/booth-flow.test.ts,unit/booth-page.test.tsx,unit/booth-camera.test.ts,components/booth-flow.test.tsx,components/admin-operations.test.tsx}`, camera doubles/callers found with `rg`, integration lifecycle/grants/readiness cases, `tests/e2e/admin-booth-{handoff,simulator}.spec.ts`, `tests/fixtures/admin-booth-server.mjs`, `playwright.booth.config.ts` and `playwright.admin-booth.config.ts`. Reuse F2's `tests/fixtures/package-browser.ts` for shared real-browser setup/cleanup; no test-only production endpoint. Both simulator configs use the existing runner with explicit allowed app port/local credentials as specified in the index.

Keep one `BoothFlow` in `flow.ts`. Change constructor dependencies to `{transport: BoothTransport; printer: PrinterAdapterV2; journal: BoothMetadataJournal}`; `BoothTransport = (path: string, body?: Record<string, unknown>) => Promise<unknown>` validates each response at its caller. Preserve `getSnapshot(): View`, `subscribe(listener: () => void): () => void`, `initialize(handoffId?: string): Promise<void>`, `refresh(): Promise<void>`, `reportEquipment(observation: z.infer<typeof readinessObservationSchema>): Promise<void>`, `dispose(): void`. `BoothClient` supplies actual current camera observations; the controller combines them with current adapter readiness and the server-issued readiness window. `View` retains `phase`, optional `title/message/photoUrl`, and adds `counts?: PackageCounts`, `blockers: readonly string[]`, `allowedActions: {connectPrinter: boolean; enableCamera: boolean}`. F4 handles loading/paused/finishing/finished/access-required/unavailable/welcome phases; F5 adds Guest phases in the same union. Welcome admission still requires the F5 implementation before releasing the combined app.

Consume F2's `createPackageBrowserFixture(): Promise<PackageFixture>` with saved/restored simulator policy and exact-ID cleanup. Tests create two independent Playwright contexts and sign in through the real forms; owner SQL seeds fixtures only, never the action under test. No production gate is weakened for browser testing.

Correct the shared interface in `camera.ts` to `BoothCamera.start(video: HTMLVideoElement, disconnected: () => void, permission: 'existing' | 'request'): Promise<void>`; preserve `capture()` and `stop()`. `request` is used only by explicit setup/Enable Camera gestures and invokes `getUserMedia` without requiring a prior `granted` query result. `existing` reuses a live stream or acquires one only when permission is already known to be granted; otherwise it stays blocked without prompting. Missing/rejected Permissions API queries cannot block the explicit request path or fabricate readiness. F4 owns this implementation; F5 consumes `existing` and F6 consumes `request`.

## Task 1: Complete equipment setup and initial scoped handoff

**Interfaces:** Existing GET/POST `/api/admin/events/{eventId}/booth/setup-readiness`, POST `/booth/start`, POST `/api/admin/booth-handoffs/{handoffId}/issue`, POST `/api/booth/handoff/confirm`. Use `packageActionSchemas.setupReadiness`, `.start`, `.confirmHandoff` and `packageOperationSchema`; device proof stays in HttpOnly cookies. The issue handler already performs local sign-out—do not call Profile sign-out first.

- [ ] Replace the legacy Test Print browser journey with real setup/handoff assertions: 0 packages, incomplete physical confirmations, stale readiness, camera failure, wrong generation, failed sign-out and lost issue/confirm replies. Success oracle using separate `boothPage` and `phonePage` contexts:

  ```ts
  await expect(boothPage).toHaveURL(/\/booth$/);
  await expect(phonePage.getByRole('button', { name: 'Pause Booth', exact: true })).toBeVisible();
  const run = await f.local.service
    .from('booth_runs')
    .select('state')
    .eq('event_id', f.eventId)
    .single();
  expect(run.data?.state).toBe('Active');
  ```

  Assert actual persisted grant/run state, initiating Admin session revoked and phone session valid. The raw fixture RPC omits the HTTP projection’s `runState`, so read the persisted run as shown.

- [ ] Add the named real two-context regression `setup handoff reestablishes scoped readiness before Guest admission` to `tests/e2e/admin-booth-simulator.spec.ts` (trace F4-01). Complete actual setup, local sign-out, handoff confirmation and navigation; verify an Admin-only read is denied on the Booth context, the phone remains authorized and the device can read only scoped state. After arrival, observe a live camera video with nonzero dimensions and fresh printer observations for the bound identity/current generation; capture a new `/api/booth/readiness` acknowledgement under device authority. Only then may Guest admission succeed. Use real handlers, not a seeded readiness flag or an `Active`-state assertion alone.
- [ ] Add the same transition's cleanup/denial variants: release the setup stream and disconnect the simulated printer during navigation, delay a setup readiness reply until after unmount, and reject camera reacquisition. Assert no new Guest Session while either resource is absent/stale; old callbacks cannot refresh readiness or dispose the new owner's stream. Restore each resource in turn using the approved local gesture when required, then verify fresh readiness and eligible admission. Unit/component cases pin resource ownership and cleanup; the browser case proves the actual route/sign-out boundary. Record simulator software evidence only; actual Bluefy/Bluetooth continuity remains #17/#7.

- [ ] Replace the blanket camera test `refuses to request camera permission from a Guest` with cases for the corrected intent boundary: `request` reaches `getUserMedia` from `prompt`, missing Permissions API and rejected camera-query states; `existing` never prompts from those states. Cover browser permission denial/retry, duplicate pending clicks, live-feed failure and a late stream resolving after stop/dispose. Preserve the existing generation/track-cleanup assertions. Add setup UI tests proving a click uses `request`, readiness is false until the feed is live, and background refresh does not request permission.
- [ ] Run `npm test -- tests/unit/booth-camera.test.ts tests/components/booth-flow.test.tsx tests/components/admin-operations.test.tsx tests/integration/package-grants.test.ts tests/integration/package-readiness.test.ts`; existing contracts pass and explicit prompt-state camera assertions fail against the inherited helper before correction.
- [ ] Correct `BrowserBoothCamera.start` and every caller/double to the shared signature. Invoke the permission-requesting path from the explicit user gesture, without a preceding permission-query rejection or delayed polling callback. Keep passive checks nonprompting; browser denial/unavailable media keeps actionable camera feedback. Retain generation cancellation, stop stale/failed streams and report readiness only after the current stream is live. Reuse this one implementation for F6; camera permission never changes run state or Admin authority.
- [ ] Implement `BoothSetup({eventId, revision}: {eventId: string; revision: number})` against those endpoints. Reuse live camera/printer observation, never a checkbox that asserts dynamic readiness. Keep film-loaded/power/Guided Access as physical confirmations and require positive capacity. Remove converted-booking review guards with F2's retired review workflow; no conversion prerequisite remains. Store stable IDs for this handoff, distinguish prepared/issued/confirmed, and enter `/booth` only under scoped proof. Recover a lost confirmation via Booth state/receipt; an unusable issue response follows the existing fail-closed replacement path, never blind reissue. Remove Test/usable-output setup consumers.
- [ ] Complete the arrival readiness boundary in the same `BoothClient`/`BoothFlow`: invalidate setup-only observations, use a still-live resource only after checking it, otherwise reacquire and report actual state through the scoped readiness endpoint. Keep new admission blocked until acknowledgement and current local readiness agree. Reuse `BoothCamera.start(..., 'existing')` for passive use; if permission/connection needs a user gesture, expose only the approved Enable Camera / Connect to Instax actions. F4 owns their initial-arrival wiring, including `BoothFlow.connectPrinter(): Promise<void>`; F6 extends these same actions for fault recovery. Do not prompt from polling, manufacture readiness or require another Admin sign-in after a successful handoff.
- [ ] Run the focused tests and `npx playwright test --config playwright.admin-booth.config.ts`; expect real two-device handoff and failure cases to pass. Include a camera case starting without context-level `permissions: ['camera']`; assert the explicit action reaches the media request and denial leaves readiness false. If headless fake-UI flags auto-accept the request, retain the controlled prompt/denial/unsupported-query unit/component cases as the permission-boundary evidence rather than claiming a native prompt was tested. Production `admin-booth-handoff.spec.ts` must still prove simulation cannot activate in production mode.
- [ ] Commit with `feat: complete scoped booth setup and handoff`.

## Task 2: Integrate run state and phone Pause/Resume/Finish

**Interfaces:** Existing GET `/api/booth/state` returns normal v2 state or `{state: 'Finished'}`; handle the Finished proof explicitly. Existing phone POST `/booth/{pause,resume,finish}` consumes `{operationId, expectedRevision, runId}`. F3's operational read model carries authoritative counts/run identity. F5 consumes the current stop state at admission, capture, reservation and immediately before send.

- [ ] Add controller/component and real operation assertions for polling, hidden/focus refresh, Paused grant retention, readiness expiry at 5,001 ms, stale command revision, duplicate phone actions and both stop/dispatch orderings. With a seeded unresolved attempt:

  ```ts
  expect(run.state).toBe('Finishing');
  expect(pendingAttempt.state).not.toBe('NotPrinted');
  expect(newSession.error).not.toBeNull();
  expect(newSession.data).toBeNull();
  ```

  Assert denied Guest admission and unchanged attempt/counters through the real #9 operation.

- [ ] Run `npm test -- tests/unit/booth-flow.test.ts tests/components/booth-flow.test.tsx tests/components/admin-operations.test.tsx tests/integration/package-lifecycle.test.ts tests/integration/package-dispatch.test.ts`.
- [ ] Replace legacy bootstrap/availability and one-second polling with the v2 state projection and shared constants. Handle current blocked/paused/finishing/finished state without redirecting routine faults/pauses to sign-in. Phone commands use stable IDs and receipt recovery, then refresh state. Finish blocks new work and waits for pending outcomes. Remove local Guest pause/exit takeover consumers; retain only approved local equipment actions for F6. Keep the existing simulator gate in `BoothEntry`.
- [ ] Rerun focused tests and the Admin Booth simulator browser command. Verify known pending cases with real seeded #9 attempts; F5/F6 later prove complete simulator print journeys. Run changed-file lint/type/format; expect pass.
- [ ] Commit with `feat: integrate phone controlled booth lifecycle`.

## Task 3: Complete replacement access, new runs and Event termination

**Interfaces:** Existing POST `/booth/recover-access` consumes `.recoverAccess`; replacement reuses task 1 issue/confirm. POST `/complete` and `/cancel` consume `{operationId, expectedRevision}`. New run on a still-Live Event uses task 1 setup/start, never Resume. F6 calls this replacement entry only after reconciliation; authentication alone is insufficient.

- [ ] Add tests for replacement into Paused, possible pending delivery refusal, Finishing/Finished refusal, explicit phone Resume, new run preserving counts and separate Event completion/cancellation. Oracle after a successful replacement:

  ```ts
  expect(replacementRun.id).toBe(originalRun.id);
  expect(replacementRun.state).toBe('Paused');
  expect(afterCounts).toEqual(beforeCounts);
  ```

  Test completion/cancellation denial while a run is unfinished or any attempt unresolved and a successful retained terminal record only after all guards pass.

- [ ] Run `npm test -- tests/integration/package-grants.test.ts tests/integration/package-lifecycle.test.ts tests/components/admin-operations.test.tsx tests/components/booth-flow.test.tsx`.
- [ ] Complete protected setup return and guarded replacement presentation using F1 authentication and existing #9 endpoints. Show Finished with Sign in. Keep new local start, phone Resume and Complete Event as distinct actions with truthful dialogs and pending feedback; no automatic restart or counter reset. F2 retains Draft cancellation ownership; F4 owns eligible Live cancellation.
- [ ] Rerun focused tests, `npx playwright test --config playwright.admin-booth.config.ts` and `npx playwright test --config playwright.config.ts tests/e2e/admin-booth-handoff.spec.ts`; expect pass. Verify phone focus/status feedback and dark Booth access states against the main-plan screen references.
- [ ] Commit with `feat: complete booth access replacement and event termination`.

**Done:** Setup/access/lifecycle works end to end with real #9 mutations, two device sessions and seeded pending attempts. The shared camera helper supports explicit permission requests and nonprompting passive use, with permission-boundary tests independent of pregranted browser contexts. F5 owns Guest execution and immediate fault stops; F6 reuses the camera helper and owns recovery before replacement. Record Test Print, local takeover and compatibility retirements for F8. Do not repair #9 or enable physical printing.
