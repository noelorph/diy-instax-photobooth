# Validate Draft Event saves before operational setup

The pre-gate Admin foundation may save and edit an Event only in **Draft** state. A Draft may have zero booked Film Packages or zero original Print Allowance while its booking details are being prepared; both counts must be whole and nonnegative. This does not make the Event ready for Booth Mode. Later readiness still requires the applicable positive resources and hardware checks.

The Admin enters a venue-local schedule with an IANA time zone. Save rejects an invalid zone, a nonexistent or ambiguous local time, or an end instant that is not after the start. The app explains the affected field and asks for an unambiguous time instead of silently shifting the schedule or choosing an offset. Saved instants are stored in UTC along with the venue time zone for display.

Concurrent edits to the same Draft must not silently overwrite a more recent save. A stale edit reports a conflict and lets the Admin reload the latest record before trying again. This protects booking and Client details when the sole Admin uses more than one device.

This decision implements the approved [Draft Event specification](../superpowers/specs/2026-10-13-draft-event-management-design.md) for [issue #14](https://github.com/noelorph/diy-instax-photobooth/issues/14). Draft deletion and operational transitions remain governed by their separate issues and decisions.
