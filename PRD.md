# DIY Instax Photo Booth — Product Requirements

**Status:** Product scope agreed; target-device printing and booth operation remain feasibility gates.
**Date:** 2026-10-12
**Source:** [Initial product prompt](docs/prompts/prd-prompt.md), followed by the product interview and [domain decisions](docs/adr/).
**Architecture:** [Proposed first-release design](ARCHITECTURE.md).
**UI/UX:** [Design system](DESIGN_SYSTEM.md).

## 1. Product summary

DIY Instax Photo Booth is a website-based photo booth for special Events, including paid Client Events. An Admin prepares an Event and runs the booth on an iPad A16. Guests take a photo, retake it if desired, and receive one physical Instax Mini print from an Instax Mini Link 3 printer. Booking and payment happen outside the product.

The first release must support the full path from Event setup through a confirmed physical print, with accurate Print Allowance and Film Stock records. Its target booth browser is Bluefy on the iPad A16, conditional on the hardware trial in section 3.

## 2. People and boundaries

| Person | Role in the product                                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin  | The sole owner account. Creates Events, prepares equipment, starts and ends Booth Mode, resolves failures, and reviews history. The Admin may manage a Live Event from a second device. |
| Client | One contact associated with an Event. The Client does not sign in.                                                                                                                      |
| Guest  | An Event attendee who uses Booth Mode without an account.                                                                                                                               |

**Outside the first release:** booking, payment, guest accounts, photo galleries, digital photo delivery, filters, stickers, photo editing, revenue reporting, and operation without internet. Detailed dashboard charts and the Events list/grid switch are later improvements.

## 3. Development and launch feasibility gates

Development, printer integration, and launch have distinct checkpoints. The October 2026 iPhone work demonstrated the combined Bluefy camera and printer path, seven correctly cropped and oriented fresh-film prints, and a separate three-sheet used-film run with Retake and local allowance exhaustion. The operator reported that a fourth trial was blocked; the supplied log has no fourth print command. The work did **not** prove a reliable automatic signal for complete physical ejection or complete the original single-run fresh-film qualification. These results permit integrated Admin and Booth development with a simulated printer and replaceable browser-side adapter. The operational decisions raised in [issue #8](https://github.com/noelorph/diy-instax-photobooth/issues/8) are resolved: remote pause or completion stops preview, countdown, or review before reservation; a completed Capture remains counted and its unprinted photo is discarded; a clear pre-film rejection permits an explicit retry only while Booth Mode remains active and ready; and a Draft may be deleted after reservations resolve while identifying details are erased and opaque operational history and stock effects are retained. See [ADR-0014](docs/adr/0014-stop-booth-before-print-reservation.md) and [ADR-0016](docs/adr/0016-keep-history-when-deleting-draft.md). Development must preserve distinct accepted, physically confirmed, clearly rejected, and uncertain outcomes; an unverified signal must not create a Confirmed Print or trigger an automatic resend.

**Before completing or enabling printer-backed Live Event Booth Mode, Test Prints, stock consumption, and Confirmed Print accounting**, choose and validate a physical-ejection confirmation approach. Continue investigating reliable automatic detection with fresh film. If it remains unproven, a supervised/manual approach is an option only after its operating rules, authorization, recovery, accounting effects, and physical trial are explicitly approved. Command acknowledgement, Film Remaining, the candidate `12 7f` field, and qualification-harness observation taps alone do not authorize a Confirmed Print. Ambiguous outcomes remain uncertain, with no automatic resend. The owner's **iPhone 15 Plus, Bluefy, and Mini Link 3** remain the development/test setup; reported versions were iOS **26.2.1**, Bluefy **3.9.3**, and firmware **0102(RX)** and must be recorded again for any new qualifying trial. Physical qualification sheets are recorded manually, not as Event Test Prints or Confirmed Prints. See [ADR-0021](docs/adr/0021-move-print-qualification-to-integration-checkpoint.md) and the [issue #17 evidence report](docs/qualification/issue-17-trial-report.md).

The **iPad launch gate** remains separate. The product must not promise first-release direct browser printing until a trial on the **actual iPad A16, Bluefy version, and Instax Mini Link 3** demonstrates all of the following together:

1. The Admin can pair the printer and grant camera and Bluetooth permissions during setup; no permission prompt interrupts a Guest Session.
2. The booth fills the usable screen in its canonical portrait layout, maintains camera preview and printer access, and prevents Guests from reaching browser navigation or Admin pages. The Admin uses iPad Guided Access as part of setup. The iPhone compact layout is a development test surface, not a supported first-release booth; other phone and laptop layouts remain responsive previews.
3. A photo can be sent to the printer, and the booth can reliably detect **physical film ejection**. Development of the image after ejection is outside the wait.
4. Three consecutive Guest Sessions complete, including a Retake. The trial also demonstrates exhausted allowance handling and recovery from a printer disconnect.
5. Camera preview and Bluetooth access remain usable through the combined fullscreen, capture, and printing flow. The printer can operate as required while connected to power.

If the iPad trial fails, the affected browser, printing, Booth, or shared accounting boundary must be revisited and verified before release; changes need not be limited to iPad-specific presentation. Safari and Chrome become supported booth browsers only after the same end-to-end trial succeeds on them. Bluefy's [Web Bluetooth guide](https://bluefy.app/guide.html) documents iPhone and iPad support, and [Apple documents Guided Access on both](https://support.apple.com/en-ie/111795); neither source establishes this product's Mini Link 3 integration. Fujifilm documents [Bluetooth 5.1 and approximately 15-second printing](https://www.fujifilm.com/us/en/consumer/instax/printers/minilink3/specifications); its published product flow uses the native Instax app.

Record the exact iPad model and iPadOS version during its trial rather than assuming them in implementation. A loaded, usable fresh-film pack is required for each qualifying physical-print trial. The earlier fresh-film iPhone trials and later used-film diagnostics have different evidentiary value; the printer-reported count can disagree with the number of physical sheets loaded. Keep their current evidence and film state in the [issue #17 trial report](docs/qualification/issue-17-trial-report.md). Connection, status, and simulated checks alone cannot establish correct image output or reliable ejection feedback. The actual iPad trial must validate the chosen ejection-confirmation approach before launch. See [ADR-0021](docs/adr/0021-move-print-qualification-to-integration-checkpoint.md), [ADR-0012](docs/adr/0012-qualify-development-on-iphone-before-ipad-launch.md), and the [original issue #17 qualification design](docs/superpowers/specs/2026-10-13-iphone-print-qualification-design.md).

## 4. Event and print rules

### Event lifecycle

An Event has one Client and a venue-local scheduled start and end time. Each Event stores its own Client contact details; redacting one Event does not change another Event booked by the same person. Its explicit state is **Draft**, **Live**, **Completed**, or **Cancelled**. Readiness is calculated from the setup checks; it is not a separate state. The Admin may start early or late and explicitly marks a Live Event Completed. An Event cannot be completed or cancelled while a Print Reservation or Film Reservation is unresolved. The first release allows only one Live Event across the system because it uses one booth iPad and one printer.

A Draft Event may be deleted after all of its Print and Film Reservations are resolved, even if it has a Test Print, Film Stock entry, or other operational record. Deletion removes the Draft from Events and erases its Client details, Event title, venue and schedule details, and Event Media. Report deletion complete only after the media is removed. Its operational records, their effects on shared Film Stock, and a Draft deletion activity entry remain under an opaque deleted-Event reference without those identifying details. Completed and Cancelled Events stay in History, with an option for Client Redaction while preserving anonymous Event and print totals.

### Print accounting

The Admin records both the number of booked Film Packages and the **original Print Allowance in individual guest prints**. The system does not infer a fixed number of prints per package. Additional Prints increase the allowance; their purchase is handled outside the product.

Film Stock is the Admin-recorded shared inventory of physical Instax sheets available across Events; remaining sheets carry forward when an Event ends. Test Prints reduce Film Stock but do not use the Guest Print Allowance. Confirmed guest prints reduce both. The Admin may record additions while a print is pending. To reconcile a discrepancy, the Admin first resolves all Film Reservations, then enters an observed physical sheet count and a reason; the correction remains in stock history. A new Guest Session requires at least one available guest print and one available physical sheet.

The remaining guest allowance is:

`original Print Allowance + Additional Prints − Confirmed Prints − unresolved Print Reservations`

Available Film Stock is the current inventory balance, after Confirmed Prints, Test Prints, additions, and reconciliations, minus unresolved Film Reservations.

When a Guest selects Print, the booth creates one Print Reservation and one Film Reservation before sending the job. A Test Print uses a generated calibration image and creates only a Film Reservation. The authorized booth browser reports printer feedback; the server accepts an ejection report only for the matching pending attempt. Reliable detection of film ejection turns the Guest attempt into a Confirmed Print and consumes the held sheet. If the ejected sheet is unusable, the Admin may reclassify it as Wasted Film: Film Stock stays reduced and the Event's Print Allowance is restored. The ejected Guest Session stays closed; a replacement uses a new Guest Session and new Capture because the original photo was discarded. A clear pre-film rejection, meaning reliable printer feedback confirms no sheet was used, releases both reservations. If Booth Mode remains active and readiness still passes, the Guest returns to review with the selected photo in browser memory and may explicitly choose Print again; that creates a new Print Attempt, never an automatic resend. If readiness fails, the booth requests Admin help. An uncertain result keeps the holds and pauses the booth until the Admin inspects the printer and resolves the outcome. If the browser reloads or crashes after reservation and the server cannot prove whether the command reached the printer, the outcome is uncertain. The booth does not automatically resend an uncertain job.

### Capture accounting

One shutter press is one Capture, including photos later replaced by Retakes. Capture totals and Confirmed Print totals are separate. Retakes do not use Print Allowance. Each completed Guest Session produces one chosen photo and one physical print; an additional copy requires a new session and another print from the allowance.

Non-identifying Guest Session and Print Attempt records keep IDs, timestamps, Capture counts, and print outcomes with Event history for accounting and recovery, but no Guest identity or photo. The booth may persist non-photo operation IDs and Capture metadata locally until the server acknowledges them, then retry after a reload without double-counting.

## 5. Admin experience

### Authentication and navigation

- Only the Admin can sign in with email and a secure password. There is no public signup. The Admin account is provisioned through the [Supabase Auth dashboard or Admin API](https://supabase.com/docs/guides/auth/users), avoiding [direct SQL insertion into Auth tables](https://supabase.com/docs/guides/troubleshooting/database-error-saving-new-user-RU_EwB). Two-factor authentication is not a launch requirement and may be added later.
- The shared Admin AppShell provides Dashboard, Events, History, and Profile navigation. Profile sits at the bottom of the sidebar.
- The Admin sidebar becomes a collapsible rail on tablets and a menu on phones; Profile remains last in each navigation layout. First-release UI copy is in English. Event schedules appear in venue-local time with an explicit time-zone label where ambiguity matters.
- Entering Booth Mode ends the Admin session **on the booth iPad only** and issues that device a revocable Booth Access Grant limited to the Live Event, with no access to Client contact details or Admin actions. The grant survives an ordinary reload or brief connection loss, but pausing or ending Booth Mode revokes it. A paused Event remains Live; resuming requires Admin sign-in and a new grant. An Admin session on another device can remain active. Returning to Admin pages requires sign-in.

### Admin sign-in — `/sign-in`

The public sign-in page has labeled email and password fields, a **Sign in** action, and a **Forgot password?** link to `/forgot-password`. It has no signup option or authenticated Admin navigation. Signed-out attempts to open Admin pages lead here without revealing protected Event or Client details. Ordinary sign-in opens `/dashboard`.

The Booth iPad uses this same sign-in form after a pause, expired grant, or failed Booth handoff. That entry shows **Booth paused** on a dark surface, with no Event name, Client details, printer diagnostics, or Booth recovery controls before authentication. Successful sign-in on the same paused device opens the Live Event's management page, where the Admin reviews its actual state and explicitly chooses **Resume Booth Mode**; sign-in alone never restarts Guest access. Invalid fields, incorrect credentials, connection failure, and an expired Admin session show persistent, actionable feedback. Incorrect-credential feedback does not disclose whether an email belongs to an account.

### Request password recovery — `/forgot-password`

The public recovery request page accepts the Admin email and offers **Send recovery link** and a return to `/sign-in`. It is reachable from ordinary and paused sign-in. After a request, it shows the same neutral check-your-email message whether or not the address belongs to the Admin account. A delivery or connection failure shows a retry action without revealing account existence. No Event or Client information appears on this page, including when recovery begins on a paused booth iPad.

### Set a new password — `/reset-password`

The recovery email links to this page, where a valid recovery link lets the Admin enter and confirm a new secure password. An invalid, expired, or already-used link cannot change the password and offers a path to request another link. The recovery pages show no Admin data. Reusing the current password is an error, not a completed reset. A successful reset ends **all Admin sessions**, including sessions on other devices, and asks the Admin to sign in with the new password. If the password saves but session revocation is not confirmed, the reset remains visibly incomplete. When the recovery session is confirmed active, the Admin can enter another different password to retry. When it is revoked or cannot be verified, the page explains that the outcome for all sessions is uncertain and directs the Admin to request a new recovery link. Other sessions may remain active until revocation succeeds. A Booth Access Grant is separate and remains active if a Live booth is running; password recovery never resumes a paused booth automatically. If recovery finishes on the same paused iPad, fresh sign-in returns to that Live Event's management page. Recovery opened on another device follows ordinary sign-in to `/dashboard`.

### Dashboard — `/dashboard`

The first release shows scannable cards for Events scheduled in the current month, upcoming Events, and the next Event. A monthly count uses scheduled start time, not creation time. “Total Events booked” means recorded Events other than Cancelled ones.

An activity table lists Event creation and Draft deletion, background and montage uploads, Captures, print outcomes and resolutions, and Film Stock adjustments. It starts with the newest activity, supports 7-day and 30-day filters, and loads 25 rows per page. Entries identify the Event and action without copying Client name, email, phone, or guest images.

A later release adds interactive 7-day, 30-day, and 90-day charts for Captures and Confirmed Prints, with KPI sparklines. Revenue is excluded because payment happens elsewhere.

### Events — `/events`

The first release lists Draft, upcoming, and Live Events, identifies the next scheduled Event, and links each row to `/events/[eventId]`. Upcoming means a non-cancelled Event with a future scheduled start. Overdue Draft Events remain visible for Admin attention. A grid view toggle may be added later. Completed and Cancelled Events appear in History.

At `/events/new`, the Admin enters:

- Event name; Client name, email, and phone;
- venue address and venue time zone;
- scheduled start and end;
- booked Film Package count and original Print Allowance.

The Admin can edit these details before the Event goes Live. The product records the Event as Draft until Booth Mode starts.

During Draft creation and editing, the required identity, contact, venue, and schedule fields must be valid. Film Package count and original Print Allowance must be whole and nonnegative; either may be zero while the Event remains Draft. The venue-local schedule must use a valid IANA time zone, an unambiguous existing local start and end, and an end instant after the start. Invalid or ambiguous times are rejected with a field-level explanation rather than shifted or guessed. A stale edit from another device must not silently overwrite newer Draft details. See [ADR-0017](docs/adr/0017-validate-draft-event-saves.md).

### Specific Event — `/events/[eventId]`

The page displays the Event name, state, schedule, venue, Client contact, Film Packages, original Print Allowance, Additional Prints, remaining allowance, Film Stock, and print totals. It lets the Admin upload and preview optional custom media:

- A portrait background image for welcome and the area around the camera preview in Booth Mode. It is never composited into the Guest photo and does not alter the printed photo. Review and printing use controlled surfaces so the photo and status remain readable.
- A silent montage of at most 30 seconds for the welcome screen. It loops, can be paused, and Start is available at any point. When both assets exist, the montage takes priority on welcome and the still image is its fallback; the still image also appears around the camera preview. Reduced-motion users see the still image or default welcome instead of an autoplay montage. A default welcome screen works without either asset.

Before first start, the Admin confirms that the printer has power and film loaded, and that Guided Access is enabled. The app checks internet, camera, Bluetooth printer connection, a successful Test Print, and positive Print Allowance and Film Stock. A new Test Print is required after printer reconnection, but not after every short Admin pause. The Admin can add Additional Prints and update Film Stock while the Event is Live; Client and booking details remain fixed until Booth Mode stops.

Before deleting a Draft, ending Booth Mode, reconciling Film Stock, resolving an Uncertain Print, or performing Client Redaction, the Admin reviews the specific consequence and then submits a clearly named action. Draft deletion explains that Event details and media are removed while Test Print and stock history remain; unresolved reservations block the action. Starting Booth Mode uses its readiness checklist without an extra confirmation.

### History — `/history`

History lists Completed and Cancelled Events and summarizes total non-cancelled Events and Captures. Each Event row shows its name, schedule, venue, Client name and contact details when retained, booked Film Packages, original Print Allowance, Additional Prints, Confirmed Prints, and remaining allowance. The Admin may perform Client Redaction without removing anonymous counts.

### Profile — `/profile`

Profile shows the Admin email and lets the Admin update a phone number and light/dark preference and change the password through an authenticated flow. It also offers **Sign out**, which ends only this device's Admin session and returns to `/sign-in`; an Admin session on another device and any active Booth Access Grant remain in place. The preference controls Admin pages; Booth Mode keeps its own dark camera and review presentation. No profile picture is needed.

## 6. Booth Mode experience

### Enter and leave

Starting Booth Mode from `/events/[eventId]` changes the Event to Live, presents the guest interface fullscreen, and ends the iPad's Admin session. iPad Guided Access is part of the Admin's physical setup. A discreet long press, with a keyboard/assistive-input equivalent, requests a pause and leads to Admin sign-in after an in-progress Print Attempt has finished and its result has been recorded; an interrupted attempt becomes an Uncertain Print for Admin resolution. The alternative never bypasses Admin sign-in. A pause before a Print Reservation discards the unprinted photo but keeps completed Capture counts; resuming starts at welcome. Ending Guided Access separately requires the iPad passcode. Guests must not be able to navigate to Admin pages.

### Guest flow

1. The welcome screen plays the silent montage, shows the Event background image, or shows the default background in that priority order, subject to the reduced-motion preference. It briefly tells Guests that they receive one physical print and that their photo is discarded after the session. A large Start touch target is available at any time.
2. Start opens a mirrored front-camera live preview framed to the portrait Instax Mini printable crop. The Event background image may appear around the preview but never inside the captured image. No filters, stickers, or editing controls are provided.
3. Take Photo begins the **3–2–1** countdown and makes one Capture.
4. The review screen shows the unmirrored image and final printable crop, then offers **Retake** or **Print**. Retake returns to the live preview without using allowance. The Guest may retake any number of times before printing.
5. Print reserves one allowance unit, disables duplicate submission, sends the selected photo, and shows honest phases such as preparing, sending, and waiting for film to eject as feedback permits. It does not show an invented percentage or treat command submission as a Confirmed Print.
6. On confirmed film ejection, the booth closes the Guest Session, discards the photo, and returns to the welcome screen for the next Guest. The Guest does not wait for film development.

After 90 seconds of inactivity on capture or review, an unprinted photo is discarded and the booth returns to welcome. A warning near the end offers **Continue**, which resets the timer. The timeout does not interrupt the countdown, an in-progress print, or a pre-send connection hold; it resumes when review is available again.

### Interruptions and recovery

- If the Admin pauses or completes the Live Event from another device before a Print Reservation exists, Booth Mode stops accepting new Guest actions. Preview and review end; a countdown stops without a Capture if the shutter has not fired. A completed Capture stays counted, but its unprinted photo is discarded. The booth shows a generic unavailable/help message followed by the protected sign-in handoff, with no Event or Client details before authentication. After sign-in, a paused Live Event requires an explicit Resume Booth Mode; a Completed Event has no resume action and is viewed in History. The booth checks its active state during use and again before Print. Pause/completion and reservation creation are ordered atomically: if the stop wins, Print cannot reserve or send; if reservation wins, completion waits for its outcome and a pause follows the in-progress-attempt rule.
- At zero remaining Print Allowance or Film Stock, new Guest Sessions stop and the booth requests Admin help.
- Internet loss pauses new sessions. If it happens before a print command, the selected photo remains only in browser memory while the page stays loaded and service returns or the Admin cancels. Once service and availability checks recover, the booth returns to review with Print available; the Guest must choose Print again, and nothing sends automatically. A reload loses the in-memory photo. If loss happens after a command, or command delivery cannot be ruled out, the result is Uncertain until resolved.
- A camera or printer disconnect pauses the booth and requests Admin help. The pause discards any unprinted photo while retaining completed Capture counts. Pairing and permission prompts are handled by the Admin, never by a Guest.
- After a clear pre-film rejection, the Guest can explicitly retry the selected in-memory photo from review only while Booth Mode and readiness remain valid. A pause, reload, or abandoned session discards it. Failed readiness pauses the booth, discards the photo, and requires Admin recovery before a new Guest Session; an Uncertain Print requires physical inspection and reconciliation before new Guest Sessions resume.
- Guest-facing interruption messages give a short next step such as asking the Admin for help. Printer diagnostics, reservation outcomes, and recovery actions appear only after Admin sign-in.

## 7. Privacy and access requirements

Guest photos exist only in the booth browser's memory for the active capture and direct print flow; they are never uploaded to Next.js or Supabase. They are discarded after a confirmed print, cancellation, or abandoned session; no photo gallery, email delivery, QR download, or persistent guest photo record is part of the first release. The activity log contains no guest images or copies of Client email and phone. Booth access is limited to the Live Event and cannot read Client contact details or reach Admin routes.

The Admin can perform Client Redaction on Completed and Cancelled Events, removing Client name, email, phone, and Event Media while preserving anonymous Event and print totals. Any activity display must reflect that redaction rather than retain a separate copy of the removed details. If the Event title itself identifies the Client, the Admin can rename it during redaction.

## 8. Acceptance criteria

The first release is ready for an Event only when:

- The target-device trial in section 3 succeeds, including reliable detection of film ejection and restricted guest navigation.
- The Admin can create a Draft Event, set its Client, schedule, package count, allowance, Film Stock, and optional media; pass setup checks; and start and end Booth Mode.
- A Guest can complete the countdown, Retake, and Print flow. Three consecutive physical prints, allowance exhaustion, and printer disconnect recovery succeed on the target setup.
- Test Prints, Confirmed Prints, Additional Prints, reservations, and Film Stock adjustments leave accurate, inspectable totals. Uncertain outcomes pause until Admin resolution.
- Remote pause or completion during preview, countdown, or review discards an unprinted photo and prevents a later Print; a reservation that wins the race blocks completion until its outcome is resolved. A clear pre-film rejection releases both holds and permits an explicit Guest retry with the same in-memory photo only while readiness passes; an uncertain outcome never permits retry.
- Deleting a Draft with a resolved Test Print or Film Stock entry removes its identifying details and Event Media while retaining the stock effect and anonymous operational history. A Draft with an unresolved reservation cannot be deleted.
- No guest photo remains in Event history, activity, or guest delivery after its session. Client Redaction removes contact details and Event Media without exposing the removed details in activity views.
- Dashboard, Events, History, and Profile routes show the agreed first-release information, and activity pagination loads 25 rows at a time.
- The Admin can sign in through `/sign-in`, sign out from Profile on one device, and recover a forgotten password through `/forgot-password` and `/reset-password`. Invalid recovery links fail safely; a successful reset requires fresh sign-in on every Admin device without interrupting an active Booth Access Grant.

## 9. Decision records

- [Do not retain guest photos](docs/adr/0001-do-not-retain-guest-photos.md)
- [Isolate Booth Mode access from the Admin](docs/adr/0002-isolate-booth-access-from-admin.md)
- [Reserve Print Allowance before printing](docs/adr/0003-reserve-print-allowance-before-printing.md)
- [Require internet during the first release](docs/adr/0004-require-internet-for-first-release.md)
- [Validate the target booth browser on hardware](docs/adr/0005-validate-the-target-booth-browser.md)
- [Carry Film Stock across Events](docs/adr/0006-carry-film-stock-across-events.md)
- [Route Booth Mode requests through the server](docs/adr/0007-route-booth-requests-through-server.md)
- [Record print and stock changes transactionally](docs/adr/0008-record-print-and-stock-changes-transactionally.md)
- [Remove Event Media during Client Redaction](docs/adr/0009-remove-event-media-during-client-redaction.md)
- [Use one design system for Admin and Booth Mode](docs/adr/0010-one-design-system-for-admin-and-booth.md)
- [Keep Booth access separate during Admin password recovery](docs/adr/0011-keep-booth-access-separate-during-password-recovery.md)
- [Qualify development on iPhone before iPad launch](docs/adr/0012-qualify-development-on-iphone-before-ipad-launch.md)
- [Use optional HTTPS for local device testing](docs/adr/0013-use-optional-https-for-local-device-testing.md)
- [Validate Draft Event saves before operational setup](docs/adr/0017-validate-draft-event-saves.md)
- [Complete Admin reset only after password change and session revocation](docs/adr/0015-complete-admin-reset-only-after-password-change-and-revocation.md)
- [Stop Booth Mode safely before a Print Reservation](docs/adr/0014-stop-booth-before-print-reservation.md)
- [Keep operational history when deleting a Draft](docs/adr/0016-keep-history-when-deleting-draft.md)
- [Centralize accounting transitions and persist Booth pause requests](docs/adr/0022-centralize-accounting-transitions-and-persist-pause-requests.md)
