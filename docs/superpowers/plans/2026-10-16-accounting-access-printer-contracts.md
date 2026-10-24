# Accounting, Access, and Provisional Printer Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved issue #9 accounting, access, and provisional printer contracts with a simulated Booth flow, while keeping real printer-backed operation behind the #17 checkpoint.

**Architecture:** Postgres functions own all accounting transitions and commit their ledgers, holds, idempotency receipts, and activity together. Next.js Route Handlers verify Admin or Booth authority and call those functions with a server-only client. The `/booth` page holds photos in browser memory, drives a replaceable simulated printer adapter, and never treats command acceptance as physical ejection.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript, Supabase Auth/Postgres/RLS/Storage, Zod 4, Vitest, React Testing Library, Playwright.

**Spec:** [Approved accounting, access, and provisional printer contract](../specs/2026-10-16-accounting-access-printer-contracts-design.md); the page route is fixed separately by [ADR-0023](../../adr/0023-use-a-single-booth-page-route.md).

## Global Constraints

- The existing provisioned Admin account, Draft validation, and active Auth-session check remain authoritative. Direct Admin RLS writes remain limited to Draft fields; all operational mutations use server-invoked, database-validated functions.
- There is at most one Live Event, one unresolved printer attempt, one open Guest Session per run, and one unresolved attempt per Guest Session.
- All persistent IDs and operation keys are UUIDs. A replay with the same normalized input returns the committed result; key reuse with changed input returns `idempotency_conflict`.
- A Guest photo remains in browser memory and is sent only to the printer adapter. No API, database row, log, idempotency receipt, or test artifact stores photo bytes.
- An unresolved Guest attempt holds one allowance unit and one sheet; a Test attempt holds only one sheet. An Uncertain Print keeps its holds and the printer slot until Admin inspection resolves it with a reason.
- Stock entries are append-only. Only ejected Guest or Test attempts consume a sheet. Wasted Film restores guest allowance but never stock or the closed Guest Session. Printer-reported Film Remaining is diagnostic only.
- The browser never automatically resends an uncertain attempt. A clear unused result permits only an explicit new attempt while the run is Active and ready.
- `/booth` has no Event ID in its URL. A valid, activated Booth grant selects the Event/run; absent or invalid grants show neutral paused/sign-in content without Event, Client, or printer details.
- The simulator may exercise `physicalEjectionVerified` in development and tests. Production printer-backed Live Booth Mode, Test Prints, stock consumption, and Confirmed Print accounting stay disabled until a separate, physically validated #17 completion decision. The actual iPad trial remains a further release gate.
- Before code changes, read the relevant installed `node_modules/next/dist/docs/` guides and current Supabase changelog/docs. Use a local Supabase stack for database tests; stage remote migrations before production. Read `DESIGN_SYSTEM.md` before UI work.

## Review Focus

- A lost response followed by the same operation key must return the original result without a second ledger entry; Tasks 2, 4, 5, and 6 test this.
- A pause racing the last available reservation must produce exactly one valid ordering and no send after a committed stop; Tasks 3, 4, and 9 test this.
- An Auth JWT whose session was revoked must fail at the handler and the database function, even if it has not expired; Tasks 1 and 7 test this.
- A reload after reservation must become Uncertain unless the live browser proves the command never started; Tasks 5 and 10 test this.
- A failed media deletion must leave redaction/deletion visibly pending and never restore identifying fields; Task 11 tests this.

---

## File structure and delivery order

The migration names below are descriptions, not invented timestamps: create each actual migration with the installed Supabase CLI. The first six tasks form the transactional core; the later tasks expose and exercise it. Each task commits one independently reviewable slice.

| Unit | Files and responsibility |
| --- | --- |
| Schema and privilege boundary | `supabase/migrations/*_operational_schema.sql`, `*_accounting_operations.sql`, `*_booth_operations.sql`, `*_redaction_operations.sql`; extend `events`, add operational tables, constraints, RLS/grants, and restricted transition functions. |
| Server contract | `src/lib/operations/types.ts`, `validation.ts`, `responses.ts`, `privileged-client.ts`, `admin-authority.ts`, `booth-authority.ts`; exact response/error shapes, input parsing, and authority checks. |
| Route Handlers | `src/app/api/admin/**/route.ts` and `src/app/api/booth/**/route.ts`; thin HTTP adapters to the restricted database functions. Route inventory is in Tasks 7 and 8. |
| Browser printer boundary | `src/features/booth/printer/contract.ts` and `simulator.ts`; one-send rule and typed observations. A real Event printer adapter belongs to the later #17 decision. |
| Pages | `src/app/(admin)/events/[eventId]/page.tsx`, `src/app/booth/page.tsx`, and focused components under `src/features/admin/operations/` and `src/features/booth/`; Admin controls and the Guest journey. |
| Evidence | Focused `tests/unit/`, `tests/integration/`, `tests/components/`, and `tests/e2e/` files named in each task; simulated tests never count as #17 physical evidence. |

### Task 1: Operational schema and direct-access boundary

**Files:** Create the operational schema migration; modify `supabase/migrations/20261014053345_draft_events.sql` only if a new forward migration cannot preserve its existing history (normally leave it intact); create `tests/integration/operational-schema-rls.test.ts`.

**Interfaces:** Extend `public.events` to admit `Draft`, `Live`, `Completed`, `Cancelled`, revision, and deleted-Draft tombstones while retaining visible Draft validation. Add `booth_runs`, `booth_grants`, `guest_sessions`, `captures`, `print_attempts`, `print_attempt_events`, `additional_print_entries`, `film_stock_entries`, `film_stock_balance`, `activity_events`, and `operation_receipts`. `operation_receipts` has unique `(actor_scope, operation_kind, operation_key)`, normalized-input digest, and non-photo result. Partial unique indexes enforce the four singleton rules in Global Constraints.

- [ ] **Write the failing integration test:** `operational-schema-rls.test.ts` asserts the listed tables and indexes exist; `anon` and `authenticated` cannot directly insert/update/delete operational rows or change `events.state`; a live provisioned Admin can still read permitted rows and create/edit a visible Draft; revoked sessions cannot read; tombstones are excluded from visible Event reads. Check a direct PostgREST request as well as SQL metadata.
- [ ] **Run it and see the expected missing-schema/privilege failures:** `npm test -- tests/integration/operational-schema-rls.test.ts`.
- [ ] **Implement the migration:** make Event identity fields nullable only under `deleted_at`, keep Draft validation for visible rows, enable RLS on every exposed table, revoke default broad table/function grants, add FKs/checks/partial indexes, and initialize the singleton stock-balance row. Generated `src/lib/supabase/database.types.ts` must reflect the final schema without exposing a privileged key.
- [ ] **Run the focused test, Supabase advisors, and type check; commit** the schema boundary. Expected: the browser roles have no accounting write path and prior Draft behavior still passes.

### Task 2: Stock and allowance ledger operations

**Files:** Create the accounting-operations migration and `tests/integration/accounting-ledger.test.ts`.

**Interfaces:** Restricted RPCs `public.add_film_stock(admin_user_id, admin_session_id, operation_key, sheets, reason)`, `public.reconcile_film_stock(admin_user_id, admin_session_id, operation_key, observed_sheets, reason)`, and `public.add_event_prints(admin_user_id, admin_session_id, event_id, operation_key, quantity)`. Each checks the provisioned Admin and live `auth.sessions` row itself, writes an activity entry and an operation receipt, and returns entry ID plus current totals. `reconcile_film_stock` records `observed_sheets - on_hand` even when zero and refuses any unresolved Film Reservation.

- [ ] **Write failing tests:** positive addition raises both ledger sum and on-hand once; zero/negative addition fails; nonnegative reconciliation writes the signed difference and reason; zero-difference observation remains in history; reconciliation with a pending Film Reservation fails; duplicate key and same input returns the same entry; changed input returns `idempotency_conflict`; revoked Admin and direct browser-role RPC calls fail.
- [ ] **Run:** `npm test -- tests/integration/accounting-ledger.test.ts`; expect missing RPCs.
- [ ] **Implement:** use the fixed Event-then-stock lock order when an Event is involved and stock-only lock for additions/reconciliation. Keep the stock read model equal to the sum of stock entries in the same transaction. Revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`, granting only the server role; pin the function `search_path`.
- [ ] **Run** the focused test and database advisors; **commit** the ledger operations.

### Task 3: Event and Booth run lifecycle

**Files:** Extend the booth-operations migration; create `tests/integration/event-run-transitions.test.ts`.

**Interfaces:** Restricted RPCs `public.prepare_booth_handoff(admin_user_id, admin_session_id, event_id, expected_revision, operation_key, connection_id, setup_evidence)` and `public.change_event_run(admin_user_id, admin_session_id, event_id, expected_revision, operation_key, action)` where `action` is `pause`, `complete`, or `cancel`. A separate `public.finish_booth_handoff(handoff_id, device_token_hash, operation_key, grant_hash, expires_at)` prepares the inactive grant after local sign-out; `public.confirm_booth_handoff(handoff_id, grant_hash, operation_key)` activates it. Prepared handoff expiry/failure commits Paused and revokes the inactive grant. Readiness is derived, not an Event state.

- [ ] **Write failing tests:** Draft starts Live only when setup evidence, a seeded usable Test Print for the current connection, positive allowance/stock, and no other Live Event exist; start creates `Prepared` with no Guest access; activation requires the one-use bound handoff; expiry/sign-out failure results in `Paused`; pause moves `Active` to `PauseRequested` immediately and later to `Paused` after a seeded pending attempt resolves; completion/cancellation require no holds; stale revision returns `state_conflict`; terminal Events cannot resume; replay does not create another run/grant. Tasks 4 and 6 supply the normal attempt paths; this task uses privileged local fixtures for them.
- [ ] **Run:** `npm test -- tests/integration/event-run-transitions.test.ts`; expect missing transitions.
- [ ] **Implement:** use Event row lock before stock/attempt checks, a finite handoff/grant expiry, single Live Event index, and transition journal/activity entries. `finish_booth_handoff` checks the bound original Auth session is no longer live before issuing a grant. A resumed Live Event receives a new run grant and opens at welcome only after explicit Admin action and confirmation.
- [ ] **Run** the focused test and database advisors; **commit** the lifecycle operations.

### Task 4: Guest Session, Capture, and reservation transactions

**Files:** Extend the booth-operations migration; create `tests/integration/guest-reservations.test.ts`.

**Interfaces:** Restricted RPCs `public.open_guest_session(grant_hash, run_id, operation_key)`, `public.record_capture(grant_hash, session_id, operation_key, captured_at)`, `public.abandon_guest_session(grant_hash, session_id, operation_key)`, and `public.reserve_guest_attempt(grant_hash, run_id, session_id, capture_id, operation_key)`. A reservation creates one Guest attempt and its allowance/film holds before Bluetooth send, and returns an attempt ID and derived availability. No function accepts photo bytes.

- [ ] **Write failing tests:** one active session per run; one metadata Capture per shutter key, including Retakes; only acknowledged same-session Capture can reserve; zero allowance/stock and a busy printer reject reservation; simultaneous requests for the last allowance unit, last sheet, and printer slot admit exactly one; an earlier pause blocks reservation and an earlier reservation delays pause completion; same-key retry returns the same attempt; changed input conflicts; wrong Event/run grant and expired/revoked grant fail.
- [ ] **Run:** `npm test -- tests/integration/guest-reservations.test.ts`; expect missing RPCs.
- [ ] **Implement:** lock Event, stock-balance, then session/attempt; unique unresolved indexes are the final race guard. On abandonment, retain Capture counts, close only a session with no unresolved attempt, and never restore a photo.
- [ ] **Run** the focused test and database advisors; **commit** the reservation slice.

### Task 5: Print observations, uncertainty, and Admin resolution

**Files:** Extend the accounting-operations migration; create `tests/integration/print-outcomes.test.ts`.

**Interfaces:** Restricted RPCs `public.report_print_observation(authority_kind, authority_id, attempt_id, operation_key, observation_kind, evidence_code, observed_at)` and `public.resolve_uncertain_print(admin_user_id, admin_session_id, attempt_id, operation_key, outcome, inspection_reason)`. `authority_kind` is `booth` or `admin_test`; each is checked against the corresponding run/grant or Admin Test Print. `observation_kind` is `commandAccepted`, `preFilmRejected`, `knownUnsent`, `uncertain`, or `physicalEjectionVerified`. A database `printer_completion_policy` row defaults to `disabled`; the local test stack alone may set `simulated`. The verified-ejection branch requires `simulated` plus simulator evidence, and the server also refuses production confirmation until #17.

- [ ] **Write failing tests:** acceptance leaves both holds and stock unchanged; clear unused releases holds and slot; uncertainty retains holds/slot and requests pause; verified simulated ejection consumes one sheet and Guest allowance once, closes the session, and releases slot; a seeded Test Print attempt consumes stock only; duplicate/late reports do not double-consume; conflicting terminal reports fail or become non-mutating diagnostics; Admin resolution as ejected/unused requires an inspection reason and actor and applies the matching single effect; no browser-role direct call or unvalidated production evidence can confirm. Task 6 supplies the normal Test reservation path.
- [ ] **Run:** `npm test -- tests/integration/print-outcomes.test.ts`; expect missing RPCs.
- [ ] **Implement:** commit attempt event, reservation settlement, stock entry, session/run transition, operation receipt, and activity atomically. Do not infer physical ejection from acknowledgement, Film Remaining, timeout, or `12 7f`.
- [ ] **Run** the focused test and database advisors; **commit** the outcome slice.

### Task 6: Test Print setup and Wasted Film correction

**Files:** Extend the accounting-operations migration; create `tests/integration/test-and-wasted-film.test.ts`.

**Interfaces:** Restricted RPCs `public.reserve_test_attempt(admin_user_id, admin_session_id, event_id, operation_key, connection_id)`, `public.confirm_test_output(admin_user_id, admin_session_id, attempt_id, operation_key, usable)`, and `public.mark_wasted_film(admin_user_id, admin_session_id, attempt_id, operation_key, reason)`. The Test Print uses generated calibration bytes in the browser only; confirmation of usable output is tied to its connection ID. Wasted Film is one correction event on an ejected Guest attempt.

- [ ] **Write failing tests:** Test reservation holds film but no allowance; printer reconnect invalidates the prior usable-output check; `usable=false` does not establish readiness; Guest Wasted Film restores exactly one allowance unit while retaining the `-1` stock entry and closed session; duplicate correction is idempotent; correction of Test/unused/unresolved attempts fails; reason is required.
- [ ] **Run:** `npm test -- tests/integration/test-and-wasted-film.test.ts`; expect missing RPCs.
- [ ] **Implement:** preserve the accepted/verified/uncertain distinctions from Task 5 and only mark Test setup usable after the Admin's explicit output inspection.
- [ ] **Run** the focused test and database advisors; **commit** the setup/correction slice.

### Task 7: HTTP authority, handoff, and stable response contract

**Files:** Create `src/lib/operations/{types,validation,responses,privileged-client,admin-authority,booth-authority}.ts`, Admin/Booth handoff Route Handlers, `src/app/api/booth/bootstrap/route.ts`, `tests/integration/operation-http-auth.test.ts`, and `tests/unit/operation-validation.test.ts`.

**Interfaces:** `requireAdminRequest(request: Request): Promise<{ userId: string; sessionId: string }>` verifies claims, provisioned profile, and live Auth session without a page redirect. `requireBoothRequest(request: Request): Promise<{ grantHash: string; runId: string; eventId: string }>` derives authority only from the HttpOnly cookie. `createPrivilegedClient()` is server-only and never forwards browser Authorization. `parseOperation<T>(request, schema)` validates JSON, UUID key, and exact accepted fields. `operationResponse()` maps domain codes to `{ code, message, current? }` and 400/401/403/409. Mutations enforce same-origin/CSRF; responses are private and non-cacheable.

Routes in this task: `POST /api/admin/events/[eventId]/booth-handoffs`, `POST /api/admin/booth-handoffs/[handoffId]/issue`, `POST /api/booth/handoffs/confirm`, and `GET /api/booth/bootstrap`. The issue route performs confirmed local Admin sign-out before setting an inactive `Secure`, `HttpOnly`, `SameSite` Booth cookie. The confirm route activates only after that cookie arrives. `GET /api/booth/bootstrap` returns safe display/run/availability fields, never Client contact.

- [ ] **Write failing tests:** missing/stale/revoked Admin session, Booth cookie on Admin route, invalid/expired/wrong-run grant, cross-origin mutation, malformed JSON, unknown fields, and photo-like payloads fail closed; a lost cookie/failed sign-out leaves `Prepared` without Guest access and is recoverable as Paused; a confirmed handoff opens bootstrap with no Client or secret data.
- [ ] **Run:** `npm test -- tests/unit/operation-validation.test.ts tests/integration/operation-http-auth.test.ts`; expect missing handlers/helpers.
- [ ] **Implement** the helpers and four handlers, adapting Task 3 RPCs. Add `/booth/:path*` and `/api/booth/:path*` to `src/proxy.ts` only if the installed Next.js guidance and an end-to-end check show that refresh there is required; the Booth guard itself remains in the handler/page boundary.
- [ ] **Run** focused tests and type check; **commit** the access/HTTP foundation.

### Task 8: Narrow Admin operation routes

**Files:** Create the remaining `src/app/api/admin/**/route.ts` handlers except redaction/deletion plus `tests/integration/admin-operation-routes.test.ts`.

**Interfaces:** Map each approved Admin route to one Task 2–6 RPC and the Task 7 validation/authority helpers: Event `pause`, `complete`, `cancel`, `test-attempts`, `additional-prints`; Test observations; stock `additions`, `reconciliations`; attempt `resolve`, `wasted-film`. Every mutating JSON body carries `operationKey`; expected revision is required where the spec says so. Return `state`, `revision`, `availability`, and entry/attempt IDs as applicable.

- [ ] **Write failing route tests:** exact input/output fields and status mapping; no photo bytes in inputs or results; direct browser payload cannot assert user/session ID; stale/revoked Admin session fails; Test observation uses only Admin scope; duplicate keys return stable results; production printer-dependent start/Test/confirmation gates remain closed.
- [ ] **Run:** `npm test -- tests/integration/admin-operation-routes.test.ts`; expect missing routes.
- [ ] **Implement** thin handlers using the Task 7 helpers and Task 2–6 RPCs. Keep production simulated-confirmation and printer-backed start/Test gates fail-closed pending #17.
- [ ] **Run** focused tests, type check, and route smoke checks; **commit** the Admin routes.

### Task 9: Narrow Booth operation routes

**Files:** Create the remaining `src/app/api/booth/**/route.ts` handlers and `tests/integration/booth-operation-routes.test.ts`.

**Interfaces:** Map `guest-sessions`, session `abandon`, `captures`, `print-attempts`, and attempt `observations` to Task 4–5 RPCs through Task 7's grant guard. Only the matching `PauseRequested` attempt may receive a final/uncertain report; other mutations require Active. Responses contain non-sensitive availability and IDs, never Client contact.

- [ ] **Write failing route tests:** invalid/wrong-run grant cannot open or mutate a session; a `PauseRequested` grant may report only its already reserved attempt; a pause committed first blocks reservation; a reservation committed first can report its outcome; Test observation is refused through Booth scope; duplicate keys are stable; a payload containing photo bytes or asserted grant hash is rejected.
- [ ] **Run:** `npm test -- tests/integration/booth-operation-routes.test.ts`; expect missing routes.
- [ ] **Implement** the thin Booth handlers with same-origin checks, exact Zod schemas, and safe error mapping.
- [ ] **Run** focused tests, type check, and route smoke checks; **commit** the Booth routes.

### Task 10: Simulated printer adapter and `/booth` Guest journey

**Files:** Create `src/features/booth/printer/{contract,simulator}.ts`, `src/app/booth/page.tsx`, focused `src/features/booth/` components, `tests/unit/booth-printer.test.ts`, `tests/components/booth-flow.test.tsx`, and `tests/e2e/booth-simulator.spec.ts`.

**Interfaces:** `PrinterAdapter.sendOnce(attemptId: string, image: Uint8Array): Promise<PrinterObservation[]>` accepts only a transient image and emits discriminated observations with attempt ID and monotonic timing. The simulator exposes deliberate accepted/ejected/rejected/uncertain outcomes and a command count. A future real adapter must satisfy this interface only after the #17 decision. `/booth` gets safe bootstrap data, confirms an inactive grant, and shows welcome, preview, 3–2–1 capture, review/Retake, explicit Print, result/recovery, and neutral paused/sign-in states. Capture metadata acknowledgement precedes reservation.

- [ ] **Write failing tests:** two `sendOnce` calls for one attempt make one command; no photo enters fetch/storage/log; command acceptance alone leaves printing state; clear rejection returns to review only while Active/ready with the image still in memory and waits for a new Print tap; reload after reservation becomes Uncertain if unsent cannot be proved; disconnect after possible send never resends; timeout warning and Continue work only in capture/review; stop before shutter makes no Capture, stop after shutter keeps Capture but discards photo; invalid grant shows no Event or Client details.
- [ ] **Run:** `npm test -- tests/unit/booth-printer.test.ts tests/components/booth-flow.test.tsx` and focused Playwright; expect missing page/adapter.
- [ ] **Implement** the simulator and Guest UI following `DESIGN_SYSTEM.md`. Keep printable image bytes inside browser memory and use explicit `Cache-Control: no-store` responses. Serve the simulator only under a server-side development/test enablement that cannot be enabled in production by a browser request.
- [ ] **Run** the focused tests, Playwright journey, type check, lint, and build; **commit** the Booth slice.

### Task 11: Client Redaction and Draft deletion

**Files:** Add the redaction-operations migration; create `src/app/api/admin/events/[eventId]/{redact-client,delete-draft}/route.ts`, update Event/History reads and `src/lib/events/drafts.ts`, and create `tests/integration/redaction-and-deletion.test.ts`.

**Interfaces:** `public.begin_event_redaction(admin_user_id, admin_session_id, event_id, expected_revision, operation_key, action)` accepts `redact_client` for Completed/Cancelled or `delete_draft` for Draft. It clears identifying fields, records a pending media-removal state, and preserves opaque operational references. A server-only media-removal step deletes private `event_media` paths by Event UUID; `public.complete_event_redaction(...)` marks completion only after successful removal. Existing Draft save/read functions must reject tombstones and direct Live edits.

- [ ] **Write failing tests:** unresolved holds block deletion; Client Redaction clears contacts and media while retaining anonymous totals; Draft deletion hides title/Client/venue/schedule but retains stock/Test history; media-delete failure stays pending and retryable; a tombstone is absent from Events/History; denied Admin sessions cannot mutate; same-key retry cannot repeat the deletion effect.
- [ ] **Run:** `npm test -- tests/integration/redaction-and-deletion.test.ts`; expect missing operations.
- [ ] **Implement** the database functions, handlers, storage cleanup, and reads. Do not put identifying values in activity records or storage paths.
- [ ] **Run** focused tests, type check, and database advisors; **commit** the privacy slice.

### Task 12: Admin operational controls and handoff journey

**Files:** Create focused `src/features/admin/operations/` components; update `src/app/(admin)/events/[eventId]/page.tsx`, `src/features/admin/auth/actions.ts`, `src/app/(auth)/sign-in/page.tsx`, and relevant Events/History surfaces; create `tests/components/admin-operations.test.tsx` and `tests/e2e/admin-booth-handoff.spec.ts`.

**Interfaces:** The Admin Event page presents readiness, Test Print, start/resume/pause/finish, stock and allowance, Uncertain resolution with reason, Wasted Film consequences, Client Redaction, and Draft deletion. A server-set, HttpOnly same-device return hint remembers only the opaque Event ID during paused handoff; after successful Admin sign-in, the server validates that Event access and routes to `/events/[eventId]` without automatic resume. Disabled production printer-dependent controls explain the #17 gate.

- [ ] **Write failing tests:** Admin can inspect current totals and safely trigger each available control; stale revision shows conflict; unresolved holds block finish/delete with a recovery action; resolving Uncertain as ejected/unused requires inspection reason and displays stock/allowance effect; redaction/delete describes retained history; failed handoff returns Paused; sign-in after pause requires explicit Resume; Guest/Booth cookies cannot reach Admin controls.
- [ ] **Run:** `npm test -- tests/components/admin-operations.test.tsx` and focused Playwright; expect missing controls.
- [ ] **Implement** the Admin components and pages using `DESIGN_SYSTEM.md` and the Task 7–11 routes. Preserve distinct outcome labels; never imply command acceptance is a Confirmed Print.
- [ ] **Run** focused tests, Playwright, type check, lint, and build; **commit** the Admin journey.

## Final verification and review

- [ ] Run full lint, type check, Vitest, local Supabase integration, Playwright simulated journeys, and build after all slices are combined. Compare stock-balance read model against the append-only ledger and inspect function/table grants directly.
- [ ] Review every section of the approved spec, ADR-0014, ADR-0016, ADR-0021, and ADR-0023 against the completed implementation. Confirm all endpoint shapes, transition errors, idempotency, races, and privacy paths have a test and no browser role can call an accounting function directly.
- [ ] Record simulated coverage separately from #17 physical evidence. Do not enable real printer-backed Booth Mode, real Test Print stock consumption, or production Confirmed Print accounting; do not close the actual-iPad release gate.
- [ ] If implementation changes a durable decision, update its ADR and affected PRD, glossary, architecture, README, spec, and guides together before completion.
