# Issue #10 — sub-issue flowcharts

**Approved design · 24 October 2026.** F1–F8 are the agreed capability groups, not GitHub issue numbers. Detailed implementation-plan approval and GitHub publication are pending. The #9 software prerequisite passed verification and independent review; #9 is closed as completed. Implementation still awaits its own plan approval/publication and the capability prerequisites below.

The [detailed implementation plans](../superpowers/plans/2026-10-24-issue-10-implementation-plan.md) were revised for review on 2026-10-25 and await approval. These charts summarize the [functional breakdown design](../superpowers/specs/2026-10-24-issue-10-functional-breakdown-design.md), including the user's monthly-count clarification. The [replacement contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) controls detailed guards and races. Each issue includes its UI, integration, necessary data changes, legacy cleanup and tests, tracked from the start in the [acceptance trace](../implementation/issue-10-retirement-and-acceptance.md). Dashed arrows within a capability chart mark supporting behavior or a handoff to another capability.

[F1 Access](#f1-admin-access-and-account-management) · [F2 Events and media](#f2-event-preparation-and-private-media) · [F3 Capacity](#f3-booked-print-capacity-and-additional-film-packages) · [F4 Lifecycle](#f4-booth-setup-access-and-lifecycle) · [F5 Guest printing](#f5-guest-capture-to-print-journey) · [F6 Recovery](#f6-booth-recovery-across-devices) · [F7 Visibility and history](#f7-operational-visibility-and-retained-history) · [F8 Cutover](#f8-coordinated-cutover-retirement-and-final-acceptance)

## How the sub-issues fit together

Prerequisite paths are shown without redundant transitive arrows. F8 waits for **all F1–F7**. This is the approved dependency order, not permission to begin.

```mermaid
flowchart TD
  GATE["#9 verified and closed<br/>Prerequisite satisfied"] --> F1["F1<br/>Admin access and account"]
  F1 --> F2["F2<br/>Event preparation and private media"]
  F2 --> F3["F3<br/>Booked capacity and package additions"]
  F3 --> F4["F4<br/>Booth setup, access and lifecycle"]
  F4 --> F5["F5<br/>Guest capture-to-print journey"]
  F5 --> F6["F6<br/>Recovery across devices"]
  F3 --> F7["F7<br/>Operational visibility and history"]
  F6 --> F8["F8<br/>Coordinated cutover and final acceptance"]
  F7 --> F8
  F8 --> DONE["#10 complete<br/>Nonproduction acceptance only"]
```

Real-printer qualification (#17) and the actual-iPad release gate (#7) remain separate and open. These diagrams do not move either gate into #10.

## F1. Admin access and account management

**Outcome:** the Admin can securely enter the app, recover access and manage their account.

```mermaid
flowchart TD
  ENTRY["Admin needs access"] --> CHOICE{"Choose action"}
  CHOICE -->|Sign in| LOGIN["Email + password"]
  LOGIN --> AUTH{"Authorized session?"}
  AUTH -->|No| ERROR["Visible error; preserve email<br/>Retry sign-in"]
  AUTH -->|Yes| HOME["Dashboard or validated<br/>setup return"]
  CHOICE -->|Recover password| EMAIL["Neutral email confirmation<br/>Open a valid recovery link"]
  EMAIL --> RESET["Save different password<br/>Revoke all Admin sessions"]
  RESET --> OK{"Both confirmed?"}
  OK -->|Yes| LOGIN
  OK -->|No| RETRY["Show incomplete recovery<br/>Active session: retry different password<br/>Otherwise: request new link"]
  HOME --> ACCOUNT{"Account action"}
  ACCOUNT -->|Preferences| PREFS["Validate and save<br/>phone or theme"]
  ACCOUNT -->|Password| PASSWORD["Authenticated password change<br/>Show validation and result"]
  ACCOUNT -->|Sign out| SIGNOUT{"Local sign-out confirmed?"}
  SIGNOUT -->|Yes| LOGIN
  SIGNOUT -->|No| STAY["Show persistent error<br/>Do not claim success"]
```

Profile sign-out affects only that device. Password reset revokes Admin sessions globally. Neither action ends an independently valid Booth grant.

**UI references:** [Authentication](../design/2026-10-21-package-recovery/admin/08-authentication.png), [Profile](../design/2026-10-21-package-recovery/admin/10-profile.png), [feedback](../design/2026-10-21-package-recovery/admin/11-dialogs-feedback.png).

## F2. Event preparation and private media

**Outcome:** prepare a valid Draft, manage its private media and safely cancel or delete it. Draft-only changes and upload limits are approved in [ADR-0027](../adr/0027-draft-only-event-media.md).

F2 proves real interrupted/resumable transfers, malformed content, Start/Cancel races and late-upload deletion before polishing the editor. Cleanup remains pending while an upload can still create an object; the trace records actual Storage evidence.

```mermaid
flowchart TD
  EDIT["Create or edit Draft<br/>Booking, schedule and packages"] --> VALID{"Valid and current?"}
  VALID -->|No| FIX["Keep entered values<br/>Show errors or stale-save recovery"]
  VALID -->|Yes| DRAFT["Saved Draft<br/>Total = packages × 10"]
  DRAFT --> ACTION{"Next action"}
  ACTION -->|Media| MEDIA["Upload, replace or remove<br/>Validate content and recheck Draft"]
  MEDIA --> CURRENT{"Change allowed at commit?"}
  CURRENT -->|No| KEEP["Keep existing media<br/>Clean unused upload"]
  CURRENT -->|Yes| SAVE["Save private media change<br/>Track cleanup errors"]
  ACTION -->|Prepare Booth| REVIEW["Review converted booking<br/>if required"]
  REVIEW -.-> SETUP["F4: setup and start<br/>Live freezes booking and media"]
  ACTION -->|Cancel| CANCEL["Cancelled<br/>Retain for F7 History"]
  ACTION -->|Delete| SAFE{"Never started and safe?"}
  SAFE -->|No| BLOCK["Explain deletion blocker"]
  SAFE -->|Yes| CLEAN["Remove private media"]
  CLEAN --> REMOVED{"Cleanup confirmed?"}
  REMOVED -->|No| PENDING["Deletion incomplete<br/>Show pending cleanup and retry"]
  REMOVED -->|Yes| DELETED["Complete deletion<br/>Keep required opaque audit only"]
```

**UI references:** [Events](../design/2026-10-21-package-recovery/admin/02-events.png), [editor](../design/2026-10-21-package-recovery/admin/03-event-editor.png), [Draft/setup](../design/2026-10-21-package-recovery/admin/04-draft-setup.png), [dialogs](../design/2026-10-21-package-recovery/admin/11-dialogs-feedback.png).

## F3. Booked print capacity and Additional Film Packages

**Outcome:** the Admin sees accurate counts and can add whole packages exactly once. Physical film loading is a different action in F6.

```mermaid
flowchart TD
  EVENT["Live Event<br/>Any eligible run state"] --> COUNTS["Read #9 counts<br/>Include unresolved holds"]
  COUNTS --> ADD["Admin enters whole packages<br/>and Client-request note"]
  ADD --> VALID{"Authorized and valid?"}
  VALID -->|No| ERROR["Show rejection<br/>No capacity change"]
  VALID -->|Yes| SEND["Submit stable operation ID<br/>with fixed payload"]
  SEND --> RESPONSE{"Operation result"}
  RESPONSE -->|Unknown| RECEIPT["Recover original receipt<br/>Retry same ID and payload"]
  RECEIPT --> RESPONSE
  RESPONSE -->|Rejected| ERROR
  RESPONSE -->|Committed| COMMIT["Record addition once<br/>+10 booked prints per package"]
  COMMIT --> SHOW["Refresh confirmed, pending,<br/>remaining and available counts"]
  SHOW -.-> CONSUMERS["F4: lifecycle guards<br/>F5: Guest capacity and admission"]
  COMMIT -.-> LIMIT["No film loading or print resolution<br/>No start or automatic Resume"]
```

Available prints = `10 × (original + additional packages) − Printed − unresolved attempts`. Each unresolved attempt holds one print. F5-04 verifies exhaustion → phone package addition → a **new persisted Guest Session**, not just changed counts or welcome; F6-03 verifies that other blockers and explicit pause still prevent admission. F3 owns purchase evidence in the shared trace.

**UI references:** [Live Event](../design/2026-10-21-package-recovery/admin/05-live-event.png), [phone management](../design/2026-10-21-package-recovery/admin/06-phone-management.png), [capacity state](../design/2026-10-21-package-recovery/booth/04-printer-and-capacity.png).

## F4. Booth setup, access and lifecycle

**Outcome:** safely start, pause, resume and finish a Booth run, then complete/cancel the Event separately.

```mermaid
flowchart TD
  SETUP["Prepare booth device<br/>Equipment checks + test reminder"] --> READY{"Ready and eligible?"}
  READY -->|No| HELP["Show setup blockers"]
  READY -->|Yes| PREPARED["Prepared<br/>Inactive device grant"]
  PREPARED --> HANDOFF{"Local sign-out +<br/>handoff confirmed?"}
  HANDOFF -->|Yes| SCOPED["Scoped access active<br/>Arrive at /booth"]
  SCOPED --> FRESH{"Fresh live camera + printer<br/>ready under device grant?"}
  FRESH -->|No| RECHECK["Keep Guest admission blocked<br/>Restore released resources safely"]
  RECHECK --> FRESH
  FRESH -->|Yes and all other admission guards pass| ACTIVE["Active and ready<br/>F5 admits Guests"]
  HANDOFF -->|No| FAILED["Paused; revoke unusable grant"]
  FAILED -.-> RECOVER["F6: reconcile and authenticate<br/>F4: guarded replacement handoff"]
  RECOVER -->|Access restored only| PAUSED["Paused<br/>Valid grant retained"]
  ACTIVE -->|Phone Pause| PAUSED
  PAUSED -->|Phone Resume| RESUME{"Ready, valid access,<br/>capacity and no pending work?"}
  RESUME -->|Yes| ACTIVE
  RESUME -->|No| PAUSED
  PREPARED -->|Phone Finish| FINISHING["Finishing<br/>Block new work"]
  ACTIVE -->|Phone Finish| FINISHING
  PAUSED -->|Phone Finish| FINISHING
  FINISHING --> PENDING{"Attempt unresolved?"}
  PENDING -->|Yes| SETTLE["Wait or reconcile safely<br/>F6 if recovery is needed"]
  SETTLE --> PENDING
  PENDING -->|No| FINISHED["Finished; grant revoked<br/>Sign in; Event still Live"]
  FINISHED -->|New run| SETUP
  FINISHED -->|Separate Complete or Cancel| TERMINAL["Check Event terminal guards<br/>Retain in F7 History"]
```

The phone's Admin session survives the initial handoff. F4-01 proves local Admin access ends, scoped access activates and fresh readiness is established after navigation, including setup-resource cleanup and denied reacquisition. The freshness check gates admission; it adds no run state, and rechecks intervening Pause/Finish. Pause/Finish before dispatch denies the send; dispatch authorized first may still print and must settle. Equipment recovery never overrides Pause or Finish. Replacement is refused while an old print may still deliver and for Finishing/Finished runs; successful replacement activates access only and stays Paused.

**UI references:** [Setup](../design/2026-10-21-package-recovery/admin/04-draft-setup.png), [phone lifecycle](../design/2026-10-21-package-recovery/admin/06-phone-management.png), [Booth lifecycle/access](../design/2026-10-21-package-recovery/booth/05-pause-finish-access.png).

## F5. Guest capture-to-print journey

**Outcome:** one reviewed photo produces at most one authorized send, with truthful completion and no stored Guest image.

```mermaid
flowchart TD
  CHECK{"Guest admission ready?"} -->|No| BLOCK["Show blocker or stop state<br/>F3 / F4 / F6"]
  CHECK -->|Yes| WELCOME["Welcome<br/>Montage, image or default"]
  WELCOME -->|Start| PREVIEW["Mirrored preview<br/>Take Photo"]
  PREVIEW --> CAPTURE["3–2–1, then shutter<br/>Journal + acknowledge Capture"]
  CAPTURE --> REVIEW["Unmirrored final crop<br/>Retake or Print"]
  REVIEW -->|Retake| PREVIEW
  REVIEW -->|Print| RESERVE["Journal + reserve selected Capture<br/>No newer acknowledged shutter"]
  RESERVE --> SEND["Recheck readiness and stop state<br/>First authorization: send once"]
  SEND --> WAIT["Truthful printing status<br/>Acceptance is not completion"]
  WAIT --> RECORDED{"Full ejection and<br/>server acknowledgement?"}
  RECORDED -->|Still awaiting confirmation| WAIT
  RECORDED -->|Yes| COMPLETE["Discard photo<br/>Print complete for 3 seconds"]
  COMPLETE --> CHECK
  SEND -.->|Denied or uncertain| FAULT["End interaction; preserve pending work<br/>F6 reconciles; never resend"]
  WAIT -.->|Fault or unresolved outcome| FAULT
  RESERVE -.->|Rejected or response lost| FAULT
  REVIEW -.-> TIMER["Preview/review only<br/>75s: warn; Continue resets<br/>90s: discard and end session"]
```

Equal shutter timestamps allow the explicitly selected Capture; dispatch rechecks its eligibility. The last reserved print can dispatch at zero available because it owns its hold. Countdown/printing have no Guest inactivity timer. All phases stop safely on faults; photo disposal waits only for an authorized transport still using its bytes. After exhaustion, F3 adds packages and F5 rechecks all admission conditions.

**UI references:** [Welcome/capture](../design/2026-10-21-package-recovery/booth/01-welcome-capture.png), [review/printing/completion](../design/2026-10-21-package-recovery/booth/02-review-printing-complete.png), [capacity](../design/2026-10-21-package-recovery/booth/04-printer-and-capacity.png).

## F6. Booth recovery across devices

**Outcome:** restore safe operation without resending an old photo, guessing an outcome or clearing an Admin stop.

```mermaid
flowchart TD
  FAULT["Fault, reload or access loss<br/>Stop new work; discard old photo safely"] --> ATTEMPT["Close old session<br/>Reconcile receipts + server attempt"]
  FAULT --> REPAIR["Independently repair affected blockers<br/>Connect to Instax / Enable Camera<br/>Restore server / confirm physical reload"]
  ATTEMPT --> OUTCOME{"Old attempt state"}
  OUTCOME -->|None or terminal| STATE["Re-read attempt, blockers,<br/>run state and access"]
  OUTCOME -->|Proven unsent| UNSENT["Settle Reserved as NotPrinted<br/>Release hold"]
  OUTCOME -->|Reliable physical outcome| RECORD["Record outcome once<br/>Wait for server acknowledgement"]
  OUTCOME -->|Unknown| PENDING["Keep Pending and hold<br/>Phone inspection + reason"]
  PENDING --> SAFE{"Outcome safely established?"}
  SAFE -->|Yes| RECORD
  SAFE -->|No| HOLD["Keep Pending<br/>No timeout or reload clears it"]
  UNSENT --> STATE
  RECORD --> STATE
  HOLD --> STATE
  REPAIR --> STATE
  STATE --> STATUS{"Current lifecycle / access"}
  STATUS -->|Paused, Finishing or Finished| LIFECYCLE["Preserve F4 lifecycle state<br/>No automatic Resume or new run"]
  STATUS -->|Access lost; not Finishing or Finished| ACCESS["F4: protected replacement<br/>Reconcile first; remain Paused"]
  STATUS -->|Active with valid access| READY{"All ready, capacity available,<br/>no unresolved attempt?"}
  READY -->|Yes| WELCOME["F5: fresh welcome<br/>Never reuse old photo"]
  READY -->|No| UNAVAILABLE["Stay unavailable<br/>Keep every remaining blocker"]
```

Repair and outcome resolution proceed independently; **both must be safe before new Guest work**. A missing receipt alone never proves an attempt is absent. Inspected **Printed** requires full ejection, even if unusable; **Not printed** requires no ejection **and no possible later output from the old job**. Reloading changes neither booked capacity nor the old outcome. A camera fault during printing blocks the next Guest while the attempt settles.

**UI references:** [Phone recovery](../design/2026-10-21-package-recovery/admin/07-phone-recovery.png), [connection recovery](../design/2026-10-21-package-recovery/booth/03-connection-recovery.png), [printer/capacity](../design/2026-10-21-package-recovery/booth/04-printer-and-capacity.png), [access/lifecycle](../design/2026-10-21-package-recovery/booth/05-pause-finish-access.png), [paired iPad/phone journey](../design/2026-10-21-package-recovery/journeys/01-ipad-phone-recovery.png).

## F7. Operational visibility and retained history

**Outcome:** the Admin can understand upcoming work, recent activity and retained Event records with accurate accounting.

```mermaid
flowchart TD
  ADMIN["Current authorized Admin"] --> READ["Read scoped Events and activity<br/>Authorize private media access"]
  READ --> RESULT{"Read result"}
  RESULT -->|Failed| ERROR["Persistent error + retry<br/>Never invent zero totals"]
  RESULT -->|Empty| EMPTY["Relevant empty state<br/>and next action"]
  RESULT -->|Available| VIEW{"Information needed"}
  VIEW -->|Overview| DASH["Monthly: Draft + Live + Completed<br/>Venue-local scheduled start<br/>Monthly/booked exclude Cancelled<br/>Upcoming/next: future Draft or Live"]
  VIEW -->|Activity| ACTIVITY["Newest first; 7/30-day filters<br/>25 rows per page"]
  VIEW -->|History| HISTORY["Completed/Cancelled Events"]
  HISTORY --> VERSION{"Accounting version"}
  VERSION -->|Version 2| PACKAGE["Package-derived totals"]
  VERSION -->|Legacy| LEGACY["Labeled original totals<br/>Preserve historical corrections"]
  PACKAGE --> DETAIL["Read-only details<br/>Retained contact, media and audit"]
  LEGACY --> DETAIL
  DETAIL --> RETAIN["No terminal edit/redact/delete<br/>No reconstructed deleted data"]
```

Four in-month Events with one Cancelled show **3**; Completed still counts and deleted Drafts do not. See [ADR-0028](../adr/0028-define-monthly-event-count.md) and trace F7-01. The owning functionality records each audit event; F7 reads and presents it. History never contains saved Guest photos.

**UI references:** [Dashboard](../design/2026-10-21-package-recovery/admin/01-dashboard.png), [History](../design/2026-10-21-package-recovery/admin/09-history.png), [Event detail/activity](../design/2026-10-21-package-recovery/admin/05-live-event.png).

## F8. Coordinated cutover, retirement and final acceptance

**Outcome:** the complete version-2 application and migration pass nonproduction acceptance, with history preserved and obsolete writes denied.

```mermaid
flowchart TD
  START["#9 verified; F1–F7 evidence recorded"] --> EVIDENCE["Audit existing acceptance trace<br/>Every requirement has passing evidence"]
  EVIDENCE --> TRACE["Trace all 8 retirements<br/>Controls through database and tests"]
  TRACE --> STOP["Dedicated config + disposable app/DB<br/>Nonproduction rehearsal; stop new starts"]
  STOP --> LEGACY{"Legacy work settled?"}
  LEGACY -->|No| SETTLE["Resolve under the old contract<br/>Finish runs; settle Live Events<br/>Complete pending media cleanup"]
  SETTLE --> LEGACY
  LEGACY -->|Yes| BACKUP["Verify backup, history<br/>and cutover preflight"]
  BACKUP --> ACTIVATE["Coordinate app + DB activation<br/>Existing safeguards; forward migrations"]
  ACTIVATE --> PRESERVE["Verify history and Draft conversion<br/>Require mismatched-booking review"]
  PRESERVE --> DENY["Remove obsolete runtime paths<br/>Prove old mutation calls are denied"]
  DENY --> VERIFY["Run all required checks<br/>and recovery rehearsal"]
  VERIFY --> PASS{"Final reviewed candidate passes?"}
  PASS -->|Yes| DONE["#10 nonproduction acceptance complete<br/>#17 / #7 still gate real release"]
  PASS -->|No| WRITES{"Any new version-2 writes?"}
  WRITES -->|No| RESTORE["Keep unavailable<br/>Verified backup restore if needed<br/>Correct candidate and rehearse again"]
  RESTORE --> BACKUP
  WRITES -->|Yes| FORWARD["Keep unavailable; preserve data<br/>Reviewed forward fix"]
  FORWARD --> PRESERVE
```

The eight retirements are editable Print Allowance, individual Additional Prints, shared Film Stock, Wasted Film/quality refunds, in-app Test Print, Client Redaction/past-Event deletion, superseded recovery/local takeover, and temporary compatibility code. Each capability supplies its own cleanup; F8 proves the coordinated result. Applied migrations, required historical readers and audit evidence remain.

**UI reference:** [complete approved gallery](../design/2026-10-21-package-recovery/index.html), especially the [paired recovery journey](../design/2026-10-21-package-recovery/journeys/01-ipad-phone-recovery.png). F8 introduces no new product screen.

## What closes each issue

```mermaid
flowchart LR
  SCOPE["Agreed functionality"] --> WORK["UI + existing #9 contracts<br/>Related code, fixtures and cleanup"]
  WORK --> TEST["Own integration and failure cases pass<br/>Privacy, authorization and accessibility verified"]
  TEST --> REVIEW["Review and evidence complete"]
  REVIEW --> DONE["Capability issue can close<br/>F8 still verifies the combined application"]
```

These are scope and behavior diagrams, not new state-machine contracts or a claim that any functionality is implemented. The [screen map](../design/2026-10-21-package-recovery/screen-map.md) and [design system](../../DESIGN_SYSTEM.md) remain the presentation authorities.
