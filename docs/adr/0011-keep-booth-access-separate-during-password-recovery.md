# Keep Booth access separate during Admin password recovery

Profile Sign out ends only the current device's Admin session, while a successful password reset ends every Admin session and requires fresh sign-in. Neither action revokes an active Booth Access Grant: that grant is limited to one Live Event and cannot authorize Admin work, and interrupting Guest printing during an Event could leave a physical print outcome uncertain. The Admin still pauses or ends Booth Mode explicitly to revoke its grant, accepting continued scoped booth operation while Admin sessions are re-established.
