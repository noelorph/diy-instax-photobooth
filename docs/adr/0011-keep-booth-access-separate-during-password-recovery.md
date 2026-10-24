# Keep Booth access separate during Admin password recovery

> **Current scope (2026-10-21):** Password recovery stays separate from Booth authority; routine pause no longer sends the iPad to sign-in. [ADR-0025](0025-package-accounting-and-booth-recovery.md) and the [replacement contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) control conflicting behavior. The original decision below is retained as history.

Profile Sign out ends only the current device's Admin session, while a successful password reset ends every Admin session and requires fresh sign-in. Neither action revokes an active Booth Access Grant: that grant is limited to one Live Event and cannot authorize Admin work, and interrupting Guest printing during an Event could leave a physical print outcome uncertain. The Admin still pauses or ends Booth Mode explicitly to revoke its grant, accepting continued scoped booth operation while Admin sessions are re-established.
