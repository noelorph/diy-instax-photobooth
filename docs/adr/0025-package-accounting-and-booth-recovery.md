# ADR-0025: Use package accounting and keep recovery in Booth Mode

**2026-10-27 media implementation/availability:** [ADR-0032](0032-build-full-f2-with-uploads-unavailable.md) permits full dormant F2/#30 implementation with the Admin cleanup reminder while ADR-0031 keeps uploads unavailable. Existing private access/retention and prior-authorized cleanup-pending safeguards remain. Full #30 cleanup and enabled transfer/failure/concurrency/private-delivery/playback qualification remain open. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure. #17/#7 gates remain unchanged.

**Status:** Accepted target design. Version-2 contracts and handlers passed #9 software verification; see [dated #9 software acceptance evidence](../implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25). GitHub #9 is closed as completed. Admin/Booth integration, complete removal and fresh package-only installation remain #10 work, under the approved plan and reviewed #9 handoff. F1–F8 are published as #29–#36; implementation may proceed against the verified upload-disabled F2 milestone under ADR-0032; #30 stays open in #10 and is completed last before #10 closure. Physical qualification remains open.
**Date:** 2026-10-21
**Contract:** [Package accounting, access and Booth recovery](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md).

## Context

The earlier model required inventory bookkeeping, test-output inspection, print-quality corrections and repeated Admin sign-in on the booth device. The owner wants ordinary booth operation with physical equipment help and authenticated recovery from a phone. The printer's reported count is not trustworthy physical inventory. Ending a guest interaction cannot establish whether an already-delivered command printed.

## Decision

- Each original or Additional Film Package gives an Event ten prints. Hold one while attempting a print; count once on confirmed full ejection, even if the image is unusable. Unknown outcomes remain pending and block another guest.
- Remove the separate editable Print Allowance, Additional Prints, shared Film Stock, Wasted Film, in-app Test Print, Client Redaction and past-Event deletion. Setup retains only the sentence “Always test the printer before starting Booth Mode.”
- Keep the iPad in `/booth` through faults and explicit pauses. Separate the Admin pause state from equipment/network readiness. Bluetooth recovery offers one **Connect to Instax** action; camera recovery offers **Enable Camera**. New guest work resumes at welcome only after readiness and old-attempt resolution, and never overrides an explicit pause.
- The authenticated phone Event page supports package purchases, reload confirmation, Pause, Resume and Finish Booth Mode. Exceptional unknown outcomes require inspection and a reason with **Printed / Not printed**; reloading alone never settles an old attempt or adds Event capacity.
- Finish Booth Mode before Complete Event. Delete never-started Drafts after safe cleanup; retain Completed and Cancelled Events with their details and media.
- Keep accounting mutations inside private transactional functions called by trusted server handlers, plus Admin RLS for reads/Draft edits. Retain scoped booth grants through recoverable faults/pauses; revoke at finish/security termination and fail closed on genuine expiry/loss. Retain one-send, idempotency, metadata-only journaling and guest-photo privacy boundaries.
- Require physically validated **automatic** normal full-ejection completion before enabling real Booth printing. Inspection is exceptional recovery, never a routine confirmation button after every print. Actual iPad end-to-end release qualification is still mandatory.

## Supersession map

Earlier ADRs retain decision history with explicit supersession notices. The replacement contract controls current behavior; ADR-0029 replaces legacy preservation and migration requirements.

| Earlier decision             | Change                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0002                     | Replace pause/fault grant revocation and local sign-in recovery; retain Admin isolation                                                                                                        |
| ADR-0003                     | Replace accounting model and quality refund; retain pending holds/no resend                                                                                                                    |
| ADR-0004                     | Replace retained-photo/retry recovery; retain internet requirement                                                                                                                             |
| ADR-0005, ADR-0012, ADR-0021 | Keep physical evidence and staged development; require automatic normal completion and the actual iPad gate                                                                                    |
| ADR-0006                     | Supersede shared physical inventory entirely                                                                                                                                                   |
| ADR-0007, ADR-0008           | Retain server authority and transactions; replace stock/allowance operations                                                                                                                   |
| ADR-0009                     | Supersede Client Redaction entirely                                                                                                                                                            |
| ADR-0011                     | Retain separate password recovery authority; replace pause/sign-in return policy                                                                                                               |
| ADR-0014                     | Replace same-photo retry and local sign-in recovery; define stop-versus-dispatch race                                                                                                          |
| ADR-0016                     | Retain Draft cleanup/audit preservation; remove new Test/stock work and all past-Event redaction/deletion                                                                                      |
| ADR-0017                     | Replace independent package/print counts; retain field, schedule and revision validation                                                                                                       |
| ADR-0022                     | Retain private transactions and idempotency; replace pause grant lifecycle and accounting model                                                                                                |
| ADR-0023                     | Retain `/booth`; replace handoff on ordinary pause/failure                                                                                                                                     |
| ADR-0024                     | Historical implementation reference; replace tests, quality corrections, reconnect revocation and old recovery flow; preserve bounded metadata reconciliation, one-send and origin protections |

Unaffected decisions remain in force: photo privacy (0001), visual system (0010), local HTTPS (0013), Auth reset safety (0015), component placement (0020) and the shared typography policy (0019 at the time of this decision; replaced by [ADR-0033](0033-adopt-apricot-studio-design-system.md) on 2026-11-04, then [ADR-0034](0034-use-november-screen-reference-in-implementation-plan.md) on 2026-11-06). ADR-0018 remains superseded by 0020. [ADR index](README.md) links every decision and its current scope.

## Refinement

[ADR-0026](0026-order-captures-by-shutter-time.md) refines Capture eligibility at reservation and dispatch: use acknowledged shutter time, permit explicitly selected ties, and never substitute the bound photo. [ADR-0027](0027-draft-only-event-media.md) further defines Draft-only Event Media changes and trusted upload limits. All other product decisions here remain in force. [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) supersedes legacy-data preservation, conversion and migration-chain retention with complete removal and a fresh development schema.

[ADR-0028](0028-define-monthly-event-count.md) clarifies Dashboard monthly Event counting: include Draft/Live/Completed and exclude Cancelled. It changes no package accounting, retention or release gate here.

## Consequences

The product tracks booked output and exceptional attempts without pretending to know physical inventory. The Admin still loads film and inspects genuinely unknown outcomes. Unresolvable hardware ambiguity can keep the booth unavailable; it cannot be hidden by resetting counters. Manual loading confirmation is the fallback if automatic reload detection cannot be proven. Missing reliable automatic normal completion keeps printer-backed operation disabled.

The original decision did not itself change code or database behavior. Version-2 contracts and cutover safeguards have since been installed for local verification; global activation has not occurred. #10 must integrate the application, remove all legacy implementation and compatibility paths, and verify a fresh package-only database under ADR-0029. Do not build legacy accounting snapshots or Draft conversion/review. See contract section 8 and the [issue #9 verification record](../implementation/issue-9-package-contracts-review.md). The [proof checklist](../qualification/booth-recovery-proof-checklist.md) separates actual observations from pending work.
