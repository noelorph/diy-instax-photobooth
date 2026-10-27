# DIY Instax Photo Booth — Product Requirements

**2026-10-27 media availability:** [ADR-0031](docs/adr/0031-temporarily-disable-event-media-uploads.md) preserves the planned Event Media feature and page/design sections, but uploads are temporarily unavailable. Release may ship with uploads disabled; media resolution/qualification is optional before release in that state. Full enabled-media work requires supported cleanup and delivery/playback qualification. Existing retention, private access and prior-authorized Draft cleanup-pending safeguards remain.

**Status:** Approved target product, revised 2026-10-25 for the approved media/count/readiness rules and complete legacy removal under ADR-0029. Version-2 database contracts, handlers and a provisional simulator path are verified for the #9 software prerequisite; the [issue #9 review](docs/implementation/issue-9-package-contracts-review.md) records the passing 2026-10-25 software acceptance and retained failures; GitHub #9 is closed as completed. Existing Admin/Booth screens still use legacy flows until #10. Hosted deployment and #17/#7 physical qualification remain open.
**Contract:** [Accounting, access and Booth recovery](docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md).
**Decision:** [ADR-0025](docs/adr/0025-package-accounting-and-booth-recovery.md). **Presentation:** [Design system](DESIGN_SYSTEM.md). **Boundaries:** [Architecture](ARCHITECTURE.md).

## 1. Product summary

A web-based photo booth for paid and private Events. The Admin prepares an iPad A16 running Bluefy and an Instax Mini Link 3. Guests capture, review, optionally Retake and receive one physical print. Booking and payment happen outside the product. One Admin account, one booth and one printer are supported; only one Event may be Live.

The Admin can manage a Live Event from their phone. Routine failures and deliberate pauses keep the iPad in Booth Mode without Admin sign-in. Physical equipment intervention remains necessary when film runs out or a fault cannot be resolved remotely.

Outside the first release: offline operation, booking/payment, Guest accounts, photo galleries, digital delivery, editing/filters/stickers, revenue reports, dashboard charts and list/grid toggle. Guest photos are never stored or uploaded.

## 2. People and language

- **Admin:** sole owner, authenticates to manage Events and inspect exceptional failures.
- **Client:** one booking contact per Event; does not sign in.
- **Guest:** attendee using Booth Mode without an account.

Use [GLOSSARY.md](GLOSSARY.md). Each Film Package always provides ten Event prints. Adding a package and physically loading one are separate actions.

## 3. Development and launch feasibility gates

Integrated development may use a nonproduction simulated printer. Real printer-backed Booth Mode and Confirmed Print accounting require physically validated **automatic full-ejection completion**. Phone inspection is exceptional recovery, never a substitute for automatic ordinary success. Acknowledgement, time elapsed, printer-reported count and unqualified status fields do not prove ejection. The original iPhone evidence remains partial: seven fresh-film prints matched review; a separate used-sheet sequence demonstrated Retake and the old local limit. It did not prove reliable automatic completion or the original full fresh-film sequence. See the dated [#17 evidence report](docs/qualification/issue-17-trial-report.md).

The [proof checklist](docs/qualification/booth-recovery-proof-checklist.md) controls the remaining work: automatic completion, reliable no-film classification, safe recovery and printer readiness after possible delivery, and optional reload detection with Admin confirmation as fallback. Record actual device/software/firmware versions for each trial; do not treat an old count or report as today's physical film state.

The **actual iPad A16** must pass a separate end-to-end release trial with Bluefy, Mini Link 3, Guided Access, camera/permission setup, portrait crop/orientation, consecutive fresh-film sessions including Retake, booked-print exhaustion, package addition, empty-printer/reload handling, Bluetooth/internet/camera interruptions, reload recovery, remote pause/resume/finish and continuous printer power. The owner's iPhone is a development device only. Other browser/device support needs its own qualification. If a mandatory capability fails, keep real Booth disabled; simulation can continue. The trial record must include the exact iPad model and iPadOS version.

## 4. Event and print rules

### Event lifecycle and retention

States are Draft, Live, Completed and Cancelled; readiness is calculated separately. Save Draft identity/contact/venue/schedule fields with valid values, whole nonnegative package count, IANA venue time zone, existing unambiguous local times and end after start. Store UTC instants plus venue zone. Reject stale revisions instead of overwriting another edit. Zero packages are allowed in Draft, but first start requires a positive original booking.

Start changes Draft to Live. Booking/contact fields and original packages then freeze. The Admin may add whole Additional Film Packages while Live, including during pause. Finish Booth Mode ends a run; it leaves the Event Live. Complete or Cancel a Live Event only after all runs are Finished and all attempts terminal. A Draft can be Cancelled directly. Completed/Cancelled Events are immutable History records with no redaction or deletion action. A never-started Draft can be deleted when no current run/attempt work exists and private media is removed; keep only opaque audit references. Deletion is incomplete until media cleanup succeeds. Outstanding transfers and leftover backend bytes must be accounted for; an empty listing alone is insufficient. Under [ADR-0030](docs/adr/0030-fence-event-media-commits-and-require-cleanup-proof.md), the current implementation keeps media-bearing Draft deletion pending until a supported cleanup proof exists.

### Packages and confirmed ejection

```text
total booked prints = 10 × (original Film Packages + Additional Film Packages)
prints remaining   = total booked prints − Confirmed Prints
prints available   = prints remaining − unresolved Print Attempts
```

One unresolved attempt holds one print and the single printer slot. Reservation requires positive availability. A full ejection counts once even if the image is unusable; no quality refund. Not-printed releases its hold. Unknown stays pending and blocks another guest until reliable feedback or phone Admin inspection establishes Printed / Not printed with a reason. Not printed requires the old job cannot later eject. No automatic resend or reuse of the abandoned photo.

Five packages provide 50 prints. After all 50 are used, show **“All booked prints have been used. Please ask the Admin to add another Film Package.”** Adding one whole package adds ten. Loading film changes readiness only; no printer counter creates capacity or physical inventory.

There is no separate editable Print Allowance, Additional Prints entry, shared Film Stock inventory, Wasted Film correction or in-app Test Print. Setup shows only **“Always test the printer before starting Booth Mode.”** No optional test button, test result or output-inspection prerequisite exists in the app. Independent setup tests are outside Event accounting.

Each completed shutter counts as one Capture, including Retakes; pre-shutter cancellation does not. Capture and print totals are separate. Non-photo metadata can be reconciled idempotently; a session may end while its print outcome remains pending. See the contract for the bounded terminal Capture reconciliation rule.

## 5. Admin experience

### Authentication and navigation

The sole Admin is provisioned through Supabase Auth's Dashboard/Admin API; no public signup or Client accounts. AppShell navigation: Dashboard, Events, History, Profile, with Profile last. Responsive rail/menu, English UI, explicit venue time-zone labels. Entering Booth Mode signs Admin out **locally on the iPad only** and issues limited device access; a phone Admin session remains available.

`/sign-in` has email/password, Sign in and Forgot password; normal success goes to `/dashboard`. Protected pages check current Admin session and reveal no data when signed out. `/forgot-password` gives neutral account-independent confirmation and retry feedback. `/reset-password` handles invalid/expired/reused links safely. Reset requires a different password and confirmed global Admin-session revocation before success; an incomplete revocation remains visibly incomplete. A valid active recovery session may retry with a different password; otherwise request a new link. An active Booth Access Grant is independent and is not revoked by Admin password reset. [ADR-0015](docs/adr/0015-complete-admin-reset-only-after-password-change-and-revocation.md) retains the full security contract.

Routine fault/pause recovery does not open sign-in on the iPad. Finished Booth Mode has Sign in. Missing/expired/revoked device access or failed initial handoff may require exceptional local setup/sign-in; authentication alone never starts guest work. Exceptional same-run access replacement activates a new limited grant into Paused; the Admin then explicitly resumes from the phone when ready. It cannot reverse Finishing.

### Dashboard — `/dashboard`

Show Events scheduled in the current venue-local month, upcoming Events and next Event. Monthly Events counts nondeleted **Draft, Live and Completed**, excluding **Cancelled**, using scheduled start rather than creation time. Compare the scheduled start and the server's current instant in each Event's venue time zone. Four in-month Events with one Cancelled show **3**; Completed still counts. Total Events booked excludes Cancelled/deleted Events across all months. Upcoming/Next uses future scheduled starts of Draft/Live Events. See [ADR-0028](docs/adr/0028-define-monthly-event-count.md). Activity lists creation/Draft deletion, media uploads, Captures, print outcomes/inspection, package additions and booth actions; newest first, 7/30-day filters, 25 rows per page. Activity references Event/action without duplicating contact details or photos. Detailed charts and revenue remain out of scope.

### Events — `/events`, `/events/new`, `/events/[eventId]`

Events lists Draft and Live Events, with future scheduled start as an Upcoming annotation; overdue Drafts remain visible. New/Edit captures Event name, Client name/email/phone, venue/address/time zone, start/end and original Film Packages. Show derived total prints, with no independently editable print count.

The Event detail page shows booking/contact information, original/additional package counts, Confirmed Prints, pending attempt and prints available. Phone controls are **Add Film Packages**, **Confirm film loaded** when a reload is needed, exceptional **Printed / Not printed** inspection with reason, **Pause Booth**, **Resume Booth**, **Finish Booth Mode**, and **Complete Event** when eligible. Explain each consequential action. Additional package entries include a Client-request note and are immutable.

Initial start is performed on the booth iPad from this page: verify internet/server, live camera, printer connection/readiness, film loaded, printer power and Guided Access; show the test reminder and require positive capacity. Activate the grant after local Admin sign-out/receipt handoff, then open `/booth`. Before admitting a Guest, establish fresh camera/printer readiness under scoped access after navigation; setup observations do not prove that browser resources survived cleanup. No Test Print prerequisite or button. Remote phone Resume reuses valid device access and requires readiness; it never performs a fresh iPad sign-in.

Current media sections remain visible with **“Media uploads are temporarily unavailable.”** and disabled upload controls. Trusted boundaries deny new upload/attachment/replacement mutations. Default Booth presentation supports the disabled release; media is not a readiness requirement.

Planned optional private media when enabled: a portrait image around the preview and on welcome; a silent looping montage up to 30 seconds on welcome. Montage takes priority, image is fallback, default works with neither. Start always available; pause-video control and reduced-motion static image/default. Media never alters captured/printed photos. Upload validation and private access remain required.

When enabled, upload, replacement and removal are Draft-only, with authority, state and revision rechecked when the change commits. Accept one still JPEG/PNG/WebP background up to 10,000,000 bytes and one MP4 H.264/AVC montage up to 50,000,000 bytes with positive duration at most 30 seconds. Reject animated images and validate actual content at the trusted boundary; no conversion, trimming or editing. Failed/stale changes preserve existing media. Live media is frozen even while the Booth is Paused or Finished; Completed/Cancelled media remains retained. See [ADR-0027](docs/adr/0027-draft-only-event-media.md).

### History — `/history`

List Completed/Cancelled Events with name, schedule, venue, Client contact, package counts and print totals. Retain media and audit history under Admin access. No redaction or deletion controls. History contains package-model Events only. Existing disposable development/test records are discarded during the later fresh-schema rebuild; no legacy reader or conversion UI is required.

### Profile — `/profile`

Verified Admin email, optional phone, light/dark preference, authenticated password change and **Sign out**. Sign out ends the current device's Admin session only. Booth Mode retains its dark theme and independent access. No profile picture required.

## 6. Booth Mode experience

### Guest flow

Welcome montage/image/default with **Start** → live preview with **Take Photo** → **3–2–1** → captured-photo review with **Retake / Print** → honest printing indication until confirmed ejection and recorded outcome → **Print complete** for 3 seconds → fresh welcome.

Preview is mirrored; review and print use the same unmirrored portrait crop. Retake returns to preview for another completed shutter. Print uses the explicitly selected acknowledged Capture with the newest shutter timestamp (`captured_at`), regardless of metadata arrival order. Equal timestamps permit either selected Capture. Reservation and dispatch both enforce this rule; a newer acknowledged shutter blocks an older reserved photo without substituting another photo. See [ADR-0026](docs/adr/0026-order-captures-by-shutter-time.md). At 75 seconds of capture/review inactivity, warn with Continue; at 90 seconds abandon and discard the photo. Countdown/printing are not subject to that inactivity timer. Guest photo bytes stay in browser memory/direct print transport only.

### Recovery

The [contract failure matrix](docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md#4-failure-and-recovery-contract) is normative. These are its guest-facing rules:

| Situation                             | Message / action                                                                  | Return rule                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Bluetooth disconnected                | **Bluetooth disconnected. Please inform the Admin.** / **Connect to Instax** only | Reconnect, reconcile any old attempt, verify readiness; then welcome                                                |
| Camera disconnected                   | **Camera disconnected. Please inform the Admin.** / **Enable Camera**             | Before print discard/end; during print settle it first; permission and live feed restored → welcome                 |
| Detected offline connectivity         | **Wi-Fi disconnected. Please inform the Admin.**                                  | Discard/end unsent session; possible delivered print must resolve; restored server connection → welcome if ready    |
| Server fault without known Wi-Fi loss | **Connection unavailable. Please inform the Admin.**                              | Same recovery; no false network diagnosis                                                                           |
| Reliably empty printer                | **Printer is out of film. Please inform the Admin.**                              | Phone Event shows Film reload needed; physical reload + Confirm film loaded; resolve any unknown attempt separately |
| Unknown print/other printer fault     | **Booth is temporarily unavailable. Please inform the Admin.**                    | Reliable outcome or phone inspection, and printer ready; no timed auto-clear                                        |
| Page reload                           | Photo discarded; state reconciled                                                 | Definitely unsent → welcome if ready; possible send → unavailable until resolved                                    |
| Admin pause                           | **Booth paused**                                                                  | Phone Resume required even after every equipment issue clears                                                       |
| Admin finish                          | **Finishing Booth Mode**, then **Booth Mode finished** / **Sign in**              | Wait for unresolved print before finishing; no automatic new run                                                    |

No fault retries the old photo or resends its command. Before possible delivery, end the old session and return to welcome after reconnection. After possible delivery, allow printing to finish if possible, keep the outcome pending until established and block new guests. Cancellation after delivery cannot be promised. The iPad remains in Booth Mode throughout normal recovery.

Reload confirmation does not reject all previous attempts, add package capacity or prove output. If an outcome is unknown, the phone shows extra Printed / Not printed with a required reason. Known outcomes require no inspection choice. If inspection cannot establish that the old job is finished/cleared, stay unavailable. Automatic reload detection is optional after qualification; manual confirmation is the approved fallback.

All blockers must clear independently. A recovered connection never overrides Paused or Finishing. Stopping before dispatch wins atomically and denies the send; a dispatch authorized first may still print, so Pause/Finish prevent later work and wait for its outcome. No guest-facing pause/exit gesture leads to routine Admin takeover.

## 7. Privacy and access

Guest photos are never uploaded, persisted, logged, or placed in History. Discard after completion/abandonment/fault; release in-flight transport buffers when safe. Only anonymous metadata remains. Event Media is private stored booking content, separate from Guest photos. Completed and Cancelled booking contact/media is retained with no product deletion/redaction action. Existing pre-reset development/test records are outside this ongoing retention policy.

The device grant permits sanitized Event/run state and scoped guest operations only. Admin access, contact data, package additions, load confirmation, inspection and lifecycle management require a current Admin session. Grant stays valid through normal pause/fault, with bounded expiry and security revocation as specified in the contract. Guest-facing recovery controls cannot alter counts or claim an inspected outcome.

## 8. Acceptance criteria

- Full Guest sequence, fixed package capacity and last-print behavior work without duplicate sends/counts.
- Ready initial setup has a sentence reminder only; no test button/inspection gate.
- Phone recovery and pause/resume keep valid iPad Booth access; each fault returns to a new guest interaction only when safe.
- Unknown attempts hold capacity and printer slot; physical reload does not dismiss them.
- Finish Booth precedes Complete Event; Draft deletion is safe; terminal History remains retained.
- Auth/RLS, privacy, stale edits, expired access, lost responses, reload journaling, concurrency and stop races meet the contract.
- [Physical proof checklist](docs/qualification/booth-recovery-proof-checklist.md) passes automatic normal completion, required recovery and actual iPad release gates.
- Later implementation removes obsolete write paths and handles existing data as specified in contract section 8. This documentation revision itself does not meet those implementation criteria.

## 9. Decisions and documentation

[ADR-0025](docs/adr/0025-package-accounting-and-booth-recovery.md) records this decision and its supersession map. Use the [documentation index](docs/README.md) for active guides and dated evidence. The [GitHub issue publication record](docs/github-issue-update-drafts.md) distinguishes accepted #9 evidence, the published #10 body and F1–F8 links, and the unpublished #17/#7 drafts; old issue wording does not override this approved target.

[ADR-0029](docs/adr/0029-remove-legacy-features-and-reset-development-schema.md) records complete removal within #10. Remove all legacy application/schema/compatibility paths and replace the old migration chain with a verified package-only baseline. Do not build old-event preservation, Draft conversion/review or historical readers. Retain #9 current contracts and dated acceptance evidence; reverify them after the schema rebuild. The user approved the revised plan on 2026-10-25 and requested its documentation commit. F1–F8 are published as #29–#36. Implementation remains on hold; code and data are unchanged.
