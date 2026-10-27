# Issue #10 — sub-issue flowcharts

**2026-10-27 F2 scope:** [ADR-0032](../adr/0032-build-full-f2-with-uploads-unavailable.md) restores full dormant F2/#30 editor/private-delivery implementation while runtime uploads remain unavailable. Keep trusted denials, media designs, the visible Admin cleanup reminder and prior-authorized deletion pending. Full cleanup and enabled transfer/failure/concurrency/private-delivery/playback proof remain required for #30 completion. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 remains open in #10 and is completed last as its final closure blocker. these diagrams do not change native dependencies or claim acceptance.

**Approved design · 24 October 2026.** F1–F8 are the agreed capability groups, now published as GitHub #29–#36. The detailed plans were approved on 2026-10-25, committed as `0bd7503` and published under your later instruction. F1 is implemented; full dormant F2 implementation is authorized under ADR-0032 with uploads unavailable under ADR-0031; F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure. The #9 software prerequisite passed verification and independent review; #9 is closed as completed. Capability prerequisites below still apply.

For your review only, revised 2026-10-25 for complete legacy removal. Each chart shows user behavior. Agents use the written contracts and capability plans; these diagrams are not additional work orders. The diagrams claim no new implementation evidence or fresh database install.

## How the sub-issues fit together

Prerequisite paths are shown without redundant transitive arrows. F3–F8 consume the verified upload-disabled F2 milestone; F8 requires F1 and F3–F7 acceptance plus that milestone. Full #30 remains open in #10 and is completed last before parent closure. These are current execution boundaries, not a tracker read-back or passing evidence.

```mermaid
flowchart TD
  GATE["#9 verified and closed<br/>Prerequisite satisfied"] --> F1["F1 / #29 implemented<br/>Admin access and account"]
  F1 --> F2M["Verified F2 upload-disabled milestone<br/>Drafts, denials and pending-cleanup safety"]
  F2M --> F3["F3 / #31<br/>Booked capacity and package additions"]
  F3 --> F4["F4 / #32<br/>Booth setup, access and lifecycle"]
  F4 --> F5["F5 / #33<br/>Guest capture-to-print journey"]
  F5 --> F6["F6 / #34<br/>Recovery across devices"]
  F3 --> F7["F7 / #35<br/>Operational visibility and history"]
  F6 --> F8["F8 / #36<br/>Retirement, fresh schema and disabled-scope acceptance"]
  F7 --> F8
  F2M -.-> F2FULL["F2 / #30 remains open<br/>Full cleanup and enabled media qualification; finish last"]
  F8 --> F2FULL
  F2FULL --> RECHECK["Reverify affected combined candidate<br/>Current contracts and fresh baseline"]
  RECHECK --> DONE["#10 closure eligible only after all evidence<br/>No physical release implied"]
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

## F2. Event preparation and private media

**Current outcome:** prepare a valid Draft, retain media sections with uploads unavailable and safely cancel or delete it. The future enabled-media path preserves ADR-0027's Draft-only changes and upload limits.

F2 preserves media sections with unavailable feedback and trusted upload/attachment/replacement denial now. The planned enabled feature still needs real interrupted/resumable transfers, malformed-content/lifecycle races and supported cleanup proof before re-enablement. Cleanup remains pending while an upload can still create an object; the trace records actual Storage evidence.

```mermaid
flowchart TD
  EDIT["Create or edit Draft<br/>Booking, schedule and packages"] --> VALID{"Valid and current?"}
  VALID -->|No| FIX["Keep entered values<br/>Show errors or stale-save recovery"]
  VALID -->|Yes| DRAFT["Saved Draft<br/>Total = packages × 10"]
  DRAFT --> ACTION{"Next action"}
  ACTION -->|Media — current| UNAVAILABLE["Media sections retained<br/>Uploads temporarily unavailable"]
  ACTION -.->|Future enabled media only| QUALIFY["Supported cleanup qualification<br/>Explicit re-enablement required"]
  QUALIFY --> MEDIA["Planned upload, replace or remove<br/>Validate content and recheck Draft"]
  MEDIA --> CURRENT{"Change allowed at commit?"}
  CURRENT -->|No| KEEP["Keep existing media<br/>Clean unused upload"]
  CURRENT -->|Yes| SAVE["Save private media change<br/>Track cleanup errors"]
  ACTION -->|Prepare Booth| SETUP["F4: setup and start<br/>Live freezes booking and media"]
  ACTION -->|Cancel| CANCEL["Cancelled<br/>Retain for F7 History"]
  ACTION -->|Delete| SAFE{"Never started and safe?"}
  SAFE -->|No| BLOCK["Explain deletion blocker"]
  SAFE -->|Yes| CLEAN["Remove private media"]
  CLEAN --> REMOVED{"Cleanup confirmed?"}
  REMOVED -->|No| PENDING["Deletion incomplete<br/>Show pending cleanup and retry"]
  REMOVED -->|Yes| DELETED["Complete deletion<br/>Keep required opaque audit only"]
```

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
  HISTORY --> PACKAGE["Package-derived totals only"]
  PACKAGE --> DETAIL["Read-only details<br/>Retained contact, media and audit"]
  DETAIL --> RETAIN["No terminal edit/redact/delete<br/>No legacy reader or conversion"]
```

Four in-month Events with one Cancelled show **3**; Completed still counts and deleted Drafts do not. The owning functionality records each audit event; F7 reads and presents it. History never contains saved Guest photos.

## F8. Complete removal, fresh installation and final acceptance

**Outcome:** all legacy code/schema is gone and the current application passes on a fresh package-only database.

```mermaid
flowchart TD
  START["#9 retained; F1–F7 accepted"] --> REMOVE["Delete remaining old routes, readers,<br/>helpers, schemas and obsolete tests"]
  REMOVE --> BASELINE["Build complete current database baseline<br/>Remove previous migration chain"]
  BASELINE --> EMPTY["Install in an empty isolated local database"]
  EMPTY --> CHECK{"No legacy objects; current security<br/>and contracts pass?"}
  CHECK -->|No| FIX["Fix baseline or callers<br/>Repeat empty installation"]
  FIX --> EMPTY
  CHECK -->|Yes| FULL["Rebuild the named disposable test stack<br/>Run the full current application suite"]
  FULL --> PASS{"All required checks pass?"}
  PASS -->|No| CORRECT["Fix the failing approved behavior<br/>Rerun affected and final checks"]
  CORRECT --> FULL
  PASS -->|Yes| DONE["Record #10 nonproduction acceptance<br/>#17 / #7 remain separate"]
```

There is no old-data import, old-run settlement, legacy snapshot, Draft conversion/review or legacy History reader. Existing development/test data is disposable. The reset is a development setup operation with test apps stopped and physical printers disconnected, never a way to dismiss a real uncertain print. Current package History and runtime print holds remain safe.

## What closes each issue

```mermaid
flowchart LR
  SCOPE["Agreed functionality"] --> WORK["UI + existing #9 contracts<br/>Related code, fixtures and cleanup"]
  WORK --> TEST["Own integration and failure cases pass<br/>Privacy, authorization and accessibility verified"]
  TEST --> REVIEW["Review and evidence complete"]
  REVIEW --> DONE["Capability issue can close<br/>F8 still verifies the combined application"]
```

These are scope and behavior diagrams, not new state-machine contracts or fresh implementation evidence. The written spec and plans remain the implementation authorities.
