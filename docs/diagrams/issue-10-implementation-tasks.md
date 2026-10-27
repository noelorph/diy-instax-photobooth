# Issue #10 — implementation task flowchart

**2026-10-27 media scope:** [ADR-0031](../adr/0031-temporarily-disable-event-media-uploads.md) preserves the planned feature and designs while uploads are temporarily unavailable. F2 may deliver disabled media sections and trusted upload/attachment/replacement denial now; enabled transfer/delivery/complete cleanup qualification is deferred and optional before release while disabled. Prior-authorized deletion stays pending. These diagrams do not decide #30 closure or authorize other capabilities.

**Original 23-task breakdown across eight capability plans.** This is a visual index of the plans revised on 25 October 2026, not a new plan or a completion record. The plan is approved and F1–F8 are published as #29–#36. F1 is implemented; F2 is authorized to continue with uploads unavailable under ADR-0031; F3–F8 remain on hold. #9's software prerequisite is already satisfied.

For your review only. This shows the work order and what disappears; agents use the detailed plans, not this chart. This chart records no new implementation evidence or database reset. The approved documentation was committed as `0bd7503`. You then authorized publication and its verification; that is complete. That publication-stage implementation hold was later lifted for F1 and the current F2 scope only.

## The change you approved

```mermaid
flowchart TD
  KEEP["Keep approved #9 package contracts<br/>and safety rules"] --> BUILD["F1–F7: complete current flows<br/>and delete their obsolete code together"]
  BUILD --> DELETE["Delete the old code as its callers change<br/>Remove features with no replacement"]
  DELETE --> FRESH["F8: remove remaining legacy code and schema<br/>Replace old migrations with a clean baseline"]
  FRESH --> TEST["Install an empty local database<br/>Verify security and the complete application"]
  TEST --> READY["#10 software acceptance<br/>Physical #17 / #7 still required"]
```

There is no legacy-data migration, old-Draft conversion or legacy History screen. Existing data is disposable test data. Current package History, safe Draft deletion, privacy and printer safety stay.

## Publication history and current authorization

P1–P3 publication tasks are complete. The original implementation tasks below are a scope index, not all pending: F1 is implemented and the current F2 scope is authorized. Approval/publication alone did not authorize application implementation; the later F1/F2 instructions did.

```mermaid
flowchart TD
  NINE["#9 software verification passed<br/>Closed; verify accepted candidate 2f89a96"]
  APPROVAL["#10 plans approved<br/>Docs committed as 0bd7503"]
  P1["P1 complete: approval recorded<br/>#10 and eight child bodies prepared"]
  P2["P2 complete: #10 updated<br/>#29–#36 created with native dependencies"]
  P3["P3 complete: bodies and links verified<br/>Local issue map recorded"]
  AUTH["Current: F1 implemented; F2 authorized<br/>Uploads unavailable; F3–F8 held"]
  PUBLISH["Historical: publication authorized<br/>Implementation held at that stage"]
  NINE --> APPROVAL --> PUBLISH --> P1 --> P2 --> P3 --> AUTH
```

## All implementation tasks

Each task includes its planned implementation, focused verification and commit. Cross-capability arrows require the preceding capability's acceptance and recorded evidence. Redundant transitive arrows are omitted: F7 can follow F3 alongside the F4–F6 sequence, and F8 waits for **all F1–F7**. The arrows express dependencies, not a request to delegate work.

```mermaid
flowchart TD
  START["F1 implemented; current F2 scope authorized<br/>F3–F8 still require implementation instruction"]

  subgraph F1["F1 / #29 — Admin access and account management"]
    F1T1["F1.T1: Sign-in and truthful<br/>password recovery"]
    F1T2["F1.T2: Profile edits and<br/>current-device sign-out"]
    F1T3["F1.T3: Shared navigation and<br/>accessible account presentation"]
    F1T1 --> F1T2 --> F1T3
  end

  subgraph F2["F2 / #30 — Event preparation and private media"]
    F2T1["F2.T1: Package-based Draft<br/>preparation and discovery"]
    F2T2["F2.T2: Validated, immutable<br/>private media writes"]
    F2T3["F2.T3: Safe Draft cancellation,<br/>deletion and cleanup"]
    F2T4["F2.T4A: Preserved media sections<br/>uploads unavailable; trusted denial"]
    F2T1 --> F2T3 --> F2T4
    F2T2 -.->|Deferred enabled media; cleanup proof required| F2T4
  end

  subgraph F3["F3 / #31 — Booked capacity and Additional Film Packages"]
    F3T1["F3.T1: Replace allowance and stock reads<br/>with package counts"]
    F3T2["F3.T2: Whole-package purchase<br/>and receipt recovery"]
    F3T1 --> F3T2
  end

  subgraph F4["F4 / #32 — Booth setup, access and lifecycle"]
    F4T1["F4.T1: Equipment setup and<br/>initial scoped handoff"]
    F4T2["F4.T2: Run state and<br/>phone Pause, Resume and Finish"]
    F4T3["F4.T3: Replacement access,<br/>new runs and Event termination"]
    F4T1 --> F4T2 --> F4T3
  end

  subgraph F5["F5 / #33 — Guest capture-to-print journey"]
    F5T1["F5.T1: Welcome, camera and<br/>acknowledged Capture selection"]
    F5T2["F5.T2: One-send dispatch<br/>and truthful completion"]
    F5T3["F5.T3: Inactivity, immediate fault stops<br/>and capacity recovery admission"]
    F5T1 --> F5T2 --> F5T3
  end

  subgraph F6["F6 / #34 — Booth recovery across devices"]
    F6T1["F6.T1: Receipt and server reconciliation<br/>after fault or reload"]
    F6T2["F6.T2: Independent equipment repair,<br/>reload and inspection"]
    F6T3["F6.T3: Exceptional access recovery<br/>and combined-device acceptance"]
    F6T1 --> F6T2 --> F6T3
  end

  subgraph F7["F7 / #35 — Operational visibility and retained history"]
    F7T1["F7.T1: Dashboard summaries<br/>and activity"]
    F7T2["F7.T2: Package-only History and read-only detail<br/>Remove old readers"]
    F7T1 --> F7T2
  end

  ACCEPTED["All F1–F7 accepted<br/>Owner evidence recorded"]

  subgraph F8["F8 / #36 — Complete removal and fresh installation"]
    F8T1["F8.T1: Trace and delete<br/>all remaining legacy application paths"]
    F8T2["F8.T2: Replace the old migration chain<br/>Prove a fresh package-only installation"]
    F8T3["F8.T3: Verify the complete candidate<br/>and record #10 acceptance"]
    F8T1 --> F8T2 --> F8T3
  end

  DONE["#10 nonproduction software acceptance recorded<br/>Issue closure requires a later instruction"]

  START --> F1T1
  F1T3 --> F2T1
  F2T4 --> F3T1
  F3T2 --> F4T1
  F4T3 --> F5T1
  F5T3 --> F6T1
  F3T2 --> F7T1
  F6T3 --> ACCEPTED
  F7T2 --> ACCEPTED
  ACCEPTED --> F8T1
  F8T3 --> DONE
```

## What disappears and what stays

| Area                                      | End of #10                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Editable Print Allowance                  | Removed; original packages determine capacity                                       |
| Individual Additional Prints              | Removed; whole Additional Film Packages remain                                      |
| Shared Film Stock and Wasted Film refunds | Removed; physical readiness and confirmed-ejection counting remain                  |
| In-app Test Print and its setup gate      | Removed; independent physical testing reminder remains                              |
| Client Redaction and past-Event deletion  | Removed; safe never-started Draft deletion remains                                  |
| Old recovery/local takeover               | Removed; current Booth recovery and exceptional protected access replacement remain |
| Old History and Draft conversion          | Removed; new package-model terminal History remains                                 |
| Old migrations and database objects       | Replaced by a complete verified package-only baseline                               |
| #9 contracts and evidence                 | Current behavior retained and reverified; dated acceptance preserved                |

F2 can render preserved unavailable media sections now; full enabled transfer/validation/deletion/delivery proof remains deferred before re-enablement. F4 proves fresh equipment readiness after handoff. F5/F6 prove new Guest admission after a package purchase without clearing other blockers or a pause. F7 keeps the approved monthly count: Draft + Live + Completed, excluding Cancelled.

These charts are a review aid, not a test result or an instruction to deploy. Real-printer qualification remains #17; actual-iPad release remains #7. Both remain outside #10 software acceptance.
