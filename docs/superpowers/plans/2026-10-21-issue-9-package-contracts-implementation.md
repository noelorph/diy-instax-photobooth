# Issue #9 package accounting, access and printer contracts implementation plan

> **Historical evidence, not a current work order (scope updated 2026-10-25):** This record describes its original revision. #9 remains accepted/closed on `2f89a96`. [ADR-0029](../../adr/0029-remove-legacy-features-and-reset-development-schema.md) supersedes old preservation/conversion/migration-retention instructions for #10. Keep the current #9 package/access/recovery contracts; remove obsolete conversion machinery and reverify the final baseline. Prior failures, counts and evidence below are unchanged historical statements.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Approved by the user. Implementation has not started; implementation test evidence remains pending.

**Goal:** Finish issue #9 against the approved package-accounting and Booth-recovery contract, with executable database, access, HTTP and simulated-printer contract tests; give #10 a precise integration handoff.

**Architecture:** Keep accounting and transitions in private PostgreSQL functions, reached through restricted server RPC wrappers and narrow Next.js handlers. Keep the Booth grant independent of the Admin session. Separate reservation, dispatch authorization and physical outcome. Add the replacement contract alongside explicitly versioned legacy records until #10 performs the coordinated application cutover; retain historical evidence without converting its meaning.

**Tech Stack:** Existing Next.js 16.4 / React 19.3 / TypeScript application; Supabase PostgreSQL, Auth and private Storage; Zod; Vitest; existing Playwright fixtures. Reuse the lockfile and installed tooling. No framework, ORM or printer dependency change is planned.

**Spec:** [Approved replacement contract](../specs/2026-10-21-package-accounting-booth-recovery-design.md), [ADR-0025](../../adr/0025-package-accounting-and-booth-recovery.md), root [PRD](../../../PRD.md) and [ARCHITECTURE](../../../ARCHITECTURE.md).

**Approved baseline:** Commit `a21f008` (`docs: approve package accounting and booth recovery design`) on `codex/package-accounting-booth-recovery-docs`. The approved documents and mockups were committed before this plan was drafted. Nothing was pushed.

## Global Constraints

- Scope is **#9 first**, followed by the **#10 outline** below. Do not implement the new Admin/guest screens, change the approved design, enable real printing, run physical trials, publish issue changes or close issues as part of writing this plan.
- During later execution, use **Superpowers subagent-driven-development with TDD**, as already requested. Use one implementer at a time for shared migrations; run spec-compliance review followed by code-quality review at each task boundary. Reviewers must inspect the actual diff and test evidence.
- **Use the Ponytail skill/plugin during implementation and `ponytail-review` at review gates.** Read its current skills before executing. Reuse repository helpers, dependencies and patterns; make the smallest complete change; do not add speculative options, generic frameworks or unrelated cleanup. Keep validation, auth, concurrency protection, privacy, accessibility and qualification requirements intact. Ponytail is available locally under the `ponytail/ponytail/5.3.2/skills/` plugin cache; discover the current installation rather than copying a machine-specific absolute path into code.
- Read `AGENTS.md`, `docs/README.md`, the approved spec, ADR-0025, ADR-0021, `docs/qualification/issue-17-trial-report.md` and `docs/qualification/booth-recovery-proof-checklist.md`. Historical specs and plans are evidence, not competing implementation orders.
- Before writing Next.js code, install from the existing lockfile if needed and read the relevant guides in `node_modules/next/dist/docs/`. Before Supabase implementation, use the repository Supabase skill, check the current changelog/docs and inspect CLI `--help`. Do not upgrade dependencies incidentally.
- The operating load remains one Admin, one booth/printer and at most one Live Event. Phone/iPad requests, duplicate requests and overlapping network retries still run concurrently.
- One Film Package supplies 10 booked prints. Physical loading never purchases capacity; a purchase never proves loading. Full ejection counts once regardless of image quality. Unknown outcomes retain their hold. No automatic resend, print refund or blanket rejection on reload.
- Dynamic readiness is at most 5 seconds old. Poll/report every 2 seconds while visible; refresh on focus/reconnect and before Start/Print. Inactive handoff expiry is 5 minutes; active-grant idle expiry is 24 hours. Late completed-shutter metadata has the approved 2-minute stop boundary.
- No Guest photo, encoded printer image, grant secret or Client contact enters a journal, server request, receipt, database audit, log or test artifact. Use synthetic bytes in printer tests. Event Media remains the only stored imagery.
- Production rejects simulator evidence and unqualified physical outcomes. Automatic normal full-ejection feedback remains mandatory under #17; manual inspection is exceptional recovery. #7 remains the actual-iPad release gate.
- Work only in the approved worktree or a new implementation worktree branched from its reviewed plan commit. Do not mix in the root checkout or the old issue #9 worktree. Never reset a shared or hosted database to run tests. Use the existing isolated local Supabase fixture and serialize database suites.
- Preserve applied migrations and legacy history. Create forward migrations with the CLI. The only variable paths below are CLI-generated migration timestamps; record their actual filenames when created. No hosted migration, production conversion or destructive rollback is authorized by this plan.

## Review Focus

| Failure class                                         | Required evidence                                                                                                                                         | Owning tasks |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Duplicate delivery or abandoned holds                 | Lost reserve/dispatch responses; delayed reservation after session end; dispatch replay returns no send permission; crash and journal-write failure       | 6, 9, 11     |
| Incorrect capacity or rewritten history               | Last held print dispatches at zero available; concurrent additions/reservations; integer overflow; immutable terminal results and legacy snapshots        | 2, 3, 7, 10  |
| Recovery unexpectedly resumes or clears another fault | Pause survives every repair; finish is irreversible; stale reload confirmation rejected; different printer rejected; readiness expires                    | 4, 5, 7, 11  |
| Authority or privacy escape                           | Revoked JWT; expired/replaced grant; direct SQL/RPC bypass; cross-origin request; wrong run/attempt; narrow late capture; no image/contact/secret leakage | 2, 5, 8, 9   |
| Unsupported hardware confidence                       | Acceptance/counter/time never means ejection; production rejects simulated/unqualified evidence; idle/old-job clearing is separate from reconnect         | 4, 7, 9, 11  |

---

## 1. Scope, feasibility and completion boundaries

**Feasibility assessment:** The software contracts, deterministic simulator and phone-based recovery are feasible with the current stack. The design deliberately keeps possible output unresolved rather than guessing. A real unattended success path is still conditional on #17 proving automatic full ejection and the required recovery procedures, followed by #7 on the actual iPad. Seven fresh-film outputs matching the review and the used-sheet trial do not prove those missing capabilities. If normal automatic completion cannot be established, keep real Booth Mode disabled and bring the hardware decision back for review; do not silently replace it with per-print Admin inspection.

| Work                                                                                                                                                                  | Ownership                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Types, transitions, invariants, private functions, RLS/privileges, endpoint behavior, grant lifecycle, simulator/dispatch safety primitives and contract tests        | This #9 plan                                |
| Approved screen implementation, guest orchestration, phone polling/panels, camera/media presentation, removal of retired controls and coordinated application cutover | #10, separate detailed plan after #9 review |
| Physical adapter/protocol investigation and validated outcome/recovery procedures                                                                                     | #17                                         |
| Actual iPad A16 / Bluefy / Guided Access end-to-end qualification                                                                                                     | #7                                          |

Issue #9 requires executable integration/contract tests, not only approved prose and mockups. Its current GitHub body still contains superseded stock/redaction requirements; use the approved replacement contract and the local `docs/github-issue-update-drafts.md` when preparing a later issue update. Keep the contract-test requirement. Do not publish that update or close #9 without a separate authorized tracker action.

### Temporary compatibility and the cutover boundary

Use `accounting_version = 1` for existing records and `2` for the package contract. Extend the existing Event/run/session/attempt tables with version constraints rather than creating a second application database. Version 2 never uses the stock ledger, Test attempts, independent allowance or quality corrections.

During #9, the existing UI remains the legacy development UI. Existing creation paths retain version 1 until the coordinated cutover; owner-scoped test fixtures create version-2 Drafts. New handlers/RPCs accept version-2 records only. Legacy handlers/functions reject version-2 records, including direct RPC calls. Legacy start/reservation/Test operations also acquire the shared guard before their existing locks and reject new legacy printer work while a version-2 run is unfinished; test both orderings of a legacy Test request racing a version-2 start. This is a temporary migration boundary, not a selectable product mode or permission to run mixed-version events. The singleton guard blocks version-2 start while any legacy Live Event, unfinished run or unresolved attempt exists.

At #10 cutover, drain the old version, convert eligible never-started Drafts, activate version-2 creation, retire old write paths and switch the screens in one reviewed release. All new Events then use version 2. Historical version-1 records stay readable and immutable. Test and rehearse this boundary in #9; do not activate it on a real deployment here.

## 2. File and interface map

### Reuse and add

| Responsibility                                          | Exact paths                                                                                                                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target DTOs, constants and request schemas              | Create `src/lib/operations/package-contract.ts`, `src/lib/operations/package-validation.ts`                                                                                                               |
| Trusted route/RPC orchestration and projections         | Create `src/lib/operations/package-route.ts`, `src/lib/operations/package-rpc.ts`, `src/lib/operations/package-state.ts`                                                                                  |
| Existing security/parsing primitives                    | Reuse or minimally modify `src/lib/operations/admin-authority.ts`, `booth-authority.ts`, `privileged-client.ts`, `validation.ts`, `responses.ts`, `printer-gate.ts`; retain legacy behavior until cutover |
| Private-media deletion shared by old/new Draft deletion | Create `src/lib/operations/draft-media-cleanup.ts`, `package-draft-deletion.ts`; extract reusable cleanup from `src/lib/operations/event-redaction.ts`                                                    |
| Provisional adapter and safe dispatch primitives        | Create `src/features/booth/printer/contract-v2.ts`, `simulator-v2.ts`, `src/features/booth/print-journal.ts`, `print-dispatch.ts`                                                                         |
| Database                                                | Forward migrations named below; regenerate `src/lib/supabase/database.types.ts` from the local schema                                                                                                     |
| Test fixtures                                           | Reuse `tests/fixtures/local-supabase.ts`; create `tests/fixtures/package-contract.ts`; extend `tests/fixtures/admin-route-server.ts` only where the HTTP harness needs new routes                         |
| Acceptance record                                       | Create `docs/implementation/issue-9-package-contracts-review.md` during Task 11; link actual evidence and the #10 handoff                                                                                 |

The existing `flow.ts`, `booth-client.tsx`, Admin `panel.tsx`, draft form and design assets are #10 integration consumers. Do not rewrite them in this plan. The `*-v2.ts` adapter files avoid changing the old simulator's contract before that handoff; #10 removes the legacy adapter and renames the replacement into the ordinary `contract.ts` / `simulator.ts` paths. Do not maintain two permanent adapters for the two accounting models.

### Migration file allocation

Create each file with `npx supabase migration new <name>` after checking the installed CLI help. Use the generated path `supabase/migrations/<timestamp>_<name>.sql` and record the timestamp in the implementation evidence. Do not edit the 20261014–20261018 applied migrations.

| Name                                | Responsibility                                                         | Task |
| ----------------------------------- | ---------------------------------------------------------------------- | ---- |
| `package_contract_schema`           | Versions, records, constraints, singleton guard and privilege baseline | 2    |
| `package_accounting_operations`     | Capacity, package additions and receipts                               | 3    |
| `package_readiness_operations`      | Fresh observations, readiness predicates and reload requests           | 4    |
| `package_run_access_operations`     | Run/Event transitions and handoff/grant lifecycle                      | 5    |
| `package_guest_dispatch_operations` | Session/capture/reservation/dispatch/reconciliation                    | 6    |
| `package_outcome_operations`        | Outcome evidence, inspection and discrepancies                         | 7    |
| `package_contract_cutover`          | Conversion preflight, legacy snapshots and owner-only activation       | 10   |

Tasks may add their action branches to the version-2 function bodies introduced earlier, using new forward migrations. Keep implementation inside private functions. Public RPC wrappers are thin `SECURITY INVOKER` entry points granted only to `service_role`; explicitly revoke `PUBLIC`, `anon` and ordinary `authenticated` execution. Private privileged implementations use a fixed empty search path with qualified object names and recheck authority. Reuse the existing server-only Supabase client; no new direct PostgreSQL connection layer is needed. Current Supabase guidance distinguishes [function execution privileges](https://supabase.com/docs/guides/database/functions) from [table grants and RLS](https://supabase.com/docs/guides/api/securing-your-api); test both boundaries.

### Shared TypeScript contract

Use these names consistently across schemas, handlers, tests and the #10 handoff:

```ts
export const PRINTS_PER_PACKAGE = 10;
export const MAX_TOTAL_PACKAGES = 214_748_364; // total capacity <= 2_147_483_640
export const READINESS_MAX_AGE_MS = 5_000;
export const STATE_POLL_MS = 2_000;
export const HANDOFF_TTL_MS = 5 * 60_000;
export const GRANT_IDLE_TTL_MS = 24 * 60 * 60_000;
export const LATE_CAPTURE_WINDOW_MS = 2 * 60_000;
export type RunState = 'Prepared' | 'Active' | 'Paused' | 'Finishing' | 'Finished';
export type AttemptState =
  'Reserved' | 'Dispatching' | 'Accepted' | 'Pending' | 'Printed' | 'NotPrinted';
export type PackageCounts = {
  originalPackages: number;
  additionalPackages: number;
  totalBookedPrints: number;
  printed: number;
  unresolved: number;
  printsRemaining: number;
  printsAvailable: number;
};
export type PackageOperationReceipt<T> = {
  operationId: string;
  kind: string;
  committedRevision: number;
  result: T;
};
export type PackageOperationResult<T> = {
  receipt: PackageOperationReceipt<T>;
  revision: number;
  replayed: boolean;
};
export type DispatchAuthorization = {
  attemptId: string;
  dispatchId: string;
  printerId: string;
  connectionGeneration: number;
};
export type DispatchResult = PackageOperationResult<{
  attemptId: string;
  state: AttemptState;
}> &
  ({ sendAllowed: true; authorization: DispatchAuthorization } | { sendAllowed: false });
```

The authorization is returned only by the first committed dispatch call. Do not put it in the replayable receipt or operation lookup. A replay returns `sendAllowed: false`; an interrupted original response is recovered as state, never converted to a second send. All numeric input is finite, integral and bounded; use wider arithmetic for intermediate SQL sums and reject overflow before casting to the existing integer representation. Revision increments also fail safely at their bound. The wire `revision` and `expectedRevision` consistently refer to the Event aggregate revision; all actual run/blocker/generation/capacity/session/attempt changes update that aggregate under its lock. A run may retain its own audit revision, but clients do not guess between two revision domains. Freshness heartbeats, readiness-window issuance and idle-grant renewal alone do not change the aggregate revision.

Define `PackageErrorCode` with exactly the approved codes: `invalid_input`, `access_required`, `operation_forbidden`, `qualification_required`, `stale_revision`, `operation_conflict`, `not_ready`, `print_pending`, `booked_prints_exhausted`, `invalid_transition`, `operation_unavailable`. Map them to the spec's 400/401/403/409/503 statuses. Do not expose raw SQL, credential, device-packet or Client data in errors.

### Database callable interfaces

Use separate, allowlisted operation dispatchers following the existing repository pattern; do not build a general workflow engine:

```sql
private.package_admin_operation(
  p_admin_user_id uuid, p_admin_session_id uuid,
  p_operation text, p_operation_id uuid, p_payload jsonb
) returns jsonb
private.package_booth_operation(
  p_grant_hash text, p_operation text, p_operation_id uuid, p_payload jsonb
) returns jsonb
private.package_issue_handoff(
  p_handoff_id uuid, p_device_hash text, p_operation_id uuid, p_grant_hash text
) returns jsonb
private.package_admin_read(
  p_admin_user_id uuid, p_admin_session_id uuid,
  p_event_id uuid, p_operation_id uuid default null
) returns jsonb
private.package_booth_read(
  p_grant_hash text, p_operation_id uuid default null
) returns jsonb
```

Expose same-named thin `public.package_*` wrappers only to the trusted server role. Each operation branch has a strict action-specific schema in SQL and TypeScript. Server-derived actor IDs, session IDs, grant hashes and evidence policy never come from request JSON. The handoff-issue function uses the bound device and proof of local Admin-session revocation because the original Admin session must already be signed out at that step.

Persist immutable version-2 receipts in the existing receipt table with a unique `(actor_scope, operation_key)` partial index for version 2, including operation kind/route IDs in the normalized payload digest. Reusing a key for a different operation or payload is a conflict. Admin scope is the provisioned user; Booth scope is its originating grant/run. Recheck live authority before receipt replay; check the receipt before rejecting an old expected revision. Keep committed results immutable and expose current state/revision separately where needed.

### HTTP ownership and route mapping

`operationId` is a UUID on every target mutation; IDs in paths are validated opaque UUIDs. Bodies are strict JSON and bounded to the existing 8 KiB limit. All mutations are same-origin POST. State and receipt reads are private/no-store. Literal `[eventId]`, `[attemptId]` and `[sessionId]` below are Next.js directories.

| Handler under `src/app/api/`                               | Private operation / projection                                                    | Owner                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `admin/events/[eventId]/booth/start/route.ts`              | Admin `start`                                                                     | 5, 8                                                            |
| `admin/events/[eventId]/booth/recover-access/route.ts`     | Admin `recover_access`                                                            | 5, 8                                                            |
| `admin/booth-handoffs/[handoffId]/issue/route.ts`          | Bound `package_issue_handoff` after local sign-out                                | 5, 8; adapt existing handler by stored version                  |
| `booth/handoff/confirm/route.ts`                           | Booth `confirm_handoff`, inactive proof allowed only here                         | 5, 8                                                            |
| `admin/events/[eventId]/booth/pause/route.ts`              | Admin `pause`                                                                     | 5, 8                                                            |
| `admin/events/[eventId]/booth/resume/route.ts`             | Admin `resume`                                                                    | 5, 8                                                            |
| `admin/events/[eventId]/booth/finish/route.ts`             | Admin `finish`                                                                    | 5, 8                                                            |
| `admin/events/[eventId]/complete/route.ts`                 | Admin `complete`                                                                  | 5, 8; existing path                                             |
| `admin/events/[eventId]/cancel/route.ts`                   | Admin `cancel`                                                                    | 5, 8; existing path                                             |
| `admin/events/[eventId]/delete-draft/route.ts`             | Admin `begin_delete_draft` / `complete_delete_draft` around private-media cleanup | 5, 8; existing path                                             |
| `admin/events/[eventId]/film-packages/route.ts`            | Admin `add_packages`                                                              | 3, 8                                                            |
| `admin/events/[eventId]/reload-requests/route.ts`          | Admin `request_reload`, the approved explicit reload trigger                      | 4, 8                                                            |
| `admin/events/[eventId]/reload-confirmations/route.ts`     | Admin `confirm_reload`                                                            | 4, 8                                                            |
| `admin/events/[eventId]/review-draft-booking/route.ts`     | Admin `review_draft_booking`, explicit migration booking acknowledgement          | 10                                                              |
| `admin/print-attempts/[attemptId]/recover/route.ts`        | Admin `recover_attempt`                                                           | 6, 8; existing path                                             |
| `admin/print-attempts/[attemptId]/resolve/route.ts`        | Admin `resolve_attempt`                                                           | 7, 8; existing path                                             |
| `booth/sessions/route.ts`                                  | Booth `start_session`                                                             | 6, 8                                                            |
| `booth/captures/route.ts`                                  | Booth `record_capture`                                                            | 6, 8                                                            |
| `booth/sessions/[sessionId]/end/route.ts`                  | Booth `end_session`                                                               | 6, 8                                                            |
| `booth/print-attempts/route.ts`                            | Booth `reserve`                                                                   | 6, 8                                                            |
| `booth/print-attempts/[attemptId]/dispatch/route.ts`       | Booth `dispatch`                                                                  | 6, 8                                                            |
| `booth/print-attempts/[attemptId]/reconcile/route.ts`      | Booth `reconcile`                                                                 | 6, 8                                                            |
| `booth/print-attempts/[attemptId]/observations/route.ts`   | Booth `observe`                                                                   | 7, 8; adapt existing path by originating grant's stored version |
| `booth/readiness/route.ts`                                 | Booth `report_readiness`                                                          | 4, 8                                                            |
| `booth/state/route.ts`                                     | GET `package_booth_read`                                                          | 4, 8                                                            |
| `booth/operations/[operationId]/route.ts`                  | GET scoped receipt                                                                | 8                                                               |
| `admin/events/[eventId]/operations/[operationId]/route.ts` | GET Admin receipt                                                                 | 8                                                               |
| `admin/events/[eventId]/booth/state/route.ts`              | GET authenticated Event setup/recovery projection                                 | 4, 8; transport for the spec's phone Event-page refresh         |

The two supporting Admin actions implement the spec’s explicit reload-request trigger and required legacy Draft booking review. Their shapes are defined in Tasks 4 and 10. Use the spec section 6 request fields and guards for the other rows; the freshness-window fields defined in Task 4 add the transport needed to validate observation age. Existing issue/complete/cancel/delete/recover/resolve/observation paths must select behavior from the authenticated record's stored version, never a client-selected version. They retain `operationKey` parsing only on the version-1 branch. All version-2 routes use `operationId`. Do not infer version from body shape or map old individual-print/quality commands to new package operations.

## 3. Execution preparation

These steps belong to later execution, after plan approval. They have not been run while writing this plan.

- [ ] Confirm the reviewed plan and baseline commit; record `git status --short --branch` and the implementation branch. Keep approved docs/mockups intact.
- [ ] Read required skills and local instructions. Use Ponytail during the work and `ponytail-review` after task groups and at the final review. Use Supabase and its security guidance for database/auth work.
- [ ] Run `npm ci` if dependencies are missing. Read the installed Next.js guides relevant to route handlers, cookies and caching before edits.
- [ ] Inspect `npx supabase --version`, `npx supabase db --help`, `npx supabase migration --help`, `npx supabase gen types --help` and the relevant subcommand help. Confirm the local fixture uses `http://127.0.0.1:55321`; do not print service credentials or reuse a hosted project.
- [ ] Establish exclusive use of the disposable local test database. Stop if another worktree owns it or it contains unreviewed user data; arrange an isolated local instance instead. Do not run an unconditional `db reset`.
- [ ] Record baseline lint/type/unit/integration failures separately from changes. A missing local service is an infrastructure failure, not a useful TDD red result. Do not mark an unrun suite passed.

For each scenario in Tasks 1–10, follow one complete cycle: **write the focused failing test → run and inspect the expected behavior failure → implement only that behavior → rerun to green → review the diff → commit the task's files**. Repeat within a task rather than writing all tests or all implementation upfront. The short examples below fix key assertions; use the shared fixture interfaces rather than creating divergent fixture APIs.

## 4. Implementation tasks

### Task 1 — Encode the target contract and strict request boundaries

**Files:** Create `src/lib/operations/package-contract.ts`, `package-validation.ts`; modify `src/lib/operations/validation.ts` only to reuse its bounded reader without hard-coding `operationKey`; create `tests/unit/package-contract.test.ts`; extend `tests/unit/operation-validation.test.ts` for compatibility.

**Interfaces:** Export the shared types/constants above; `packageCounts(originalPackages: number, additionalPackages: number, printed: number, unresolved: number): PackageCounts`; action-specific Zod schemas using `operationId`. Keep the old schemas validating their own `operationKey`.

- [ ] Write tests for the approved enums, count formulas, legal integer bounds, package note requirements, allowed request fields and exact error mapping. Reject fractional/negative/overflow packages, free print quantities, client-supplied authority/version, photos/base64/raw packets and unknown keys. Original packages may be zero in Draft; additions must be positive.

  ```ts
  expect(packageCounts(5, 0, 49, 1)).toMatchObject({
    totalBookedPrints: 50,
    printsRemaining: 1,
    printsAvailable: 0,
  });
  expect(() => packageCounts(214_748_364, 1, 0, 0)).toThrow();
  ```

- [ ] Run `npm test -- tests/unit/package-contract.test.ts tests/unit/operation-validation.test.ts`. Expect missing target exports or failed target assertions, not parser/fixture setup errors.
- [ ] Implement the DTOs, strict schemas and bounded-parser reuse. Keep `expectedRevision` where required by the spec. Normalize values once for receipt fingerprints; do not normalize changed semantic input into an accidental replay.
- [ ] Rerun the same tests and `npx tsc --noEmit`. Existing legacy request validation must still pass.
- [ ] Review and commit only the listed files: `feat: define package accounting operation contracts`.

### Task 2 — Add versioned records, invariant constraints and restricted access

**Files:** Create generated `package_contract_schema` migration and `tests/fixtures/package-contract.ts`, `tests/integration/package-schema-access.test.ts`; update `tests/fixtures/local-supabase.ts` only for reusable owner-scoped cleanup; regenerate `src/lib/supabase/database.types.ts`. Port direct operational seeding/cleanup in `tests/integration/accounting-ledger.test.ts`, `operational-schema-rls.test.ts`, `event-run-transitions.test.ts`, `guest-reservations.test.ts`, `print-outcomes.test.ts`, `operation-http-auth.test.ts`, `admin-operations-read.test.ts`, `draft-events-dal.test.ts` and `draft-events-rls.test.ts` where privilege removal affects it. Inspect existing browser fixture setup for the same dependency; do not weaken the privilege rule to preserve test shortcuts.

**Interfaces:** `createPackageFixture(options?: { originalPackages?: number }): Promise<PackageFixture>`; fixture methods `admin(operation, payload, operationId?)`, `booth(operation, payload, operationId?)`, `readAdmin()`, `readBooth()`, `dispose()`. The fixture owns a provisioned Admin, metadata-only Event, device/grant identities and returned IDs. Add preparation helpers only as their real operations arrive in later tasks. Setup/cleanup SQL is local-owner-only and scoped to fixture IDs; it is never an application bypass.

- [ ] Write failing schema/privilege tests: legacy backfill is version 1; v2 child records cannot reference a v1 Event/run; only Guest attempts exist in v2; state checks and unique indexes include all four v2 unresolved states as well as unresolved legacy states. Assert one Live Event, one unfinished run per Event, one open session per run and one unresolved attempt globally. Verify normal clients cannot edit lifecycle, version, counts, receipts, grants or attempts, or execute private/accounting RPCs.
- [ ] Run `npm test -- tests/integration/package-schema-access.test.ts`; expect absent version-2 schema/protection assertions.
- [ ] Add version columns, `booking_review_required` and constraints to existing records. Keep a nullable legacy-only independent allowance: version 1 retains its historical value, new version-2 inserts need no allowance input, and version-2 edits cannot set it. Enforce version-2 child/parent matching without preventing converted Drafts from retaining immutable version-1 terminal Test/audit references. Add `additional_film_package_entries`, `booth_reload_requests`, private readiness-window storage and a private singleton `booth_contract_guard` row. The guard is coordination, not film inventory; it stores the active creation version/cutover state. Use global guard → Event → run → attempt/reload lock order in every later mutation. New audit/receipt rows are immutable through application roles. Add shared private authority checks for the provisioned Admin/live Auth session and the version-2 grant binding/capability; test these with owner-seeded records before lifecycle transitions exist. Keep administrative maintenance and setup/cleanup fixture access separate from application roles.
- [ ] Revoke direct operational table writes from the trusted API role as well as ordinary clients; private functions perform those writes. Keep required Admin RLS reads, Profile edits and validated Draft edits. Port existing tests that seed operational rows through `service_role` to the shared local-owner fixture rather than restoring a production write bypass. Preserve validated Draft column writes without letting them set `accounting_version` or lifecycle fields. Test all inherited/default grants and fixed search paths.
- [ ] Run the new suite plus `npm test -- tests/integration/operational-schema-rls.test.ts tests/integration/draft-events-rls.test.ts tests/integration/admin-authorization.test.ts`. Regenerate database types with the installed CLI's documented local command; review the generated diff.
- [ ] Review and commit this migration, fixture/type changes and the affected privilege tests: `feat: add versioned package contract schema and privileges`.

### Task 3 — Make package capacity and receipts transactional

**Files:** Create generated `package_accounting_operations` migration; create `tests/integration/package-accounting.test.ts`; extend `tests/fixtures/package-contract.ts`; regenerate database types if signatures change.

**Interfaces:** `private.package_counts(p_event_id uuid) returns jsonb`; Admin action `add_packages` with `{ eventId, packages, clientRequestNote }`; common receipt helpers used by both operation dispatchers. The package result is `PackageCounts` plus the immutable entry ID.

- [ ] Write failing tests: 5 packages = 50; +1 = +10; no dependency on legacy stock/allowance; Live-only additions including Paused/Finished runs; no edits/refunds/removals; required Client-request note; overflow rejection. Exercise same-key/same-payload, same-key/different-payload, different-kind key reuse, lost-response lookup and two concurrent additions using real database transactions.
- [ ] Run `npm test -- tests/integration/package-accounting.test.ts`; expect missing operation/formula behavior.
- [ ] Implement counts from v2 package entries and attempt states. Do not store a second editable remaining counter. Insert entry, audit and receipt in one transaction under the standard locks; use wide intermediate arithmetic. Fresh authority is checked before replay, receipt before expected-revision guards. Availability never reads `film_stock_balance` or old corrections. Keep package entries immutable even when the Event later ends.
- [ ] Rerun the suite and schema-access tests. Assert exact row/receipt counts after competing requests and after response-loss retries, rather than accepting only a 200 response.
- [ ] Review and commit the migration, tests, fixtures and generated type changes: `feat: implement package capacity and idempotent additions`.

### Task 4 — Separate readiness, reload confirmation and capacity

**Files:** Create generated `package_readiness_operations` migration; create `tests/integration/package-readiness.test.ts`; extend `package-contract.ts`, `package-validation.ts` and the shared fixture.

**Interfaces:** `private.package_readiness(p_event_id uuid, p_stage text, p_attempt_id uuid default null) returns jsonb`; stages `setup`, `guest`, `reserve`, `dispatch`, `resume`. Booth action `report_readiness`; Admin actions `request_reload` and `confirm_reload`. Read projections supply blockers, safe allowed actions, counts and a short-lived `readinessWindowId`. Implement the private state/window helpers in this task against owner-seeded run fixtures; Task 5 connects their grant lifecycle and Task 8 exposes the HTTP reads. Subsequent end-to-end contract tests must also reach these predicates through real start/reserve/dispatch operations.

- [ ] Write failing tests for every stage, especially initial setup without a grant, Resume while Paused and dispatch with its own last hold at zero available. Test camera permission without a live feed, stale/delayed/future-dated reports, connection-generation mismatch, routine heartbeat revision stability, actual blocker revision changes, simultaneous faults, capacity exhaustion and media failure falling back without blocking.
- [ ] Run `npm test -- tests/integration/package-readiness.test.ts`; expect the missing stage predicates and stale-report behavior.
- [ ] Implement a server-issued freshness window in the authenticated setup/state read: an opaque window ID bound to actor/device, Event, run if present and generation. Its server-issued time bounds the observation's age. The client observes after receiving it and submits `readinessWindowId` and nonnegative `observedAgeMs`; reject a window older than 5 seconds, an observation predating it or a different binding. Store the conservative server freshness bound and receipt time. Delayed packets cannot become fresh merely because they arrived now; client wall-clock time never renews readiness. Keep only short-lived windows and do not increment lifecycle revision for issuing them or ordinary fresh heartbeats.
- [ ] Track camera, server reachability, printer connection, idle/old-job safety, load, Guided Access/power and capacity independently. An ordinary same-printer reconnect preserves prior physical-load confirmation while invalidating dynamic printer readiness. Reliable empty/cover/load-change or an Admin reload request creates a scoped reload request and invalidates load confirmation. `request_reload` accepts `{ eventId, runId, printerId, connectionGeneration, expectedRevision, reason }` plus `operationId`; it requires the current unfinished run and records the authenticated actor without changing capacity or any print outcome. Different printer identity requires safely finishing the old run and new setup.
- [ ] Implement `confirm_reload` with `{ eventId, reloadRequestId, printerId, connectionGeneration, expectedRevision }`. Record Admin/time/source; reject stale requests/revisions/generations. Confirmation changes load readiness only, never capacity, attempt outcome, pause or finish. Reconnection updates the current request binding so the phone must refresh before confirming. Test load confirmation and outcome inspection in both orders.
- [ ] Rerun the readiness suite plus accounting/schema suites. Use database-controlled fixture time boundaries, not multi-second sleeps. Assert 5-second and generation boundaries explicitly.
- [ ] Review and commit these files: `feat: enforce stage-specific booth readiness and reload confirmation`.

### Task 5 — Implement run, Event and grant lifecycle transactions

**Files:** Create generated `package_run_access_operations` migration; create `tests/integration/package-lifecycle.test.ts`, `package-grants.test.ts`; extend the shared fixture and generated types.

**Interfaces:** Admin actions `start`, `pause`, `resume`, `finish`, `complete`, `cancel`, `recover_access`, `begin_delete_draft`, `complete_delete_draft`; Booth `confirm_handoff`; dedicated issue function and scoped read functions defined above. Initial/recovery handoffs carry `purpose: 'initial' | 'recovery'`.

- [ ] Write lifecycle tests: start creates Prepared/inactive proof without a Test Print; first activation enters Active; paused recovery activation remains Paused; pause records immediately; finish waits unresolved work and then revokes the grant; finish cannot resume; Complete/Live Cancel require all runs Finished and attempts terminal; a new run on the same Live Event retains counts. Test all terminal Event mutation denials and schedule not controlling transitions.
- [ ] Write grant tests: 5-minute inactive expiry; 24-hour idle renewal while unfinished; missing/expired/revoked proof cannot self-renew; inactive proof cannot admit guests; stale handoff cannot override later pause/finish; recovery revokes old proofs, cancels only known-unsent work and refuses possible output/Finishing/Finished. Replay cannot issue a second grant. A failed initial handoff leaves Paused. Setup confirmations belong to each new run.
- [ ] Run `npm test -- tests/integration/package-lifecycle.test.ts tests/integration/package-grants.test.ts`; expect missing transitions/scope rules.
- [ ] Implement transitions under the common lock order and receipt discipline. State/observation/reconciliation access survives Paused/Finishing; new sessions, reservations and dispatch do not. Preserve explicit pause across every repair. Pending does not prevent recording a pause or finish request; it prevents Resume and final Finish. Finish completion also occurs when the last pending outcome settles later.
- [ ] Implement deletion begin/complete receipts for never-started Drafts only. Keep a cleanup-pending state until private media is removed. Reject legacy unresolved attempts and any Event that has started; keep opaque audit references and never reconstruct previously redacted/deleted data. No v2 redact/past-delete action exists.
- [ ] Rerun both suites plus prior tasks. Add real concurrent start-versus-start and transition-versus-transition cases with explicit barriers; assert state, receipt and grant rows after both finish.
- [ ] Review and commit the migration, fixtures/types and tests: `feat: implement booth lifecycle and scoped grant recovery`.

### Task 6 — Separate session end, reservation, dispatch and reconciliation

**Files:** Create generated `package_guest_dispatch_operations` migration; create `tests/integration/package-dispatch.test.ts`, `package-late-capture.test.ts`; extend the shared fixture/types.

**Interfaces:** Booth actions `start_session`, `record_capture`, `end_session`, `reserve`, `dispatch`, `reconcile`; Admin `recover_attempt`. Use the exact request fields in spec section 6. `dispatch` produces `DispatchResult`; `end_session` is the recovery barrier, not an outcome assertion.

- [ ] Write the essential failing cases one at a time: current acknowledged Capture required; one session/one unresolved attempt; double Print; final available unit; reservation and audit/receipt atomicity; receipt replays; disconnect before dispatch; lost reserve response; delayed reserve after end; lost dispatch response; dispatch replay; concurrent pause/finish/session-end versus dispatch. Session end leaves a possible output unresolved.

  ```ts
  // Fixture helpers call the real private transaction through its restricted RPC.
  const first = await f.booth('dispatch', dispatchInput, operationId);
  const replay = await f.booth('dispatch', dispatchInput, operationId);
  expect(first.sendAllowed).toBe(true);
  expect(replay).toMatchObject({ sendAllowed: false });
  expect(await f.readBooth()).toMatchObject({ counts: { printsAvailable: 0 } });
  ```

- [ ] Run `npm test -- tests/integration/package-dispatch.test.ts tests/integration/package-late-capture.test.ts`; expect missing boundary behavior.
- [ ] Implement atomic reserve and separate dispatch. Record a unique dispatch identity before returning the first send authorization. If a stop/session end wins the lock, dispatch is denied and the Reserved hold can end NotPrinted. If dispatch wins, preserve the physical possibility; never claim immediate cancellation. A repeat or receipt lookup contains no send authorization.
- [ ] Implement recovery: close the old session under the same locks first, then look up its reservation receipt/attempt and reconcile. Reserved with no dispatch history becomes NotPrinted; possible delivery becomes/stays Pending; terminals stay unchanged. Absence of an operation receipt alone is never proof of no delayed reservation. Admin recover follows the same rule and does not automatically revoke the grant.
- [ ] Implement idempotent completed-shutter metadata and the 2-minute late exception: original otherwise-unexpired proof, matching ended session, shutter before stop, no new shutter afterward. That proof cannot read state, renew, reserve, dispatch or report outcomes. Capture-only reconciliation never reopens the session. A lost journal cannot invent a Capture.
- [ ] Rerun both suites and lifecycle/readiness tests. Use two real competing connections to force both lock orderings. Assert the held unit, unresolved slot, session state, capture count and receipt, not only response status.
- [ ] Review and commit these files: `feat: separate print reservation dispatch and recovery`.

### Task 7 — Resolve physical outcomes exactly once

**Files:** Create generated `package_outcome_operations` migration; create `tests/integration/package-outcomes.test.ts`; extend target schemas, fixture and types.

**Interfaces:** Booth `observe` accepts `observationId`, correlated attempt, kind, evidence version/generation and strict safe metadata. Admin `resolve_attempt` accepts `outcome: 'printed' | 'not_printed'`, `inspectionReason`, `oldJobCleared`, `expectedRevision`. Resolution is for Pending only.

- [ ] Write failing cases for all seven observation kinds: `definitely_not_sent`, `command_accepted`, `full_ejection_confirmed`, `no_film_rejected`, `outcome_unknown`, `connection_changed`, `ready_for_new_job`. Acceptance does not count; ejection counts once; no-film ends NotPrinted only under a qualified attempt-specific no-output policy; otherwise Pending. Raw status/counter/time is never an outcome. Test Printed from Dispatching without an intermediate acceptance report.
- [ ] Run `npm test -- tests/integration/package-outcomes.test.ts`; expect missing outcome transitions/policy checks.
- [ ] Implement immutable terminal transitions, evidence/audit and receipts in one transaction. Same observation/outcome replay is idempotent. New conflicting later evidence is retained as a discrepancy and blocks the affected run without rewriting/refunding the terminal result; do not throw an exception that rolls back the discrepancy record. Reject wrong attempt/run/generation or unqualified evidence. Cross-connection correlation is accepted only by a specifically qualified policy; absent one, remain Pending.
- [ ] Implement phone inspection with actor/reason and live Admin authorization. Printed records full ejection regardless of quality; it does not itself prove readiness for a new job. Not printed requires established no output and old-job clearing under an allowed recovery procedure. If neither is established, keep Pending. Loading or reconnecting cannot substitute for inspection. Block new work until qualified idle/old-job safety is established even after the outcome becomes terminal.
- [ ] Test simultaneous adapter/phone resolutions, a finish waiting for the last outcome, a paused run receiving outcome evidence, package exhaustion after Printed, release of one unit after NotPrinted and independent reload confirmation. Concurrent compatible results count once; conflicting results preserve the first terminal and discrepancy.
- [ ] Rerun the outcomes suite and all prior package integration suites. Confirm simulated inspection/evidence is allowed only in the isolated simulator environment; real policies remain disabled.
- [ ] Review and commit these files: `feat: record qualified print outcomes and inspected recovery`.

### Task 8 — Wire the complete narrow HTTP and access surface

**Files:** Create/modify every route assigned to Task 8 in the route table; the booking-review route arrives with Task 10; create `package-route.ts`, `package-rpc.ts`, `package-state.ts`, `draft-media-cleanup.ts`, `package-draft-deletion.ts`; minimally modify the listed shared auth/parser/gate files and `event-redaction.ts`; create `tests/integration/package-http-contracts.test.ts`, `package-http-access.test.ts`, `package-draft-deletion.test.ts`; extend `tests/fixtures/admin-route-server.ts`.

**Interfaces:** `runPackageAdminOperation(request, eventOrAttemptId, action, schema)` and `runPackageBoothOperation(request, resourceId, action, schema)` call the restricted RPCs with server-derived authority; action unions are closed. State/receipt functions return validated DTO projections. Ordinary Booth handlers cannot call Admin branches.

- [ ] Add a table-driven contract test for **every Task 8** route-table row (Task 10 adds its booking-review cases): authorized request/result/receipt, strict input, wrong actor, resource ownership, replay and error status. Test the special inactive-handoff and late-capture capabilities separately. Every mutation gets origin/body-size tests; every read gets scope/no-store tests.
- [ ] Run `npm test -- tests/integration/package-http-contracts.test.ts tests/integration/package-http-access.test.ts tests/integration/package-draft-deletion.test.ts`; expect missing handlers or incorrect target contracts.
- [ ] Wire thin handlers, reusing the provisioned Admin/live-session check, grant hashing, trusted deployment-origin validation and server-only Supabase client. SQL rechecks current authorization inside the transaction, including before replay. Select a shared route's legacy/target branch from its authenticated stored record. Reject unknown operations, obsolete commands against v2 and caller-selected version/actor fields.
- [ ] Finish the handoff transport: issue only to the bound setup device after local Admin-session revocation; clear that iPad's Admin cookies; set inactive `__Host-booth-grant` Secure/HttpOnly/SameSite cookie; consume the single-use reference on confirmation. Test another Admin phone session survives and failure leaves Paused. The #10 client removes the opaque URL reference immediately and never logs it. Do not return raw grant secrets in JSON, receipts or logs.
- [ ] Expose sanitized Booth state and its own receipts, including Paused/Finishing recovery. Admin reads include event-specific reload requests and pending attempts for the phone panel. No Client details or global history in Booth responses. A recognized Finished proof may return only a neutral finished marker with no Event/contact identifiers and no renewal; missing/unknown/expired access otherwise returns the approved access-ended response. Test that this terminal marker cannot be used to regain state access. State includes the priority and allowed local recovery actions from the spec; failed reachability is handled by the client as a blocker, not guessed Wi-Fi diagnosis.
- [ ] Extract/reuse bounded, paginated private-media cleanup. Test partial storage failure, repeated deletion, cleanup of all objects beyond one page, opaque retained audit and terminal/Live deletion denial. Never report Draft deletion complete before storage removal succeeds.
- [ ] Test revoked-but-unexpired Admin JWT, password reset leaving an otherwise-valid Booth grant intact, replacement/expired grants, forged cross-Event IDs, arbitrary terminal observation assertions, `operation_conflict`, stale revision and ambiguous 503. A simulated commit followed by a lost response is recovered through the original receipt with no new operation ID.
- [ ] Rerun the three suites and existing `operation-http-auth`, `admin-auth-actions`, `admin-authorization`, `draft-events-rls` and `redaction-and-deletion` regression suites. Legacy fixture changes must preserve their historical assertions, not conceal changed permissions.
- [ ] Review and commit the exact handler/helper/test paths in the task: `feat: expose package contracts through trusted handlers`.

### Task 9 — Build the provisional simulator and durable one-send boundary

**Files:** Create `src/features/booth/printer/contract-v2.ts`, `simulator-v2.ts`, `src/features/booth/print-journal.ts`, `print-dispatch.ts`; extend `src/lib/operations/printer-gate.ts`; create `tests/unit/package-printer.test.ts`, `package-print-journal.test.ts`, `package-print-dispatch.test.ts`. Existing `flow.ts` and screens remain #10 consumers.

**Interfaces:**

```ts
interface PrinterAdapterV2 {
  connect(expectedPrinterId?: string): Promise<PrinterReadinessSnapshot>;
  readReadiness(): Promise<PrinterReadinessSnapshot>;
  observe(listener: (observation: PrinterObservationV2) => void): () => void;
  sendOnce(authorization: DispatchAuthorization, image: Uint8Array): Promise<void>;
}
interface BoothMetadataJournal {
  putOperation(entry: JournalEntry): void;
  readOperations(): readonly JournalEntry[];
  acknowledgeOperation(operationId: string): void;
}
// Dependencies are explicit and injectable; the helper renders no UI.
async function dispatchReservedAttempt(
  input: DispatchInput,
  deps: DispatchDependencies
): Promise<void>;
```

`PrinterReadinessSnapshot` carries safe printer identity, connection generation, connected/ready status and observation age. `PrinterObservationV2` is a discriminated union of the seven approved kinds with observation ID, adapter/evidence-policy version and generation; outcome kinds require attempt/dispatch correlation. Connection/ready observations cannot themselves complete an attempt. `JournalEntry` is a strict discriminated metadata record for capture, reservation, dispatch intent or unacknowledged observation. It contains only IDs, phases, safe evidence and timestamps, never an authorization to resend. Define the concrete unions alongside these interfaces before implementing their callers.

- [ ] Write tests for deterministic separated acceptance/ejection, rejection, unknown, disconnect, delayed feedback, generation changes and ready-for-new-job. Returning from `sendOnce` is not success. No cancellation capability is claimed after possible delivery. Retrying the same authorization never invokes the underlying physical-write callback twice.
- [ ] Run `npm test -- tests/unit/package-printer.test.ts tests/unit/package-print-journal.test.ts tests/unit/package-print-dispatch.test.ts`; expect missing replacement interfaces/one-send behavior.
- [ ] Implement the simulator with explicit test controls to emit each observation and count transport calls. It retains metadata only and releases image references when sending finishes. Preserve the old simulator unchanged until #10 migrates its consumers. The server derives an evidence policy bound to the grant/run; a client `simulated: false` or arbitrary version cannot bypass the production gate.
- [ ] Implement journaling before reservation and before an authorized write. The dispatch helper requires the live first-response authorization, current local readiness and a successful journal write/read-back before calling the adapter. An in-process barrier plus persisted intent prevents concurrent duplicate calls and restart resends. A response replay is status-only. Journal corruption, missing journal after dispatch or ambiguous write failure goes to reconciliation/Pending, never an inferred no-send.
- [ ] Test quota/read failures and process restart at every boundary: before reserve, reserve response lost, before dispatch, dispatch response lost, after authorization/before physical write, accepted before observation acknowledgement, and ejection while offline. Retain safe evidence until server acknowledgement; discard it after acknowledgement. A fault ends interaction and prevents reuse of the old image; bytes already needed by an authorized transport can survive only until that transport releases them.
- [ ] Test production gate negative cases directly: simulator enabled in environment is insufficient in production; fake physical full-ejection evidence is rejected; no-film/counter/status guesses cannot count; normal success cannot be replaced by an Admin action. Rerun the new suites and existing `tests/unit/booth-printer.test.ts` / `booth-flow.test.ts` to protect the temporary legacy consumer.
- [ ] Review and commit these files: `feat: add provisional printer and one-send dispatch contracts`.

### Task 10 — Rehearse legacy conversion and retirement guards locally

**Files:** Create generated `package_contract_cutover` migration, `tests/integration/package-migration.test.ts` and `src/app/api/admin/events/[eventId]/review-draft-booking/route.ts`; extend `package-validation.ts`, `package-rpc.ts`, `tests/integration/package-http-contracts.test.ts`, `package-http-access.test.ts` and `tests/fixtures/package-contract.ts`; add the migration procedure/evidence section to `docs/implementation/issue-9-package-contracts-review.md` when that record is created. Do not edit approved behavior documents to suit an easier migration.

**Interfaces:** Owner-only `private.package_cutover_preflight() returns jsonb` and `private.activate_package_accounting() returns jsonb`. Neither is exposed through the application or ordinary service RPC. The preflight reports blocking legacy work, immutable-history checks and Drafts requiring booking review. Activation takes the global guard first and rechecks the entire preflight in its transaction.

- [ ] Write failing conversion fixtures for: unresolved old attempt; unfinished old run; finished-but-Live old Event; Completed/Cancelled records with old refund/Test/stock history; never-started Draft with matching count and linked terminal legacy Test records; version-2 Draft creation without an independent allowance; Draft with independent-count mismatch or out-of-range packages; already redacted/deleted data; old browser/API/RPC mutation after activation. Use a disposable database/transaction fixture that restores only its own test state, not a shared database reset.
- [ ] Run `npm test -- tests/integration/package-migration.test.ts`; expect missing conversion/retirement guards.
- [ ] Implement a read-only preflight and atomic owner activation. Block new starts during conversion; require every legacy run finished, legacy attempt resolved and Live Event completed/cancelled under its old contract. Preserve terminal legacy accounting snapshots and original audit rows without reinterpreting refunds/stock/tests as v2 counts. Reject activation while any blocker exists; never force unknown to NotPrinted.
- [ ] Convert only eligible never-started Drafts. Derive future capacity from package count. Store a `booking_review_required` flag and the proposed/original comparison when the independent old count differs or the package value needs correction. A trusted, authenticated `review_draft_booking` operation accepts `{ eventId, expectedRevision, acknowledgedPackages }` plus `operationId`. It requires a never-started version-2 Draft and acknowledgement equal to its current valid package count; it records the actor, proposed capacity and receipt before clearing the review flag. A later package-count edit on a converted Draft with a review flag already cleared requires another acknowledgement; `start` rejects an outstanding flag. #10 supplies that review UI. No guess converts old extra prints into purchased packages. Preserve terminal version-1 Test/audit rows linked to converted Drafts as historical references excluded from all version-2 counts. Add route-level authorization, changed-payload replay and stale-acknowledgement tests for the booking-review endpoint.
- [ ] Set new creation to version 2, remove client INSERT/UPDATE privileges for the legacy independent allowance and deny all retired write paths at activation, including stock, test-output, wasted-film, redaction, legacy handoff/guest dispatch and terminal mutation RPCs. New v2 lifecycle/inspection paths remain available. Keep historical reads and safe Draft deletion. Test denial below HTTP as well as through old route calls; a stale browser cannot bypass retirement.
- [ ] Rehearse preservation and recovery on disposable fixtures. Before activation, the old application can still finish old work; after new v2 writes exist, application rollback must not resume old accounting. Use maintenance/unavailable and a reviewed forward fix, or restore only a verified pre-cutover backup when no new writes exist. Do not generate a destructive down-migration or drop evidence.
- [ ] Rerun the migration suite with a before/after snapshot comparison, all package integration suites and legacy regression suites outside the temporary activated test transaction. Record exact inputs, preserved totals, denied operations and limitations.
- [ ] Review and commit these files: `feat: guard package accounting conversion and legacy retirement`.

### Task 11 — Review #9 against the approved spec and record the #10 handoff

**Files:** Create/complete `docs/implementation/issue-9-package-contracts-review.md`; update this plan's execution checkboxes only for work actually performed. Refresh implementation-status text and evidence links in `README.md`, `PRD.md`, `ARCHITECTURE.md`, `docs/README.md`, `docs/documentation-review.md`, the approved spec's status/section 8, and the software-only section of `docs/qualification/booth-recovery-proof-checklist.md` to distinguish completed #9 contracts from pending #10 integration. Preserve approved behavior and all unproven physical checkboxes. Make code/test fixes only in their owning task files with a failing regression test first. Any newly discovered durable decision requires the focused-question/ADR/documentation workflow; do not invent a policy during review.

- [x] Assemble a requirement-to-test matrix covering every spec section and every route-table row. Add cross-boundary tests in the owning package suites for any missing case, particularly overlapping faults, both remote-stop/dispatch orderings, lost-response recovery, 49 Printed + 1 Pending, stale load confirmation after another reconnect, same-run access replacement and terminal late capture.
- [x] Run the full `npm test` suite with the isolated local database, then `npm run lint`, `npx tsc --noEmit`, `npm run build` and `npm run format:check`. Run the existing affected Playwright suites as regressions using `npm run test:e2e`, `npx playwright test --config playwright.booth.config.ts` and `npx playwright test --config playwright.admin-booth.config.ts` with their documented fixtures. Those legacy UI checks do not verify the new #10 screens. Do not silently change production gates to make browser tests run. The [record](../../implementation/issue-9-package-contracts-review.md#task-11-verification-log-2026-10-22) retains the first Admin Booth timeout and initial Turbopack failures before passing reruns.
- [x] Request independent **spec-compliance review** and **code-quality review**, and run **`ponytail-review`** on the complete diff. Check the five Review Focus failure classes and the actual issue #9 contract-test obligations. Resolve actionable findings with targeted TDD and rerun affected checks. Record residual issues explicitly; do not label a partial or infrastructure-blocked suite as passed.
- [x] Record the commit range, exact commands/results, schema/privilege matrix, endpoint coverage, migration rehearsal evidence and any scoped implementation deviations. Separate **implemented and tested**, **#10 integration remaining**, and **#17/#7 physically unproven**. No old simulator demo or screenshot counts as physical qualification.
- [x] Reconcile active documentation status with the actual result. Do not leave a blanket claim that all code still implements only the old contract once version-2 contracts exist; equally, do not describe the approved screens or physical product as implemented. Link the acceptance record from the documentation index and retain historical review records with their original dates.
- [x] Compare the review result with #9's completion definition. Contracts have no undefined legal transition or unauthorized escape; duplicate/concurrent/recovery scenarios pass; acceptance/ejection/unknown remain distinct; real hardware gates stay closed. Keep #9 open if required contract tests or findings remain. Prepare an issue update locally if useful; publishing/closing is a separate authorized action.
- [x] Review and commit the acceptance record and completed plan tracking with message `docs: record issue 9 contract verification and issue 10 handoff`. Report what remains before any merge/promotion request.

## 5. Issue #10 handoff outline — not an execution plan yet

After #9 review, split #10 into focused implementation work before claiming it complete. For current #10 work, use the [main plan’s screen reference](2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract) and [routes/flowchart](../../booth-user-flow.md). Preserve the approved consistent Admin visual language. Use Superpowers TDD and Ponytail again; do not redesign while wiring the contract.

| Work package                                 | Existing consumers to update                                                                                                             | Acceptance                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin Drafts, packages and history           | `src/features/admin/events/draft-event.schema.ts`, `draft-form.tsx`, `actions.ts`; `src/lib/events/drafts.ts`, `history.ts`; Event pages | Package-derived capacity, explicit legacy booking review, additional whole packages with request note; Draft deletion only; retained terminal history; no editable allowance, stock, individual extra prints, redaction or quality refund controls                                               |
| Setup and phone operation                    | `src/features/admin/operations/panel.tsx`, `read.ts`, `types.ts`; `src/features/booth/entry.tsx`; Event detail/setup pages               | Reminder only, no Test Print button/gate; all equipment confirmations; initial handoff; 2-second phone refresh; separate pause/resume/finish/complete; load request/confirmation and exceptional inspected outcome on phone                                                                      |
| Guest journey and privacy                    | `src/features/booth/flow.ts`, `booth-client.tsx`, `camera.ts`, `booth.module.css`                                                        | Montage/background/default welcome with Start; camera/Take Photo; 3–2–1; matching crop/unmirrored review with Retake/Print; real preparation/sending/waiting; complete only after ejection plus server acknowledgement; 3-second completion; 75/90-second warning/timeout in capture/review only |
| Recovery orchestration                       | Same Booth consumers plus #9 journal/dispatch/adapter primitives                                                                         | Discard old session/photo; reconcile before new guest; Bluetooth has only Connect to Instax; camera Enable Camera; correct offline vs unknown-connectivity copy; reload keeps valid Booth access; explicit pause survives every repair; Finished has Sign in; no local guest Admin exit gesture  |
| Media, accessibility and responsive review   | Existing media helpers and approved screen components                                                                                    | Private validated Event Media and short-lived URLs; fallback on optional-media failure; video pause/reduced-motion behavior; accessible actions/focus/status; consistent Admin on phone/desktop and Booth on iPad                                                                                |
| Application cutover and browser verification | Old operation routes/RPC consumers, creation path, legacy adapter files, component/e2e suites                                            | Switch all consumers to v2, remove temporary compatibility imports and retired write controls together, invoke reviewed conversion only after the gate passes, deny old browser mutations, verify phone/iPad scenarios and retained history                                                      |

### Required #10 end-to-end scenarios

1. Initial Admin setup and local sign-out; phone session survives; Booth starts without an in-app test operation.
2. Happy guest flow, Retake, abandoned capture metadata and privacy cleanup; success is never shown on command acceptance.
3. Exhaust 50 booked prints, block welcome admission, add one package on the phone, and allow a fresh guest only after all equipment checks pass.
4. No-film recovery with physical-load confirmation, both with a known result and an exceptional Pending result. Confirmation never adds booked capacity or blanket-rejects attempts.
5. Bluetooth, camera, offline internet, unknown server connectivity and page reload before/after dispatch; no automatic resend or old-photo reuse.
6. Pause/Resume/Finish from the phone during preview, countdown, Reserved, Dispatching and Pending; settle old work, then finish the run before completing/cancelling the Event.
7. Grant expiry/replacement and failed handoff; recovery remains Paused; routine faults keep the iPad signed out in Booth Mode.
8. Combined faults, denied chooser/camera permission, stale confirmation, idle/old-job uncertainty, optional montage failure, legacy Draft review and immutable terminal history.

These are simulated/browser acceptance until #17/#7 supply hardware evidence. Actual printer identity, disconnect timing, old-job clearing and Guided Access cannot be signed off from Chromium tests alone.

## 6. Physical evidence and release checklist handoff

The authoritative checklist is [booth-recovery-proof-checklist.md](../../qualification/booth-recovery-proof-checklist.md); preserve its current evidence statuses. This plan creates software tests, not new physical proof.

- [ ] #17 proves normal automatic full-ejection correlation and the complete required fresh-film sequence. A counter, acknowledgement or delay is insufficient.
- [ ] #17 establishes either reliable no-film rejection or the documented generic-fault/inspection fallback; proves manual loading/confirmation, safe ready/idle and that an old job cannot print later. Automatic reload detection remains optional.
- [ ] #17 exercises Bluetooth/internet/crash boundaries, camera loss, inspected Printed/Not printed, package exhaustion/addition, reload and remote pause/finish cases with actual equipment and retained safe evidence.
- [ ] #7 verifies the integrated product on the actual iPad/Bluefy/Guided Access configuration and release build after the necessary #17 capabilities pass.
- [ ] A later reviewed release-policy change enables only qualified capabilities and records their adapter/evidence version. Until then, real printer-backed Booth Mode and physical Confirmed Print accounting remain disabled.

## 7. Plan self-review and approval checkpoint

Self-review of the written plan checks scope, file/interface consistency, complete route coverage, migration safety, test ownership and the #10/hardware separation. It does not substitute for later code review or testing.

- [x] Approved scope is detailed #9 work with a #10 handoff, not full UI implementation.
- [x] All spec section 6 mutation/read contracts have an owning task and HTTP mapping; the existing handoff issue transport is explicitly retained.
- [x] Accounting, stage-specific readiness, dispatch races, access recovery, late capture, terminal evidence, privacy and legacy conversion have named tests.
- [x] Ponytail, TDD and task/final reviews are explicit execution requirements.
- [x] Real-printer and actual-iPad gates remain open; no simulator result is presented as physical proof.
- [x] User reviewed and approved this implementation plan before execution begins.

**Planning checkpoint:** The approved documentation baseline is `a21f008`. The user approved this plan and requested its commit before implementation. No application code, migration, dependency or test was changed or executed while drafting it.
