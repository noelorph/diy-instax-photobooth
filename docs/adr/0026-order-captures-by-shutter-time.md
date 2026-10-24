# ADR-0026: Order Captures by shutter time

**Status:** Accepted; implemented in version-2 local database contracts. Integrated UI and hardware qualification remain pending.
**Date:** 2026-10-22
**Refines:** [ADR-0025](0025-package-accounting-and-booth-recovery.md), without superseding its accounting, access or recovery decisions.
**Contract:** [Package accounting, access and Booth recovery](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md).

## Context

Capture metadata can arrive out of shutter order after a Retake or reconciliation. Ordering by database arrival time or UUID can make an older photo eligible and invalidate a reservation for the newer shutter. The existing validated `captured_at` records the completed shutter time; no additional sequence field is needed.

## Decision

- The newest acknowledged Capture is determined by its existing `captured_at`, within the same version-2 Guest Session and run. Reservation requires the explicitly selected Capture to exist in that scope and no acknowledged version-2 Capture in the session to have a strictly later shutter timestamp.
- Dispatch rechecks the attempt's bound `capture_id` against the same rule. It never selects or substitutes another photo. Older metadata arriving after reservation does not invalidate the selected newer shutter.
- Equal shutter timestamps permit either explicitly selected acknowledged Capture. Arrival time and UUID order do not break ties. A tied Capture arriving after reservation does not invalidate it.
- A genuinely newer acknowledged shutter arriving after reservation blocks dispatch of the older bound Capture. Existing reconciliation settles a proven unsent reservation as NotPrinted and releases its hold; no physical send or automatic photo substitution occurs.
- Retake returns to preview for another completed shutter. Every acknowledged Capture counts once regardless of metadata arrival, eligibility or whether its photo is discarded. Photo bytes stay in browser memory/direct printer transport.

## Consequences

Both reservation and dispatch use a strictly-newer existence check. Existing function signatures, payloads, timestamp validation, bounded late-Capture exception, receipt/revision checks, scope and access boundaries remain intact. Dispatch still uses its existing hold, including the last reserved unit at zero available prints. This decision adds no schema field or selection endpoint and does not establish hosted activation, integrated UI completion or physical qualification.
