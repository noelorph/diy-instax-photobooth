# Accounting, access, and provisional printer contracts

**Status:** Proposed written contract for owner review, 2026-10-16. This design implements [issue #9](https://github.com/noelorph/diy-instax-photobooth/issues/9) after the operational decisions in [ADR-0014](../../adr/0014-stop-booth-before-print-reservation.md) and [ADR-0016](../../adr/0016-keep-history-when-deleting-draft.md). [ADR-0022](../../adr/0022-centralize-accounting-transitions-and-persist-pause-requests.md) records its approved architectural choices. It does not pass the physical printer checkpoint in [ADR-0021](../../adr/0021-move-print-qualification-to-integration-checkpoint.md) or the iPad release trial.

## Intent and scope

The Admin needs auditable Event allowance and shared Film Stock, while a Guest needs one safe path from Capture to a physical print. This contract defines the records, legal transitions, authorization, HTTP boundary, idempotency, and printer observations needed to implement that path. Integrated development uses a simulated printer. The browser keeps photo bytes in memory and sends them directly to the printer; neither an endpoint nor a database record accepts them.

The existing Admin identity, Draft Event validation, and Supabase RLS remain in force. Booking, payment, Guest identity, galleries, and operation without internet are outside this design. The qualification harness remains separate from Event accounting: its physical sheets never become Event Test Prints or Confirmed Prints.

## Shared rules

- All persistent identifiers are opaque UUIDs. Instants use UTC; an Event retains its IANA venue time zone for display. Every mutation has a client-generated operation key scoped to its actor and operation kind. A replay with the same normalized input returns the committed result; reuse with different input returns `idempotency_conflict`. The server retains the key and input digest with the result for the life of the related operational record.
- The server is authoritative for state and counts. Browser availability is advisory. Each mutation rechecks its preconditions in the committing database transaction. A stale Event revision returns `state_conflict` with a fresh safe state summary.
- One Event may be Live and one Print Attempt may hold the single printer at a time. One Guest Session may have only one unresolved Print Attempt. An Uncertain Print occupies the printer slot until Admin resolution.
- Event readiness is computed from setup evidence and positive available allowance and stock. It is never a stored Event state. Test Print success is tied to the current printer connection; reconnecting invalidates that setup check.
- Test Print ejection alone does not pass readiness: the Admin confirms that the generated calibration output is usable for the current connection.
- A Guest photo is never persisted, logged, uploaded, or placed in an idempotency result. Capture records contain only IDs and timestamps. Client contact details, grant secrets, and signed media URLs are absent from activity and printer diagnostics.
- The 90-second inactivity timeout applies in capture/review with its warning and Continue action. It does not interrupt a countdown, print, or pre-send connection hold; any abandonment follows the Guest Session transition below.

## State transitions

The transition operation, actor, preconditions, database effects, and returned state form one contract. `Admin` means a verified provisioned Admin with an active Auth session; `Booth` means the current valid grant for the named run and Event. All rows below also require an operation key unless they are read-only.

### Event and Booth run

| From → to | Actor and preconditions | Committed outcome |
| --- | --- | --- |
| New → `Draft` | Admin submits valid Event and Client snapshot. | Event revision 1; no run or accounting effect. |
| `Draft` → `Live`; no run → `Prepared` | Admin on booth iPad; readiness passes; no other Live Event. | Event becomes Live; inactive run and grant are prepared. No Guest access yet. |
| `Prepared` → `Active` | Same-device handoff proves local Admin sign-out succeeded and the booth browser confirms receipt of its inactive grant cookie. | Grant and run activate; Guests may enter. |
| `Prepared` → `Paused` | Local Admin sign-out fails, the handoff expires, or Booth confirmation fails. | Inactive grant is revoked; Live Event remains recoverable through Admin sign-in. Until this cleanup commits, `Prepared` itself denies Guest access. |
| `Active` → `PauseRequested` | Admin requests pause, or Booth requests protected handoff; run and Event still match. | New Guest work and reservations are refused immediately. An already reserved attempt may report its result. |
| `PauseRequested` → `Paused` | No unresolved attempt remains; or interruption has first made the attempt Uncertain. | Grant revoked; Booth returns to protected sign-in. A Live Event remains Live. |
| `Paused` → `Prepared` → `Active` | Admin signs in on booth iPad, readiness passes, and explicitly resumes. | New grant is prepared and activated only after local Admin sign-out. Guest flow starts at welcome. |
| `Draft` or `Live` → `Cancelled` | Admin; all Print and Film Reservations resolved. A Live run has first stopped. | Event becomes Cancelled; grant revoked; Event remains in History. |
| `Live` → `Completed` | Admin; all reservations resolved; run has stopped or can stop immediately. | Event becomes Completed; run ends; grant revoked; Event remains in History. |
| `Draft` → deleted reference | Admin; all reservations resolved; media removal completes. | Identifying Event fields and private media removed; opaque operational references and stock effects remain. Completion is reported only after media removal. |

`Completed` and `Cancelled` have no resume transition. A remote stop committed before a Print Reservation prevents that reservation. If the reservation commits first, completion/cancellation returns `pending_attempt`; pause records `PauseRequested` and waits for its outcome. When a remote stop wins during preview, countdown, or review, the booth discards the unprinted photo. A shutter already fired still counts as a Capture; a stopped countdown before the shutter does not.

### Guest Session and Capture

| From → to | Actor and preconditions | Committed outcome |
| --- | --- | --- |
| New → `Open` | Booth; run Active; at least one available guest print and sheet; no other open session for that run. | Anonymous Guest Session ID. No allowance or stock hold yet. |
| `Open` → `Open` with Capture | Booth; shutter fired; stable Capture operation key. | One Capture metadata row; Retake repeats this transition with a new key. |
| `Open` → `Printed` | Matching attempt confirms physical ejection or Admin resolves an Uncertain Print as ejected. | Session closes and the in-memory photo is discarded. Later Wasted Film classification does not reopen it. |
| `Open` → `Abandoned` | Booth timeout/cancel, pause before reservation, reload before print, or Admin recovery after a fault; no unresolved attempt. | Session closes; completed Captures remain. No photo or accounting hold remains. |

A clear pre-film rejection leaves the session `Open` while the same page still has the selected image, the run is Active, and readiness passes. The Guest may explicitly request a **new** attempt. A reload loses the image and ends this retry path. A Wasted Film replacement always starts a new Guest Session and Capture.

After a reload, locally queued non-photo Capture metadata may replay with its original operation key before the server abandons the old session. That replay cannot restore a photo or authorize a print from the abandoned session.

### Print Attempt

An attempt has kind `Guest` or `Test`, one unique request key, one Film Reservation, and a Print Reservation only when kind is `Guest`. A Test Print belongs to a Draft or Live Event's setup and printer connection; it does not require a Booth run. `Accepted` is an observation that the printer acknowledged a command, not an accounting result. The attempt event journal records each transition with actor, time, evidence kind, and reason where required.

| From → to | Actor and preconditions | Reservation and ledger outcome |
| --- | --- | --- |
| New → `Reserved` | Booth Guest request after acknowledged Capture with Active run, or Admin Test Print request for Draft/paused-Live setup with current printer connection; printer slot, allowance when relevant, and stock available. | Create attempt and holds before any Bluetooth send. Claim printer slot. |
| `Reserved` → `Accepted` | Same authorized browser reports command acknowledgement for this attempt. | Record acknowledgement time only; holds remain. |
| `Reserved`/`Accepted` → `RejectedUnused` | Same authorized browser supplies reliable pre-film rejection, or the live browser proves the command never started. | Release applicable holds and printer slot; no stock entry or Confirmed Print. Any retry is a new Guest attempt. |
| `Reserved`/`Accepted` → `Confirmed` | Validated physical-ejection evidence for the matching pending attempt, under the #17-approved production rule; simulation may exercise this branch in tests. | Consume holds; append one `-1` stock entry; Guest attempt counts against allowance and closes session; Test attempt consumes stock only. Release printer slot. |
| `Reserved`/`Accepted` → `Uncertain` | Same browser reports ambiguous delivery/outcome, or recovery detects an unresolved attempt after reload, disconnect, or timeout. | Keep holds and printer slot; initiate Booth pause; no automatic resend. |
| `Uncertain` → `AdminResolvedEjected` | Admin inspects physical printer/sheet, chooses ejected, and records a reason. | Same accounting as Confirmed; record Admin actor and inspection reason; close Guest Session. This is fault recovery, not approval for routine manual completion. |
| `Uncertain` → `AdminResolvedUnused` | Admin inspects, establishes no sheet was used, and records a reason. | Release applicable holds and printer slot; no consumption. Original photo is not recovered after handoff. |
| `Confirmed`/`AdminResolvedEjected` → `WastedFilm` | Admin records that the ejected Guest sheet is unusable and why; correction not already made. | Append correction event; restore one guest allowance unit; retain the existing `-1` stock entry. Session stays closed. |

An attempt cannot transition twice to different terminal outcomes. A repeated matching transition returns its prior result. A late printer report after Admin resolution is recorded as a non-mutating diagnostic only. The Admin reviews the consequence before resolving uncertainty or marking Wasted Film.

## Accounting model and invariants

The Event's **chargeable Confirmed Prints** are ejected Guest attempts without a Wasted Film correction. Physical ejection history remains inspectable even after a correction. The formulas are:

```text
remaining guest allowance = original Print Allowance
  + sum(Additional Prints) - chargeable Confirmed Prints
  - unresolved Guest Print Reservations

on-hand Film Stock = sum(film_stock_entries.signed_sheets)
available Film Stock = on-hand Film Stock - unresolved Film Reservations
```

Only an ejected Guest or Test attempt appends a `-1` stock entry. Additions append positive entries. Reconciliation requires no unresolved Film Reservations; the Admin supplies the observed physical sheet count and a reason, and the transaction appends `observed - current_on_hand` rather than replacing history. A zero-difference reconciliation records the observation and reason with a zero entry. Additions are allowed while an attempt is pending. A Wasted Film correction changes allowance classification only. Neither printer Film Remaining nor `12 7f` changes on-hand stock.

The ledger is append-only. A transactionally maintained stock balance and Event summary are read models; their values must reconcile with the ledger and attempt rows. Count changes, reservation state, attempt event, and activity entry commit together. On failure they all roll back. Constraints reject negative quantities and duplicate consumption/correction. Admin stock additions require a positive quantity; reconciliation accepts a nonnegative observed count, including one that produces a zero difference.

## Database and concurrency contract

Extend the existing `events` and `admin_profiles` migrations rather than replacing their Draft validation. Add `booth_runs`, `booth_grants`, `guest_sessions`, `captures`, `print_attempts`, `print_attempt_events`, `additional_print_entries`, `film_stock_entries`, `activity_events`, and a singleton `film_stock_balance`. Store Event/Client identifying fields only in `events`. A deleted Draft remains as an internal tombstone with the same opaque ID and `deleted_at`, with title, Client, venue, and schedule fields cleared. The migration makes those fields nullable only for tombstones, preserves their Draft validation for visible Events, and excludes tombstones from Admin Event lists. No operational row copies identifying fields. `event_media` object paths use Event IDs.

Use foreign keys, check constraints for state/quantity, and partial unique indexes for one Live Event, one unresolved printer attempt, one open Guest Session per run, and one unresolved attempt per Guest Session. Unique operation-key indexes are scoped by actor/operation kind; an input digest prevents a key from being repurposed. The Print and Film Reservations are holds represented by an unresolved attempt row, as in the architecture: a Guest attempt holds one of each, while a Test attempt holds only film. A terminal attempt has no unresolved holds.

For every mutation touching an Event and stock, acquire locks in a fixed order: Event row, singleton stock-balance row, then the attempt/session rows as needed. Event-only stop operations lock the Event row and inspect unresolved attempts in the same transaction. Stock-only additions lock the balance row. This order makes the pause/reservation race deterministic and prevents two requests from claiming the last available unit. A unique printer-slot constraint handles simultaneous Guest and Test Print requests. The database operation validates the expected revision, legal transition, scoped actor, available units, and idempotency key before writing.

Restrict accounting writes to server-invoked operations. The existing Admin RLS pattern continues to authorize reads and Draft edits only for the provisioned Admin with a live Auth session; the migration must also restrict direct Event edits to Draft fields and prevent direct Live accounting/state changes. New exposed tables have RLS enabled and explicit grants; no Booth browser role gets direct table or function access. Accounting operations are restricted RPC functions called by a separate server-only privileged client after the handler verifies Admin or Booth authority. If placed in the exposed `public` schema for Supabase RPC, revoke default `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`, grant only the server role, and keep inputs narrow. Function schema exposure does not itself grant permission. The privileged client never inherits a browser access token.

For an Admin mutation, the function receives the verified Admin user and Auth session IDs and checks the provisioned profile and live session again. For a Booth mutation, it receives the server-computed grant hash and checks the matching active grant, Event, and run in the same transaction. These values are never accepted from JSON as asserted authority. Each function also validates the transition and related IDs; handler authorization and database validation are both required. Supabase's [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [function privilege](https://supabase.com/docs/guides/database/functions) guidance informs this boundary.

## Booth Access Grant lifecycle

1. Starting/resuming creates a new inactive grant record for one Event and Booth run and a one-use handoff record bound to the initiating Admin session and device cookie. No usable grant secret exists yet. Expiry requires a fresh Admin handoff even if the Event remains Live.
2. The handoff handler signs out the iPad's Admin session with local scope, then consumes the one-use handoff, generates a high-entropy grant secret, and stores only its hash and finite configured expiry. Its response clears Admin cookies as it sets the raw secret in a `Secure`, `HttpOnly`, `SameSite` Booth cookie. The grant and run remain inactive until the booth browser sends a confirmation using that cookie. This avoids Guest access if the cookie response was lost. A failed or expired handoff is treated as paused and has no usable grant; a second device's Admin session continues.
3. The Booth confirmation checks the inactive grant and handoff, then activates the run and grant in one transaction. Only its success opens the Guest interface. Every later Booth request checks the cookie hash, expiry, revocation, run scope, Event Live state, and run Active state (or the limited pending-attempt reporting allowed during `PauseRequested`). State-changing requests also enforce same-origin/CSRF protection. A grant can access only non-sensitive Event display configuration, availability, anonymous session/Capture metadata, and matching Print Attempt operations.
4. Pause/completion/cancellation revokes the grant when the in-flight attempt is resolved or marked Uncertain. A subsequent request with the old cookie fails closed and clears it. Ordinary reload and short connection loss preserve a still-valid grant. Expiry requires Admin sign-in and explicit resume; sign-in alone never reactivates Booth Mode.

The Admin's password reset and local Profile sign-out do not revoke an active Booth grant. Admin pages always require fresh Admin authorization; a Booth cookie alone never authorizes them. A paused booth's sign-in surface displays no Event name, Client contact, or printer diagnostics before authentication.

## HTTP contract

All routes are Next.js Route Handlers. Mutations accept JSON with an `operationKey`; IDs are opaque. Mutating responses include `state`, `revision` where relevant, `availability` where relevant, and the committed operation result. Errors use `{ code, message, current? }` with stable codes: `unauthorized`, `forbidden`, `grant_expired`, `state_conflict`, `pending_attempt`, `allowance_exhausted`, `stock_exhausted`, `printer_busy`, `idempotency_conflict`, `invalid_evidence`, and `validation_error`. Authorization failures use HTTP 401/403, invalid input uses 400, and state/resource/idempotency conflicts use 409. No response includes photo bytes, Client contact in Booth routes, a grant secret, or a privileged diagnostic.

| Method and route | Required input beyond operation key | Successful result |
| --- | --- | --- |
| `POST /api/admin/events/{eventId}/booth-handoffs` | Expected revision, setup/connection evidence | Event/run IDs, new state/revision, one-use handoff ID; grant remains inactive. |
| `POST /api/admin/booth-handoffs/{handoffId}/issue` | Handoff ID and bound device cookie | After successful local sign-out, issue an inactive Booth cookie; otherwise return paused recovery state. |
| `POST /api/booth/handoffs/confirm` | Inactive Booth cookie and handoff ID | Activate grant/run; Guest interface opens only after success. |
| `POST /api/admin/events/{eventId}/pause` | Expected revision | `PauseRequested` or `Paused`, new revision. |
| `POST /api/admin/events/{eventId}/complete` or `/cancel` | Expected revision | Terminal Event state/revision; `pending_attempt` while holds remain. |
| `POST /api/admin/events/{eventId}/test-attempts` | Current printer connection ID | Attempt ID and Film hold; generated calibration image stays in browser memory. |
| `POST /api/admin/print-attempts/{attemptId}/observations` | Observation kind, non-photo evidence code/times | Attempt state and refreshed stock; valid only for that Admin Test Print. |
| `POST /api/admin/events/{eventId}/additional-prints` | Positive quantity | Entry ID and refreshed allowance. |
| `POST /api/admin/film-stock/additions` | Positive sheets and reason | Entry ID and refreshed stock. |
| `POST /api/admin/film-stock/reconciliations` | Observed physical sheets and reason | Previous on-hand, signed difference, new on-hand, entry ID. |
| `POST /api/admin/print-attempts/{attemptId}/resolve` | `ejected` or `unused`, inspection reason | Terminal attempt state, entry IDs, refreshed totals. |
| `POST /api/admin/print-attempts/{attemptId}/wasted-film` | Correction reason | Wasted Film state and restored allowance; no stock reversal. |
| `POST /api/admin/events/{eventId}/redact-client` or `/delete-draft` | Expected revision | Pending/completed removal state; completion only after private media removal. |
| `GET /api/booth/bootstrap` | Current Booth cookie | Safe display config, run state, derived availability; no Client data. |
| `POST /api/booth/guest-sessions` or `POST /api/booth/guest-sessions/{sessionId}/abandon` | Run ID; Session ID for abandonment | Session ID/state and current availability. |
| `POST /api/booth/guest-sessions/{sessionId}/captures` | Capture timestamp | Capture ID/count; photo never sent. |
| `POST /api/booth/guest-sessions/{sessionId}/print-attempts` | Chosen acknowledged Capture ID and run ID | Attempt ID, hold summary, current availability. |
| `POST /api/booth/print-attempts/{attemptId}/observations` | Observation kind, non-photo evidence code/times | Attempt state and availability. Admin Test Print reports use the parallel Admin-scoped route. |

The selected Capture must have been acknowledged before reservation. The report endpoint accepts only the current pending attempt for that browser's Event/run authority. It rejects a claimed verified ejection when the production evidence rule is disabled. A Booth grant in `PauseRequested` may only report or mark uncertain the already reserved attempt; it cannot create sessions, Captures, or new reservations. Network loss before reservation leaves the selected image only in memory and requires an explicit new Print action after recovery.

## Replaceable printer adapter

The browser adapter accepts an attempt ID, a non-persistent in-memory printable image, and the current printer connection. It has a `sendOnce(attemptId, image)` operation that refuses a second physical command for the same attempt within that browser process. It reports a discriminated observation with attempt ID and monotonic timing:

| Observation | Meaning | Server action |
| --- | --- | --- |
| `commandAccepted` | Printer acknowledged command delivery. | Record `Accepted`; keep holds. |
| `physicalEjectionVerified` | The selected, physically validated #17 rule proves complete ejection. | Confirm matching attempt if production gate enabled. |
| `preFilmRejected` | Reliable feedback proves no sheet was used. | Release holds and permit explicit retry if Booth remains ready. |
| `knownUnsent` | The live browser can establish that no print command began. | Release holds; any later send needs a new attempt. |
| `uncertain` | Delivery, sheet usage, or completion cannot be established. | Keep holds, pause, require Admin inspection. |

Raw printer status, Film Remaining, and the candidate `12 7f` field are diagnostic observations, not `physicalEjectionVerified`. A command acknowledgement, timeout, or missing notification cannot be promoted to completion. A reload after reservation is Uncertain when command delivery cannot be ruled out. A disconnect after a possible send is Uncertain. Neither the browser nor server automatically resends an uncertain attempt. A Test Print uses the same adapter with a generated calibration image and no Guest allowance hold.

The simulator emits each observation deliberately and records command count so contract tests can assert exactly one send. Its verified-ejection path models a future validated rule without claiming that the current Mini Link 3 provides one. Production printer-backed Live Event Booth Mode, Test Prints, stock consumption, and Confirmed Print accounting remain disabled until the physical completion approach is approved and validated under #17. The actual iPad trial is a separate release gate. The [issue #17 evidence report](../../qualification/issue-17-trial-report.md) is the current hardware evidence; printer-reported film count is not physical inventory.

## Failure behavior and contract verification

Contract tests should prove:

1. Duplicate Capture, reservation, outcome, addition, and resolution keys produce one durable effect; a changed payload under a reused key fails.
2. Concurrent requests for the final allowance unit, final sheet, or printer slot allow exactly one reservation. A pause committed first blocks reservation; a reservation committed first delays pause completion and blocks Event completion/cancellation.
3. `commandAccepted` changes no allowance or stock; verified ejection consumes each applicable unit once; clear unused releases holds; uncertainty keeps holds and blocks a new session or Test Print.
4. The adapter sends at most one physical command per attempt; an uncertain attempt never resends after reload or reconnect; a clear rejection permits only an explicit new attempt while Active and ready.
5. Admin resolution of uncertainty records actor, physical-inspection reason, and the chosen ejected/unused effect. Wasted Film restores one allowance unit without restoring a sheet or reopening the session.
6. An expired, revoked, wrong-run, or wrong-Event Booth grant cannot read Client data or mutate state. Ordinary Admin Auth JWT validity without a live session does not authorize Admin actions. Booth cookies never authorize Admin routes.
7. Client Redaction removes contact and Event Media without erasing anonymous totals. Draft deletion removes identifying details and media, preserves stock effects, and remains visibly incomplete on media-deletion failure.
8. Simulated printer outcomes cover acceptance, verified ejection, clear rejection, uncertainty, and late duplicate reports. Production verified-ejection reporting remains gated until #17's evidence rule is installed and validated.

Database integration tests exercise constraints, locks, transaction rollback, RLS/grants, and concurrent requests. Route/contract tests exercise narrow payloads and authorization. Guest-flow tests use the simulator. Physical qualification is recorded separately and cannot be replaced by simulated tests.

## Delivery boundary

This document defines the contract for issue #9. After owner review, the implementation plan can divide work into migrations and database operations, Admin/Booth handlers, simulator and adapter boundary, and contract tests. Any production ejection-confirmation method requires a separate approved #17 decision and physical evidence. Any changed durable decision updates the relevant ADR, PRD, glossary, architecture, and guides together.
