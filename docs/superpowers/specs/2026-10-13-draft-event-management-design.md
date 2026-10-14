# Pre-gate Draft Event management

**Status:** Approved by the owner on 2026-10-14; implementation has not started.

## Intent and dependency

Deliver the persistent Draft Event creation and editing allowed by [issue #14](https://github.com/noelorph/diy-instax-photobooth/issues/14), [PRD section 3](../../../PRD.md#3-development-and-launch-feasibility-gates), and [ADR-0012](../../adr/0012-qualify-development-on-iphone-before-ipad-launch.md). This is the second pre-gate Admin spec and depends on [Admin access and shell](2026-10-13-admin-access-and-shell-design.md). Success means the authenticated Admin can save, find, inspect, and update booking details as Drafts without making an Event Live or consuming any print resource.

This work proceeds independently of the isolated iPhone printing trial in [issue #17](https://github.com/noelorph/diy-instax-photobooth/issues/17). A saved Draft is a booking record, not a readiness or printing claim.

## Admin flow

- `/events` replaces the first spec's Events placeholder with a protected Draft list. Each row links to `/events/[eventId]` and shows enough identity, venue-local schedule, and Draft state to find the booking. Include useful empty and overdue-Draft states. Do not show fabricated Live or Completed records, stock totals, readiness, or print counts. The Dashboard and History destinations remain protected placeholders.
- `/events/new` provides a labeled form for Event name; Event-specific Client name, email, and phone; venue address and IANA time zone; venue-local scheduled start and end; booked Film Package count; and original Print Allowance in individual guest prints. The package count never determines allowance automatically. Save creates an Event in **Draft** state.
- `/events/[eventId]` shows those saved fields and permits editing while the Event is Draft. It does not offer Delete, Start Booth Mode, Test Print, Film Stock, Additional Prints, Event Media upload, or other operational controls. The Admin can return to the Draft list after saving. A missing or inaccessible ID reveals no Client details.
- Present dates as venue-local values with an explicit time-zone label where ambiguity matters. The form follows the [design system](../../../DESIGN_SYSTEM.md): one column on compact screens, grouped columns at larger widths, visible labels and errors, preserved input after validation, and an in-context saved state only after persistence succeeds.

## Validation and persistence

Persist an `events` record with an opaque ID, Draft state, Event title, venue address and IANA time zone, UTC start/end instants, booked Film Package count, original Print Allowance, and that Event's Client contact snapshot. There is no shared Client table. Only the provisioned Admin with an active session may read or mutate the rows; use row-level security, deliberate grants, server-side authorization, and database constraints. Reject any client-supplied state other than Draft. Create and update operations must not write accounting, stock, Booth, or printing records.

Validate on both form and server; the database remains authoritative. Required text and contact fields cannot be blank; email must be valid; counts must be whole and nonnegative. A zero count may be saved on a Draft because later readiness requires positive resources before Booth use. Scheduled end must be after start as an instant. Convert the venue-local times using the chosen IANA zone and persist UTC instants; reject invalid zones and nonexistent or ambiguous local times with a field-level explanation rather than silently shifting or guessing. Reject malformed IDs and stale or concurrent edits without silently overwriting another saved revision. Show a recoverable save failure without claiming success.

The migration may define only the Event fields needed for this stage. It must leave room for the later lifecycle and accounting contracts in [issue #9](https://github.com/noelorph/diy-instax-photobooth/issues/9), without pre-implementing them. The eventual Event state model includes Live, Completed, and Cancelled, but no pre-gate request may create or transition into those states. The later contract work must review migration compatibility rather than assuming this first schema is the final accounting design.

## TDD acceptance and verification

Use a failing test before each behavior, observe it fail, implement the minimum change, then rerun the relevant test. Cover at least:

1. The sole Admin can create a Draft, find it in the Draft list, open it, edit every allowed field, and see persisted values after a fresh request.
2. A second Draft for the same Client retains an independent contact snapshot; editing one does not change the other.
3. Invalid email, blank required values, negative or fractional counts, invalid zones, end-before-start, and DST gaps or overlaps produce actionable errors and write no partial Event.
4. A non-Admin, signed-out, or revoked session cannot list, read, create, or edit a Draft, including direct data or mutation requests. Unknown IDs do not expose Client information.
5. Submitted state changes, deletion requests, and attempts to call gated operational actions are rejected at the server or data boundary, regardless of hidden UI controls.
6. Two devices editing the same Draft cannot silently lose one device's saved changes. A persistence or connection failure preserves the form and offers retry.
7. Compact and wide layouts display local dates, time-zone labels, validation, empty states, and Draft status accessibly at 200% zoom and by keyboard.

Use pure validation tests, database integration tests for constraints and authorization, component tests for form states, and browser tests for the create/list/edit journey. Follow [ARCHITECTURE.md section 8](../../../ARCHITECTURE.md#8-verification-and-delivery). A visual pass or a simulated printer test does not prove the iPhone or iPad hardware gate.

## Exclusions and completion

Draft deletion waits for [issue #8](https://github.com/noelorph/diy-instax-photobooth/issues/8). Live transitions, Booth Mode and grants, Event Media, printer-backed readiness and Test Prints, Print or Film Reservations, Film Stock changes, Additional Prints, Confirmed Print accounting, and completed History belong to later contract and build work in [issues #9 and #10](https://github.com/noelorph/diy-instax-photobooth/issues/9). No gated operation should appear as an enabled control or callable mutation in this stage.

Before claiming issue #14 complete, review the combined Admin change against both specs, resolve code-review findings, run fresh lint, type, unit/integration, and browser checks, and record deferred integrated and cross-device cases. The Admin foundation is optional parallel work and never blocks issue #17's physical trial.
