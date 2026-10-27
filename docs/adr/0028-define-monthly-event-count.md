# ADR-0028: Define the monthly Event count

**Status:** Accepted clarification; the plan is approved. F7 implementation may proceed with uploads unavailable under [ADR-0032](0032-build-full-f2-with-uploads-unavailable.md); #30 stays open in #10 and is completed last before #10 closure.
**Date:** 2026-10-25
**Refines:** The Dashboard requirement in [PRD.md](../../PRD.md); complements [ADR-0025](0025-package-accounting-and-booth-recovery.md). No prior ADR is superseded.
**Approval:** The user explicitly chose to exclude Cancelled and count the remaining Draft, Live and Completed Events.

## Context

The PRD excluded Cancelled Events from total Events booked but did not explicitly apply that exclusion to the monthly card. The F7 draft had assumed the exclusion. The definition must be agreed before implementation and tests choose it implicitly.

## Decision

- Count nondeleted **Draft, Live and Completed** Events whose scheduled start falls in the current calendar month in that Event's venue time zone. Convert both the server's current instant and the scheduled start to that venue zone; do not use creation time or the Admin device's zone.
- Exclude **Cancelled** Events and deleted Drafts. Four in-month Events, one in each state, produce a monthly count of **3**.
- Completed Events still count for their scheduled month. This is not a count of only future or unfinished work.
- Total Events booked continues to exclude Cancelled/deleted Events across all months. Upcoming/Next continues to use future scheduled starts of Draft/Live Events. Cancellation retains History and media; the count exclusion removes no record.

## Approaches

Excluding Cancelled was selected by the user. Including all four scheduled Events was the alternative; it would describe historical scheduling volume rather than the selected booking count. No additional metric or card is introduced.

## Consequences

F7 owns the four-state fixture, venue-month boundaries and rendered-card test; F8 checks the accumulated evidence. The PRD, glossary, functional design, diagram and presentation guides use the same definition. No #9 contract, accounting formula, capability dependency, retention rule or #17/#7 release gate changes.
