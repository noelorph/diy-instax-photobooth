# GitHub issue publication record and remaining drafts

## Printer qualification evidence publication — 2026-11-07

The owner authorized updating the outdated qualification documentation and aligning issue #17 with the current contract and reviewed evidence. Updated [#17](https://github.com/noelorph/diy-instax-photobooth/issues/17) to record three passed November 6 trial checks separately from the incomplete P1–P4/P6–P11 qualification: automatic candidates accompanied reviewed used-sheet output, the physical last used sheet produced a candidate, and the known-empty attempt produced no false candidate.

The published body preserves October observations, requires automatic normal full-ejection completion, makes P3's qualified generic-fault/inspection alternative explicit, keeps automatic reload optional and actual-iPad release in #7, and removes obsolete routine-manual-production, Test Print/stock and #8-prerequisite wording. Existing requirements are clarified; no product policy or physical acceptance gate is waived.

Complete-body read-back matched the prepared text exactly. GitHub updated at `2026-11-06T16:12:53Z` (November 7 in Asia/Manila); body SHA-256: `451a1de69b195e2a0aec1b0e70fae92b93ce2a385779996630e6f5f58693a14e`. #17 remains **OPEN**, with unchanged title, labels and assignees. No other issue body or metadata was changed.

The November trial report is committed locally as `0c688e6` and has not been pushed. The issue therefore names the local evidence revision and document paths without a broken remote file link. Videos remain local. This publication added no hardware/software test results and did not close an issue, enable production or push repository changes.

Earlier publication checkpoints below retain their dated state. The [#17 section](#issue-17--physical-printer-evidence) now preserves the updated published body; #7 remains a draft.

## November screen-reference publication — 2026-11-06

The owner confirmed full adoption of the November visual reference, including fonts/colors, and removal of the former presentation files while preserving Git history and dated evidence. The [main implementation plan](superpowers/plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract) now owns the per-screen catalog and presentation/accessibility contract under [ADR-0034](adr/0034-use-november-screen-reference-in-implementation-plan.md). The supplied PDF has 22 Admin pages, extracted individually with hashes and dimensions in the [manifest](references/2026-11-06-instax-booth/manifest.json). The 30 Booth frames, 19 dialogs and three boards are supplementary Figma inventory links, not PDF extractions or freshly reverified remote designs.

Updated the bodies of [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [F6 #34](https://github.com/noelorph/diy-instax-photobooth/issues/34), [F7 #35](https://github.com/noelorph/diy-instax-photobooth/issues/35) and [F8 #36](https://github.com/noelorph/diy-instax-photobooth/issues/36) with the canonical plan path, capability screen IDs, direct Figma links and explicit uncommitted/unpushed local-reference status. Refreshed two presentation-reference sentences in parent [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10) so it no longer points to the retired guide. The historical parent snapshot below also uses that current reference; its remaining wording describes the original publication.

F7's already-approved Live Event card, History filters and third verification task are synchronized into the local F7 plan, PRD, functional spec and F7-01–F7-06 rows. The shared acceptance trace remains the single evidence record; all six rows are pending. F2's full-media qualification, its last-in-#10 sequencing, F6 recovery requirements, F8 fresh-schema scope and #17/#7 physical gates remain unchanged. Original issue task checkbox states were preserved. The retained F2 historical plan has refreshed presentation references, with its functional acceptance requirements preserved.

Exact complete-body read-back passed after publication. All five issues remain open with unchanged titles, labels and assignees; #10 retains children #29–#36 and their existing states. Native blockers are unchanged:

| Issue | GitHub updated at (UTC) | Blockers                         | Published body SHA-256                                             |
| ----- | ----------------------- | -------------------------------- | ------------------------------------------------------------------ |
| #10   | 2026-11-06 01:51:19     | #9                               | `57191fb7ad92e57f377ed833384bd7688e95968aeae5757d88ca54c81b4861af` |
| #30   | 2026-11-06 01:50:44     | #9, #29                          | `684309ec3b170f7c719c9301d2c8fca80533a7d6738b944d680afefea00657bc` |
| #34   | 2026-11-06 01:50:53     | #9, #31, #32, #33                | `cbbad33681d15860757d37f4d205f3783e30bc81a6401eadf630f5c50751c60f` |
| #35   | 2026-11-06 01:50:59     | #9, #31                          | `b60171a954e2784f8e5e0d3e9e4f9cd827ccdb760af132a29b3be18e8b569025` |
| #36   | 2026-11-06 01:51:07     | #9, #29, #31, #32, #33, #34, #35 | `70d0ab049aa5df08c0509222683b8224be4636df3ea85524241e54b5d0e6c68b` |

#7/#17 bodies and metadata are unchanged; their drafts remain unpublished. No #9 or closed-child issue edit occurred. This work changed documentation, reference assets and one CSS provenance comment only; application behavior, databases and tests were not changed. No application/browser or physical verification, issue closure, deployment, Git staging, commit or push occurred. The owner explicitly requested leaving the edits uncommitted.

Local reference verification passed: the copied PDF is byte-identical to the supplied source; all 22 PNG page numbers, dimensions and hashes match the manifest; all 74 source-frame links appear in the catalog; 614 local links across 86 maintained documents resolve. No retired presentation-path references remain in those documents. F7 has six pending acceptance rows, and all four capability issue checklists retain their previous checkbox states. Prettier checked all 33 changed/new Markdown, JSON and CSS files; `git diff --check` passed. The CSS diff changes only its provenance comment. HEAD remains `969e27e`; the index is empty. Installed dependency documentation was excluded from the maintained-document link scan.

**Subsequent commit authorization — 2026-11-06:** The owner requested committing the current changes and including the design artifacts if necessary. The 12-file November 5 drawing-source bundle is included to preserve editable Figma sources, font/palette provenance and the Booth/dialog inventory absent from the PDF. Its README now distinguishes current adoption from the dated creation evidence; the drawing scripts retain their original contents and the two JSON files retain their original data with formatting normalization only. The source self-check passes for all 74 frames without executing Figma mutations. A narrow existing CommonJS ESLint exception also covers that self-check; `npm run lint` passes with 13 cross-file unused-helper warnings in the archived drawing sources and no errors. Earlier uncommitted/index-empty statements above describe the publication checkpoint before this later authorization. No push, application implementation or hardware qualification is authorized or performed by this commit request.

## F2 final-in-#10 sequencing publication — 2026-10-27

The user chose to keep [#30](https://github.com/noelorph/diy-instax-photobooth/issues/30) under [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10) and finish it last. Updated the live #10 and #30–#36 bodies with the current execution order: F3–F8 may proceed using the verified upload-disabled F2 milestone; #30 stays open and is the final blocker to #10 closure. F8 can finish fresh-schema, retirement and integrated acceptance for that disabled state, but full media cleanup, transfer and private-delivery qualification remain in #30. The historical bodies below record their original publication, not current sequencing.

Removed only the native #30 `blocked_by` edges on #31, #32, #33, #35 and #36. Read-back showed #31 `[9]`, #32 `[9,29,31]`, #33 `[9,32]`, #34 `[9,31,32,33]`, #35 `[9,31]` and #36 `[9,29,31,32,33,34,35]`; all eight updated issue bodies began with the new dated execution section. No issue was closed, no upload was enabled, and no deployment or cleanup proof occurred.

After local commit `3a1b08b`, #30's current checklist was updated to mark the persistent Admin reminder implemented and component-verified, with browser readability still pending. The stale undecided-dependency sentence was replaced with the chosen #30-last order. Exact GitHub body read-back passed and #30 remained OPEN.

## F2 temporary media scope publication — 2026-10-27

The user authorized [ADR-0031](adr/0031-temporarily-disable-event-media-uploads.md), synchronized documentation, issue #30 updates and continued F2 implementation. [Issue #30](https://github.com/noelorph/diy-instax-photobooth/issues/30) now contains the current disabled-upload scope and verified local acceptance checklist, while retaining its entire original enabled-media plan in a clearly historical collapsed section. GitHub body read-back matched the submitted text exactly. #9 and prerequisite #29 were confirmed closed; #30 remains open pending the user’s closure/follow-up tracking decision.

Uploads remain temporarily unavailable; full feature/design and re-enablement qualification are preserved. The previous Task4 blanket hold is replaced by current disabled presentation and deferred enabled functionality. Prior media-bearing deletion stays pending without cleanup proof. Publication is not a test pass, release, deployment or issue completion. #30 closure/follow-up tracking awaits the focused user decision; no separate follow-up issue has been created.

**Final F2 update — 2026-10-27:** Candidate `9d6286f` implements the current upload-disabled scope. The [dated acceptance record](implementation/issue-30-disabled-media-acceptance.md) preserves the broader run’s three failures, their passing 13-case correction run, browser results, lint limits and deferred media proofs. The current six acceptance items were updated and a [completion report](https://github.com/noelorph/diy-instax-photobooth/issues/30#issuecomment-6433031240) posted. Both full body and comment matched exact GitHub read-back; issue state remains OPEN. The original enabled-media plan is unchanged in its historical section. No follow-up issue, closure, push, deployment or re-enablement occurred.

**Published and read-back verified, 2026-10-25:** #10 contains the approved complete-removal scope and eight native children, F1–F8 (#29–#36). The user approved the plans, requested documentation commit `0bd7503` first, then explicitly authorized issue publication and this local record. Implementation remains on hold. #9 stays closed as completed; #10 and all children stay open. #17/#7 drafts below remain unpublished. The user subsequently authorized committing these publication records; nothing was pushed.

## Issue #9 accepted prerequisite

[#9](https://github.com/noelorph/diy-instax-photobooth/issues/9) passed on `2f89a96afee2dfdc2a1d540cbcc3c0ee4380bbbb`: 901/901 tests across 53 files, static/build/SQL checks and 19 + 2 + 1 browser checks. Its [dated local evidence](implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25) and [published acceptance](https://github.com/noelorph/diy-instax-photobooth/issues/9#issuecomment-6386836261) remain the acceptance record, including failed earlier attempts and corrections.

Keep its current package accounting, lifecycle, current authorization after locks, scoped grants, receipts, concurrency, one-send dispatch, readiness, reconciliation and simulator evidence policy in #10. Do not reopen #9 or rewrite its historical result. Its legacy conversion/snapshot safeguards were accepted under the former data-preservation decision; [ADR-0029](adr/0029-remove-legacy-features-and-reset-development-schema.md) now schedules those obsolete parts for removal in #10.

## Published wording and current scope

#10 now requires complete legacy removal and a fresh package-only installation under ADR-0029. F1–F7 remove their obsolete application paths; F8 completes shared removal and replaces the migration chain while preserving and reverifying current #9 contracts. No legacy History reader, Draft conversion/review, snapshot/import, activation/preflight machinery or version-1 fallback is a completion requirement.

#9's unchanged body retains the preservation policy under which its work was accepted. That is dated evidence, not current #10 scope; ADR-0029 supersedes those clauses without rewriting #9's result. #10 publication is not implementation acceptance.

## Publication verification 2026-10-25

Read-back at **2026-10-25 13:42 UTC** compared the complete live bodies with the prepared approved text and checked GitHub's native parent/dependency APIs:

- #10 matches the approved complete-removal body and published capability map. Its title, open state, label, assignees and milestone are unchanged; its native prerequisite remains #9.
- F1–F8 (#29–#36) match their full plan/scope/task/verification snapshots and owned acceptance rows. All eight have native parent #10 and exactly the approved **27 child blocker edges**, including the completed #9 on every child.
- All **23 implementation tasks** and **27 acceptance rows** remain pending. No readiness labels or assignees were added; no child was closed.
- #9's body, completed state, metadata and update timestamp are unchanged. Its accepted evidence remains linked in every child.
- The pre-publication reread corrected one F4 instruction that still said to retain converted-booking review guards; it now removes them with F2's retired review workflow, as required by ADR-0029.
- The [main plan's publication table](superpowers/plans/2026-10-24-issue-10-implementation-plan.md#publication-record--completed-2026-10-25) and each child plan record the issue URLs and prerequisites. Current status docs distinguish completed publication from implementation still on hold.

The child bodies reproduce approved plan/trace content because the local documentation commit has not been pushed. Repository references are explicitly paths to read locally; no unavailable branch link is the only instruction. The local acceptance trace remains the source of execution evidence. No code, database, physical test or hosted deployment action accompanied publication.

## Issue #10 published body

The following is the body read back from [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10); heading levels are nested here for this document. The issue links below are the resulting native children, not completed work.

### Goal

Complete the first-release Admin and Booth application using the approved package-accounting and recovery contracts. Use a nonproduction simulated printer for software development and testing. Remove superseded product behavior and its related UI, application code, and mutation paths and finish with a verified fresh package-only database.

### Status and implementation gate

The [#9](https://github.com/noelorph/diy-instax-photobooth/issues/9) software prerequisite is satisfied, and #9 is closed as completed. The package-addition/reload authorization finding and Profile focus assertion are resolved and independently reviewed. Reviewed candidate `2f89a96afee2dfdc2a1d540cbcc3c0ee4380bbbb` passed 901/901 tests across 53 files, required static/build/SQL checks, and all three browser gates (19 + 2 + 1 tests). See the [published #9 acceptance evidence](https://github.com/noelorph/diy-instax-photobooth/issues/9#issuecomment-6386836261).

The eight-capability design and complete legacy-removal decision are approved. The revised implementation/publication plan was approved on 2026-10-25; #10 implementation has not started. The eight capability sub-issues (F1–F8) were published on 2026-10-25 following explicit user authorization. Implementation remains on hold until a later explicit user instruction and the capability prerequisites are satisfied. The local plan is `docs/superpowers/plans/2026-10-24-issue-10-implementation-plan.md`.

This issue remains open for the complete application integration, complete legacy removal, fresh installation, and acceptance below. #9's software verification does not establish #10's integrated acceptance or the #17/#7 physical gates.

### Complete first-release scope

- **Admin application:** authentication and password recovery; Dashboard; Events listing, creation, editing, setup, and detail; History; and Profile, including local sign-out.
- **Package accounting:** derive capacity from original and Additional Film Packages at ten prints each. Show confirmed, pending, remaining, and available counts appropriately. Keep package purchases separate from physical film loading.
- **Initial Booth handoff:** complete setup on the iPad, sign Admin out locally on that device, activate scoped Booth access, and enter `/booth`. Preserve the phone’s Admin session.
- **Guest journey:** welcome with private Event Media or default presentation; live preview; capture and 3–2–1 countdown; review; Retake; printing; completion; and return to a fresh welcome. Implement approved crop, Capture selection, inactivity, and photo-disposal rules.
- **Phone operations:** Additional Film Packages, reload requests and physical reload confirmation, exceptional inspection with a required reason, Pause, Resume, Finish Booth, and separate Event completion.
- **Recovery:** camera, Bluetooth, network/server, page-reload, and access-loss recovery. Preserve pending attempts and explicit pauses. Routine recovery stays in Booth Mode; exceptional access replacement follows protected setup and returns the run to Paused.
- **Privacy and presentation:** keep Guest photo bytes in memory/direct printer transport only; provide private, validated Event Media; enforce Admin/Booth access separation; meet the main implementation plan’s accessibility and responsive-layout requirements.
- **Simulation and verification:** use a nonproduction printer simulator for complete integrated journeys and deterministic failure scenarios. Distinguish acceptance from ejection and uncertainty; never automatically resend an ambiguous attempt.

Setup retains only the reminder: **“Always test the printer before starting Booth Mode.”**

### Required retirement

Delete all of the following from maintained product code, schema, migrations, fixtures and obsolete specifications:

1. Editable Print Allowance.
2. Individual Additional Prints.
3. Shared Film Stock.
4. Wasted Film and quality-refund behavior.
5. In-app Test Print and its setup gate.
6. Client Redaction and past-Event deletion.
7. Superseded Booth recovery and local Admin takeover flows.
8. Legacy adapters, compatibility branches and helpers, including old History and conversion/review machinery.

For **each item**, trace its controls, callers, server actions, endpoints, database functions, tests, and fixtures. Record concrete deletion and surviving current-contract dependencies. Keep dated #9/physical evidence, not legacy readers or executable compatibility.

Remove obsolete application paths with their owning capability, then finish shared/schema removal in F8. Hiding controls or revoking grants alone is insufficient. Prove dedicated old routes and database objects are absent, stale calls fail without mutation, and current contracts still pass.

### Complete removal and fresh installation

- Existing data is disposable development/test data; the client has not bought the project. ADR-0029 supersedes legacy preservation/conversion requirements.
- F1–F7 remove obsolete code with their current flows. Delete features without replacements once shared dependencies are handled.
- Remove legacy History readers, Draft conversion/review, snapshots, version-1 fallback branches, owner activation/preflight machinery and compatibility endpoints. Keep current version-2 protocol identifiers where the approved contract requires them.
- F8 replaces the old migration chain with a complete package-only baseline that installs on an empty database without creating legacy objects. Reproduce final #9/F1–F7 definitions, constraints, RLS, grants, authorization rechecks, receipts and locking; do not keep only the newest migration file.
- Rebuild only identified disposable local test projects, with test apps stopped and physical printers disconnected/quiescent. Do not import legacy records or guess a physical outcome to clear a hold. Runtime uncertain-print safety is unchanged.
- Preserve current package-era Completed/Cancelled History and private media, plus safe never-started Draft deletion. This ongoing retention does not apply to discarded pre-reset test records.
- Preserve accepted #9 evidence and current contracts. Reverify the complete current suite after the baseline changes; historical #9 passes do not certify #10.
- Prove absence/security, independent fresh installation and all integrated journeys on the final baseline. No hosted reset or deployment is part of #10.

### Acceptance

- [x] #9’s software prerequisite is satisfied before #10 implementation; the reviewed revision and [acceptance evidence](https://github.com/noelorph/diy-instax-photobooth/issues/9#issuecomment-6386836261) are recorded.
- [ ] All first-release Admin, Guest, phone-operation, and recovery flows pass integrated nonproduction acceptance.
- [ ] Accounting and recovery checks cover final-print capacity, pending holds, duplicates, lost responses, stale state, overlapping faults, stop/dispatch races, access loss, and no automatic resend.
- [ ] Every retirement item has a completed trace and removal record, with passing absence and stale-request denial tests.
- [ ] The clean package-only baseline passes empty-database installation, schema/RLS/grant checks and all current contract regressions; no old migration, reader or conversion path remains.
- [ ] Privacy, private Event Media, authorization, accessibility, and responsive layouts pass their required checks.
- [ ] Required unit, database/integration, browser, lint, type, formatting, and build checks pass for the final reviewed candidate, with recorded evidence.
- [ ] Simulation remains nonproduction and cannot authorize real-printer operation.

### Completion and external gates

Complete when the full application, complete legacy removal and fresh package-only installation pass nonproduction acceptance on the final reviewed candidate.

Closing this issue does not authorize real-printer enablement or production launch; those remain gated by [#17](https://github.com/noelorph/diy-instax-photobooth/issues/17) and [#7](https://github.com/noelorph/diy-instax-photobooth/issues/7), respectively.

Real-printer enablement requires physically qualified automatic normal full-ejection completion and safe recovery. Phone inspection is exceptional recovery, not routine confirmation after every print. Printer-reported count is neither physical inventory nor proof of a loaded ten-sheet package.

### Detailed references

- `PRD.md`, `ARCHITECTURE.md`, `GLOSSARY.md`, and `docs/superpowers/plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract`
- `docs/adr/0025-package-accounting-and-booth-recovery.md`
- `docs/adr/0026-order-captures-by-shutter-time.md`
- `docs/adr/0029-remove-legacy-features-and-reset-development-schema.md`
- `docs/superpowers/plans/2026-10-24-issue-10-implementation-plan.md`
- `docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md`
- `docs/booth-user-flow.md`
- `docs/qualification/booth-recovery-proof-checklist.md`

### Capability sub-issues and prerequisites

All eight are native sub-issues of #10. Each also records the already-completed #9 as a satisfied native dependency. The table lists additional prerequisites; all implementation and acceptance evidence remains pending. No child is assigned or marked ready for implementation.

| Capability                                                           | Sub-issue                                                          | Prerequisites besides #9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1: Complete Admin access and account management                     | [#29](https://github.com/noelorph/diy-instax-photobooth/issues/29) | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| F2: Complete Event preparation and private media                     | [#30](https://github.com/noelorph/diy-instax-photobooth/issues/30) | [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| F3: Complete booked capacity and Additional Film Packages            | [#31](https://github.com/noelorph/diy-instax-photobooth/issues/31) | [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| F4: Complete Booth setup, access and lifecycle                       | [#32](https://github.com/noelorph/diy-instax-photobooth/issues/32) | [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29), [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31)                                                                                                                                                                                                                                                                                             |
| F5: Complete the Guest capture-to-print journey                      | [#33](https://github.com/noelorph/diy-instax-photobooth/issues/33) | [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32)                                                                                                                                                                                                                                                                                                                                                                    |
| F6: Complete Booth recovery across devices                           | [#34](https://github.com/noelorph/diy-instax-photobooth/issues/34) | [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31), [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32), [F5 #33](https://github.com/noelorph/diy-instax-photobooth/issues/33)                                                                                                                                                                                                                                                                                             |
| F7: Complete operational visibility and retained history             | [#35](https://github.com/noelorph/diy-instax-photobooth/issues/35) | [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31)                                                                                                                                                                                                                                                                                                                                                                    |
| F8: Complete legacy removal, fresh installation and final acceptance | [#36](https://github.com/noelorph/diy-instax-photobooth/issues/36) | [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29), [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31), [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32), [F5 #33](https://github.com/noelorph/diy-instax-photobooth/issues/33), [F6 #34](https://github.com/noelorph/diy-instax-photobooth/issues/34), [F7 #35](https://github.com/noelorph/diy-instax-photobooth/issues/35) |

## Issue #17 — physical printer evidence

**Published and read-back verified, 2026-11-07.** The body below records accepted trial checks and incomplete qualification; publication does not close the issue.

### Goal and current status

Updated 2026-11-07, Asia/Manila; the latest trial timestamps are 2026-11-06 UTC.

Qualify automatic normal **full physical ejection** and safe recovery on the supported Mini Link 3 setup before enabling real printer-backed Booth Mode. **This issue remains open.** Phone inspection is exceptional recovery; ordinary successful printing must complete automatically.

The accepted milestone is: **Automatic ejection detection demonstrated successfully on FI033/0102 in the reviewed trials.** This is scoped trial success, not a qualified production adapter or release approval. #10 development may continue with a nonproduction simulator. Actual-iPad release qualification remains separately tracked in #7.

### Passed November 6 trial checks

- [x] Automatic `rea-candidates-v1` ejection candidates accompanied the reviewed successful used-sheet outputs.
- [x] The last physical used sheet also produced an automatic candidate.
- [x] The subsequent known-empty attempt produced no false ejection candidate: it recorded an error, candidate invalidation and an uncertain outcome.

The last-sheet and empty attempts are attempts 1 and 2 of `run-a79dc280-a5e6-47bd-8591-c447ff817840`. The cumulative export repeats attempt 1; its candidate does not belong to the empty attempt.

The harness still required manual final confirmation. These trials did not establish automatic production completion/accounting, precise full-clearance timing across required conditions, exclusive no-film diagnosis, or post-error recovery. Reported film count remained nine while the operator knew the cartridge was empty; the count is not physical inventory.

### Preserved October evidence

The supervised iPhone dry run passed camera, capture, Retake, Guided Access, connection and pre-command disconnect checks. Seven fresh-film qualification prints matched reviewed crop/orientation, but page resets and missed manual confirmations interrupted the required sequence. A separate three-used-sheet run demonstrated Retake and exhaustion of the historical local harness limit; the operator reported the fourth trial blocked and the supplied log contains no fourth command. Its reported count fell 10 → 7 while physical sheets fell 3 → 0. A later one-sheet run left no physical sheet known loaded while reporting nine.

The official-app trace showed count drop before `12 7f` clearing; Bluefy often sampled them together. These October observations did not resolve the ordering against complete physical emergence, and no separate Link 3 ejection notification was recorded. Those results remain valid for their recorded scope; neither establishes the current automatic completion/recovery contract.

### Remaining qualification

- [ ] **P1:** qualify full-ejection correlation with synchronized video/logs, documented timing precision, normal fresh-film/last-sheet and relevant fault cases; record exact device, OS, browser, firmware and evidence-policy versions.
- [ ] **P2:** complete three consecutive fresh-film Guest Sessions, including Retake, matching reviewed crop/orientation and automatic completion without a manual success tap.
- [ ] **P3:** qualify reliable attempt-specific no-film/no-output classification **or the approved generic-fault/Pending/inspection fallback**; never infer no output from a timeout or count alone.
- [ ] **P4/P10/P11:** validate physical reload, exceptional inspection, old-job clearance and readiness, including uncertain/partial output and stale or interrupted recovery. Loading film does not settle an old attempt or add Event capacity.
- [ ] **P6–P9:** verify Bluetooth, internet, camera and page reload/crash boundaries without duplicate sends or delayed output from an unresolved old attempt.

**P5 automatic reload detection is optional.** Qualified physical loading plus phone confirmation is the approved fallback. Unknown outcomes remain unresolved and block new guests. Never automatically resend an ambiguous print.

### Governing documents and evidence

- `docs/adr/0025-package-accounting-and-booth-recovery.md`
- `docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md`
- `docs/qualification/booth-recovery-proof-checklist.md`
- `docs/qualification/issue-17-trial-report.md` — preserved October observations.
- `docs/qualification/2026-11-06-ejection-detection-trials.md` — November trial record, local evidence commit `0c688e6` (not pushed); videos remain local.

Passed individual checks do not complete the remaining qualification groups or authorize production printing.

## Issue #7 — actual iPad release trial

### Proposed replacement scope

Validate the implemented target on the actual iPad A16, with recorded model, iPadOS, Bluefy and Mini Link 3 firmware. iPhone evidence is development evidence only. Require automatic normal completion and qualified recovery, then test portrait crop, camera/Bluetooth coexistence, power, Guided Access guest isolation and recovery controls while locked.

### Proposed acceptance checklist

- [ ] P12: actual iPad end-to-end Guest flow and multiple fresh-film sessions including Retake.
- [ ] P13: exhaust booked package prints; add a whole package on phone; physical reload is separate from capacity.
- [ ] P14: phone Pause/Resume/Finish, pending print recovery and separate Complete Event; retain explicit pause and keep iPad in Booth Mode.
- [ ] Bluetooth/internet/camera/page-reload faults recover with safe outcomes and no auto resend; grant loss remains exceptional protected setup.
- [ ] No in-app test gate, inventory/quality corrections or terminal redaction/deletion controls; privacy and history intact.
- [ ] Resolve affected shared or device-specific defects and repeat the relevant trials before release. Do not close based on simulator success.

## Cross-issue cleanup notes

The November 7 #17 publication supersedes its older unpublished scope and obsolete prerequisites. #7's replacement scope remains a draft; do not infer publication or acceptance from its presence here. Keep #9's accepted state and the published #10 scope intact. For future updates to #7, use ADR-0021 for staged physical qualification and ADR-0025 for current completion/recovery policy; preserve dated observations and do not restore closed #8 as a pre-build blocker.
