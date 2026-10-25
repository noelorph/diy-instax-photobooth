# F2 — Event Preparation and Private Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout:** Use **ponytail:ponytail, full**. Extend existing Draft validation, private storage cleanup and UI. Use maintained format/upload libraries for the nontrivial media work; do not build a general asset manager or custom video decoder.

**Goal:** Prepare a valid Event Draft, manage its private media and safely cancel/delete the Draft, with no legacy allowance or conversion workflow.

**Architecture:** Preserve the existing Draft DAL and schedule parser, replacing independent allowance with package-derived capacity and the direct creation insert with a transactional, retry-safe operation. Reuse #9's receipt machinery for creation; add narrowly scoped private media metadata and trusted finalization, keeping immutable object paths until a validated Draft-only swap commits. F5/F7 consume authorized media delivery; F4 owns starting and Live termination.

**Tech Stack:** Existing Next.js/Supabase/Zod/Temporal/UI/tests; declare the already installed `sharp` as a direct server dependency, plus `mp4box` for MP4 parsing and `tus-js-client` for resumable transfer when implementing task 2. Pin compatible versions then; no dependency is installed by this plan.

**Spec:** [Approved design, F2](../specs/2026-10-24-issue-10-functional-breakdown-design.md#f2-event-preparation-and-private-media), [ADR-0027](../../adr/0027-draft-only-event-media.md). Parent #10; #9 prerequisite satisfied; additionally requires F1. [Index/shared rules](2026-10-24-issue-10-implementation-plan.md).

**Published issue:** [#30](https://github.com/noelorph/diy-instax-photobooth/issues/30), native child of [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10). Native prerequisites: [#9](https://github.com/noelorph/diy-instax-photobooth/issues/9) (completed), [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29). Published and read-back verified 2026-10-25; implementation remains on hold.

## Global Constraints

- #9 passed on reviewed candidate `2f89a96` and is closed; verify the index evidence. The plan and GitHub publication are approved; implementation remains on hold pending a later user instruction and the capability prerequisites. No hosted activation, new accounting rule or Guest-image upload.
- Original packages are whole `0..214_748_364`; total is `packages × 10`. Zero saves but cannot start. Reject stale revisions, invalid IANA zones, nonexistent/ambiguous local times and end ≤ start.
- Draft creation uses one stable actor-scoped `operationId` and normalized payload per submitted save. A committed save with a lost response recovers the same Event and creation audit; changing the payload under that key is a conflict, never another insert.
- Media upload/replace/remove is Draft-only, including final commit checks. Still JPEG/PNG/WebP ≤10,000,000 bytes; reject animation. MP4 H.264/AVC ≤50,000,000 bytes and `0 < duration ≤ 30` seconds. Preserve old media on failure; no conversion/trimming/editing; terminal media stays retained.
- Use [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md), [screen map](../../design/2026-10-21-package-recovery/screen-map.md), [02 events](../../design/2026-10-21-package-recovery/admin/02-events.png), [03 editor](../../design/2026-10-21-package-recovery/admin/03-event-editor.png), [04 Draft/setup](../../design/2026-10-21-package-recovery/admin/04-draft-setup.png), [11 feedback](../../design/2026-10-21-package-recovery/admin/11-dialogs-feedback.png). F5's delivery consumer uses [Booth 01](../../design/2026-10-21-package-recovery/booth/01-welcome-capture.png).

Follow the [shared command/environment table](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules). Update this capability’s rows in the [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) with actual revision/command/result before closure; pending rows are not passing evidence.

## Review Focus

1. Lost creation replies/concurrent retries create one Draft and audit; DST gaps/overlaps, package bounds and stale edits still preserve validation and entered values — task 1.
2. Renamed, animated, truncated or codec-mismatched media cannot pass client-only validation — task 2.
3. A competing Start/Cancel or second replacement defeats stale finalization without removing current media — task 2, before editor polish.
4. A removed Admin, foreign Event path or expired Booth grant cannot access/change media — tasks 2 and 4.
5. A late upload or failed Storage removal cannot make a deleted Draft appear fully cleaned — task 3, before editor polish.

## File map and new contracts

| Responsibility             | Files                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drafts/list                | Modify `src/features/admin/events/{draft-event.schema.ts,actions.ts,draft-form.tsx,draft-list.tsx,state.ts,draft.module.css}`, `src/lib/events/drafts.ts`, `src/app/(admin)/events/{page.tsx,new/page.tsx,[eventId]/page.tsx}`; delete `src/app/api/admin/events/[eventId]/review-draft-booking/route.ts` and its unused validation/RPC callers                                             |
| Draft creation receipts    | Create forward `supabase/migrations/<new-timestamp>_draft_creation_receipts.sql`; extend `src/lib/operations/package-rpc.ts` and regenerate `src/lib/supabase/database.types.ts`; reuse `private.package_receipt` / `private.package_commit_receipt` and existing receipt/audit tables                                                                                                      |
| Media content/transactions | Create `src/lib/events/{media.ts,media-validation.ts,media-types.ts}` and forward `supabase/migrations/<later-timestamp>_event_media.sql`; regenerate `src/lib/supabase/database.types.ts`; modify `package.json`/`package-lock.json` only for task 2 dependencies                                                                                                                          |
| Media routes/view          | Create `src/app/api/admin/events/[eventId]/media/route.ts`, `src/app/api/admin/events/[eventId]/media/uploads/route.ts`, `src/app/api/admin/events/[eventId]/media/[assetId]/route.ts`; create `src/app/api/booth/media/route.ts`, `src/features/admin/events/event-media.tsx`; extend existing Draft CSS                                                                                   |
| Cleanup                    | Extend `src/lib/operations/{draft-media-cleanup,package-draft-deletion}.ts`, `src/features/admin/operations/pending-removals.tsx`, `src/lib/events/history.ts`                                                                                                                                                                                                                              |
| Tests/fixtures             | Extend Draft tests; create `tests/unit/event-media-validation.test.ts`, `tests/integration/event-media.test.ts`, `tests/components/event-media.test.tsx`, `tests/e2e/event-media.spec.ts`, `tests/fixtures/event-media/README.md` and synthetic media assets; extend `tests/fixtures/local-supabase.ts` cleanup; create `tests/fixtures/package-browser.ts` for F2–F7 real-browser fixtures |

The migration placeholders specify ordering: #9 already has migrations through `20261024071618`. Generate new timestamps after the latest applied predecessor at execution, with creation receipts before media. Use additive development migrations during F2; F8 incorporates their final definitions into the new baseline and removes the old chain under ADR-0029. Do not reset any database in this capability.

Proposed shared types in `media-types.ts`: `MediaKind = 'background' | 'montage'`; `EventMediaAsset = {id: string; kind: MediaKind; url: string; expiresAt: string; contentType: string}`; `EventMedia = {background: EventMediaAsset | null; montage: EventMediaAsset | null}`. URLs are short-lived authorized delivery, not persisted object identifiers. F5 consumes this exact shape.

`tests/fixtures/package-browser.ts` exports `createPackageBrowserFixture(): Promise<PackageFixture>`, extending the existing package/local fixtures with exact-ID cleanup and saved/restored simulator policy. Creation cases additionally save/restore the local Event creation default under the index's serial rules, without changing the activation guard. Browser tests use real forms/handlers; owner SQL creates synthetic prerequisites only. F4–F7 reuse this fixture rather than creating another database selection path.

**Execution priority:** after task 1 supplies a saved Draft, complete trusted validation, actual resumable transfers and lifecycle races in task 2, then deletion/late-upload cleanup in task 3. Only then complete the polished media editor/delivery presentation in task 4. Minimal real upload/remove controls are enough for the early browser proof and are extended in place. If the mechanics cannot satisfy ADR-0027, stop the dependent editor work and record the failing case; do not weaken validation or label the risk resolved from a mock.

## Task 1: Finish package-based Draft preparation and discovery

**Files:** Draft and Draft creation receipts rows above; `tests/unit/draft-event.schema.test.ts`, `tests/integration/{draft-events-dal,draft-events-rls,package-http-access}.test.ts`, `tests/components/draft-event-ui.test.tsx`, `tests/e2e/draft-event.spec.ts`; extend exact-ID receipt/audit cleanup in `tests/fixtures/local-supabase.ts` only where needed.

**Interfaces:** Preserve `parseDraftEventInput(input: unknown): ValidatedDraftEvent`, `updateDraft(id: string, expectedRevision: number, input: unknown): Promise<DraftSaveResult>` and `getDraft`/`listDrafts`. Correct creation to `createDraft(operationId: string, input: unknown): Promise<DraftSaveResult>`. Keep `createDraftAction(state: DraftActionState, data: FormData): Promise<DraftActionState>`; read and validate its separate `operationId` form field before passing normalized booking data to the DAL. Use the existing `DraftSaveResult` conflict/unavailable states for changed-payload/ambiguous outcomes. Remove `originalPrintAllowance` from writable `DraftEventInput`, validated values and DAL payloads; retain `filmPackageCount`, derive the displayed total and remove converted-booking review fields from reads. Read `listLiveEvents()` from the existing operations module for the combined Draft/Live list.

The new `private.create_event_draft(p_admin_user_id uuid, p_admin_session_id uuid, p_operation_id uuid, p_payload jsonb) returns jsonb` and service-role-only public forwarding function use the existing `PackageOperationResult<{eventId: string}>` envelope with operation kind `create_draft`. The server action remains the browser entry point. The DAL reads the resulting Draft through current Admin/RLS authority. Receipt results and audit contain opaque identifiers; the existing receipt fingerprint stores only the normalized payload digest, never booking/contact copies. Preserve existing schedule/database validation and stale-edit semantics.

- [ ] Extend existing tests for removal of independent allowance, bounds, stale saves, all schedule errors and overdue Draft visibility. Reuse a valid existing booking fixture:

  ```ts
  expect(parseDraftEventInput({ ...validDraft, filmPackageCount: 0 }).filmPackageCount).toBe(0);
  expect(() => parseDraftEventInput({ ...validDraft, filmPackageCount: 214_748_365 })).toThrow();
  expect(parseDraftEventInput(validDraft)).not.toHaveProperty('originalPrintAllowance');
  ```

  Assert the real saved row derives ten per package and stale saves leave stored values unchanged. During F2 the soon-to-be-removed database allowance column remains null; application inputs/reads must not depend on it. F8 removes the column entirely and updates this assertion to catalog absence. Extend local fixture setup to temporarily use the v2 creation default and restore it as described in the index.

- [ ] Add real creation regressions: commit the save, drop its response, then retry the same ID/payload and assert the same Event ID, one Event, one receipt and one creation audit. Cover concurrent same-key calls, changed-payload conflict, invalid/missing IDs, revoked Admin replay and replay after another edit/deletion without overwriting or recreating the Event. In the browser, let the real server action commit before dropping its response; retry from the form and verify the recovered Draft becomes the edit target. A mocked success response is insufficient.
- [ ] Run `npm test -- tests/unit/draft-event.schema.test.ts tests/integration/draft-events-dal.test.ts tests/integration/draft-events-rls.test.ts tests/components/draft-event-ui.test.tsx`; expected new failures identify legacy allowance payloads and duplicate creation after response loss.
- [ ] Implement the creation transaction in the forward migration: validate the normalized payload, use the existing global-guard → Event lock order where an Event exists, recheck live Admin authority after locks, and check the actor/key fingerprint before inserting. Serialize concurrent creation retries through the existing guard; commit the Event, one metadata-only creation audit and receipt atomically. Same-key replay returns the original Event identity without repeating the insert/audit, and never restores deleted data or reverts subsequent edits. Enforce version-2 creation under the configured creation default; retain #9's current authorization, database constraints, fixed search path and restricted execution grants. Transitional creation-version guards remain only until F8 removes conversion machinery; no new conversion path is added. Extend the existing RPC helper's allowed names rather than creating another transport.
- [ ] Correct form/action/DAL callers and fixtures together. Generate one creation ID before submitting, freeze the pending payload for same-key retries, and retain both until the outcome is confirmed; do not mint a new ID or submit edited creation data while the original result is unknown. Keep entered values and persistent recovery feedback. After receipt recovery, load the current Draft/revision and use the existing update path for later edits. Preserve per-field/summary errors and reload-latest recovery; do not log or journal booking/contact data. Delete the converted-Draft UI, `review-draft-booking` route, schemas, RPC callers and conversion fixtures/tests after tracing shared uses. Record remaining SQL review/conversion objects for F8 removal; no booking-review prerequisite exists in the finished product. Preserve the required metadata-only update audit without duplicating the creation audit.
- [ ] Rerun focused tests and `npx playwright test --config playwright.config.ts tests/e2e/draft-event.spec.ts`; verify one Draft/audit after the lost-response retry, correct conflicts/authorization, and that zero-package Drafts cannot appear ready to start and stale conversion URLs return 404/405 without mutation. Run local migration lint and changed-file type checks for the corrected creation callers. Expected all pass.
- [ ] Commit with `feat: complete package based draft preparation`.

## Task 2: Implement validated, immutable private media writes

**Files:** Media content/transactions/routes rows, minimal `event-media.tsx` upload control, `tests/e2e/event-media.spec.ts`, content/unit/integration tests and synthetic fixtures. Add file descriptions and provenance to the fixture README; never use Guest or Client photos.

**Interfaces:** `validateEventMedia(bytes: Uint8Array, kind: MediaKind): Promise<{contentType: string; byteLength: number; durationMs: number | null}>` in `media-validation.ts`, throwing a typed validation error on unsupported/invalid content. `beginEventMediaUpload(request: Request, eventId: string): Promise<Response>` and `commitEventMedia(request: Request, eventId: string, assetId: string): Promise<Response>` in `media.ts`. `POST media/uploads` accepts `{operationId, expectedRevision, kind}`; `POST media/[assetId]` accepts `{operationId, expectedRevision}`. Return the existing `PackageOperationResult` envelope: begin result `{assetId: string; bucket: 'event_media'; path: string}`; attach/remove result `{assetId: string; cleanupPending: boolean}`. The returned revision becomes the editor’s next expected revision. Upload credentials are never receipt data.

- [ ] Write format/boundary and real-Storage tests. Acceptance oracles:

  ```ts
  expect((await validateEventMedia(validPng, 'background')).contentType).toBe('image/png');
  await expect(validateEventMedia(animatedWebp, 'background')).rejects.toThrow();
  await expect(validateEventMedia(hevcMp4, 'montage')).rejects.toThrow();
  await expect(validateEventMedia(mp4Over30Seconds, 'montage')).rejects.toThrow();
  ```

  Add exact-limit/one-byte-over cases for 10,000,000 and 50,000,000 bytes, zero duration, malformed/truncated content, APNG animation, valid H.264 with audio, conflicting same-key payload, expired authorization and Start/Cancel racing finalization. Assert the prior attached asset survives every rejected replacement. Name the content regression `rejects invalid content without replacing attached media` (trace F2-02).

- [ ] Before editor polish, add `resumes interrupted transfer and attaches exactly once` and `start or cancel during upload rejects late attachment` to `tests/e2e/event-media.spec.ts` (F2-03). Use real local Storage/TUS and a minimal real upload control, interrupt after a completed chunk, resume the same asset, then lose the finalize response and recover the original receipt. Assert one attachment/audit, unchanged prior media on failure, and retryable cleanup of unused objects. Exercise a valid near-limit image and video through the actual transfer and trusted validator. Trigger competing Start/Cancel through the existing #9 transactional RPCs with real Admin/session authority and fixture prerequisites; do not seed the transition with owner SQL. This isolates F2’s media race in the production browser suite while simulator-backed HTTP start remains F4’s separate development-suite proof. Do not mock Storage success, bypass the trusted validator or seed the operation being proved.

- [ ] Run `npm test -- tests/unit/event-media-validation.test.ts tests/integration/event-media.test.ts`; new tests fail before the implementation.
- [ ] Add `event_media_assets` with opaque ID/Event/kind/path, upload/attached/cleanup state and validated metadata; enforce one attached asset per Event/kind. The new `private.event_media_operation` (with a service-role-only public forwarding function of the same name) takes `(admin_user_id uuid, admin_session_id uuid, operation text, operation_id uuid, payload jsonb)`, rechecks current Admin authority after locks, uses #9 lock order and `package_receipt`/`package_commit_receipt`, increments Event revision and writes audit atomically. Allow only `begin_upload`, `attach`, `remove`; cleanup acknowledgement is server-only and cannot alter an attached asset. Do not modify package/count/lifecycle contracts.
- [ ] Enable RLS and deliberate grants on the asset table, with authorized Admin reads and writes only through the trusted operation. Create a private `event_media` bucket with a 50,000,000-byte upper bound and approved MIME types. Upload to unique `eventId/assetId` paths with overwrite denied. Direct resumable uploads use the current Admin credential; Storage INSERT policy validates the matching upload record and current Draft/active Admin under the Event locking boundary. No public reads/direct updates/deletes. Finalization downloads immutable bytes with the relevant size bound, validates content, then atomically swaps attachment after the expected revision/Draft check. Never trust client metadata. Use sharp's content metadata plus a decode check, reject animation including APNG; use MP4Box to inspect the complete file's video codec and effective duration, including fragments/edit timing, and reject incomplete/invalid sample data. Parsing/validation errors keep existing media.
- [ ] Implement the real resumable transfer using `tus-js-client` in the minimal `event-media.tsx` control now, with Supabase's `6 * 1024 * 1024` chunk size; task 4 extends this same path. Keep transfer completion separate from attachment acknowledgement. Rerun the unit/integration command and `npx playwright test --config playwright.config.ts tests/e2e/event-media.spec.ts`. Verify direct Storage attempts after Cancel/Start/revocation, overwrite attempts and anonymous/cross-Event paths are denied; a failure must not leave an attached invalid asset. Record F2-02/F2-03 evidence before proceeding. Commit with `feat: validate and commit private draft media` after passes.

The library choices avoid hand-built upload/video protocols. Read the primary [Supabase resumable upload guide](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [sharp metadata API](https://sharp.pixelplumbing.com/api-input/) and [MP4Box parsing API](https://github.com/gpac/mp4box.js#api) when implementing. These establish APIs, not physical iPad compatibility. A small bounded PNG chunk check may reject APNG where the image decoder does not expose its animation marker; test it rather than writing another image parser.

## Task 3: Finish safe Draft cancellation/deletion and cleanup

**Files:** Cleanup row above; `tests/integration/package-draft-deletion.test.ts`, `event-media.test.ts`; Draft/media component and browser tests.

**Interfaces:** Reuse `deletePackageDraft(request: Request, eventId: string)` and `removeEventMedia(client, eventId)`; `POST /api/admin/events/[eventId]/cancel` uses `packageActionSchemas.cancel`. Extend existing pending-removal presentation for retryable cleanup; no terminal redaction action.

- [ ] Pin cancellation retaining attached media, deletion requiring a never-started Draft with no current run/attempt work, failed cleanup remaining pending, receipt replay and late-upload rejection. Assert actual Storage listings after confirmed deletion:

  ```ts
  expect(result.mediaRemovalState).toBe('complete');
  expect((await storage.list(eventId)).data).toEqual([]);
  ```

  Name the real-Storage/browser regression `deletion stays pending while an upload can still finish` (F2-04). Start a resumable upload, begin deletion, then attempt its final chunk. If an upload can still commit, deletion must remain pending until it is terminated or expires and the final rescan succeeds; invalidating a database row alone is not proof that an already-authorized transfer cannot finish. After deletion is reported complete, retry finalization and confirm no object can reappear. Record the observed termination/expiry mechanism and repeatable cleanup evidence before task 4.

- [ ] Run `npm test -- tests/integration/package-draft-deletion.test.ts tests/integration/event-media.test.ts`; confirm new cleanup/race regressions fail before changes.
- [ ] Invalidate unfinished upload records before deletion, deny their later Storage insertion, remove only unreferenced/retired objects and confirm no outstanding upload can recreate them. Retain cleanup-pending metadata for failed removal and retry it through existing pending cleanup UI. Never clean an attached Live/terminal asset as an abandoned upload. Complete Draft deletion only after actual object removal; retain opaque audit without contact. Scope fixture cleanup to created Event/asset IDs. Cancellation retains the Event and media for F7.
- [ ] Rerun focused tests and `npx playwright test --config playwright.config.ts tests/e2e/draft-event.spec.ts tests/e2e/event-media.spec.ts`; run changed-file lint/type/format and local migration lint. Expected pass, including real Storage deletion evidence.
- [ ] Commit with `feat: complete safe draft media cleanup`.

## Task 4: Complete upload/replacement/removal UI and authorized delivery

**Files:** `event-media.tsx`, `draft-form.tsx`, media routes/modules, `tests/components/event-media.test.tsx`, `tests/e2e/event-media.spec.ts`, `tests/integration/event-media.test.ts`.

**Interfaces:** `EventMediaEditor({eventId, revision, media, onCommitted}: {eventId: string; revision: number; media: EventMedia; onCommitted: () => void})`. `GET /api/admin/events/[eventId]/media` returns `EventMedia` after current Admin checks. `GET /api/booth/media` infers the Event from the valid run grant and returns only `EventMedia`, never contact data or caller-selected Event IDs. `DELETE media/[assetId]` accepts `{operationId, expectedRevision}` and uses the same transactional authority/replay boundary.

- [ ] Add tests for no media, each supported asset, failed upload/replacement/removal, stale revision, unauthorized/expired delivery, Live read-only state and accessible progress/error feedback. Browser oracle after a deliberately rejected replacement:

  ```ts
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('img', { name: /background preview/i })).toHaveAttribute(
    'src',
    previousUrl
  );
  ```

- [ ] Run `npm test -- tests/components/event-media.test.tsx tests/integration/event-media.test.ts`; expect meaningful failures for missing UI/delivery behavior.
- [ ] Complete the editor around task 2's proven transfer path after task 3's cleanup proof passes. Show transfer versus validation/commit distinctly; transfer completion is not attachment success. Keep credentials/upload URLs out of logs and persistent UI metadata. Retry the same mutation ID/payload after response loss. Use 60-second read URLs issued after Admin/scoped-grant authorization, private/no-store route responses and renewal on expiry; do not persist or log signed URLs. No public bucket or Guest-photo input. Render Live/terminal media read-only and retain old preview until commit succeeds.
- [ ] Run focused tests and `npx playwright test --config playwright.config.ts tests/e2e/event-media.spec.ts`; verify signed-out/cross-Event access denial, 10 MB image and 50 MB video boundary transfers, stale upload rejection, keyboard labels and persistent error recovery. Expected pass. F5 separately proves welcome playback/default behavior.
- [ ] Commit with `feat: complete draft media editing and private delivery`.

**Done:** The Admin can finish the Draft preparation/media/cancel/delete workflows using real persistence and private Storage; a lost creation response cannot duplicate a Draft or its creation audit. F4 owns start/Live termination; F5 consumes `EventMedia`; F7 presents retained history. Delete independent allowance and terminal redaction consumers, preserving only the package Draft cleanup implementation. F8 removes their remaining shared SQL/schema dependencies. No media pipeline, editor, Guest gallery or physical qualification is added.
