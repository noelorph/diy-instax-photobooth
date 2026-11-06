# Issue #35 F7 — final whole-branch review

**Range:** `be7d69074d01ad7450f86e49dff9c4557cd00faf` → `d4b5cb4`, branch `codex/issue-35-f7`, worktree `/Users/brandonorphiano/.codex/worktrees/3b28/diy-instax-photobooth`.

**Spec compliance: PASS. Quality: APPROVED. Ready to merge: Yes, for the approved F7 local software scope.** No Critical, Important or Minor defect requiring a change was found. This verdict does not authorize production Booth operation or close the external qualification gates.

## Scope and method

Read-only review using the requesting-code-review skill and reviewer template. Inspected the supplied review package and actual Git range, final production code and its relevant unchanged dependencies, F7 plan, exact constraints/interfaces and progress ledger, all three task reports, earlier task reviews and `/tmp/issue-35-task3-review.md`, maintained acceptance documentation and durable verification artifacts. Reviewed the documentation authority, product/architecture requirements, November presentation contract, package/recovery and venue-month decisions, and qualification boundaries. Inspected saved wide Dashboard and compact dark terminal screenshots.

No source/index/HEAD changes, test reruns, database commands or browser sessions. Only this report was written. The checkout was clean during the review.

## Strengths

- **Correct reporting definitions and stable ordering.** `src/features/admin/dashboard/read.ts:16` authenticates before reading, excludes deleted/legacy/Cancelled Events and explicitly pages the summary query. Its venue-local conversion at line 93 uses both scheduled and server instants; upcoming membership and start/ID ordering are independent of monthly membership. Activity predicates and descending timestamp/ID order are in the query, with 26-row lookahead and 25-row output. `tests/integration/dashboard-read.test.ts:82` exercises DST/month edges and tied starts; the activity and 1001-row tests protect ordering, boundaries and default-cap behavior. The previously reported month-sensitive browser fixture now keeps its venue month stable throughout its bounded real-clock run.
- **One authoritative accounting boundary.** `src/features/admin/dashboard/read.ts:64` and `src/lib/events/history.ts:68` reuse `readPackageAdminState`; no second ledger, legacy count fallback, quality refund or stock model was introduced. Inspected the dependency's error propagation and the existing package-read/count SQL authorization/formulas. Live 60 booked / 37 confirmed / 1 pending / 22 available and terminal 50 booked / 13 confirmed / 14 Captures are asserted through real reads. The isolated authorized package-read failure regression now distinguishes failure from absent Live data or zero counts. Run state remains distinct from Event state.
- **Access and private-data boundaries remain explicit.** Both new read paths call `requireAdmin`, preserve Next control-flow exceptions and apply current-package/nondeleted predicates. The unchanged live-session check and proxy private/no-store behavior remain in use. Dashboard activity exposes only the four agreed fields and suppresses deleted Event links; unknown labels use a safe own-property fallback. Actual browser assertions cover authenticated response headers and globally revoked-session redirects on Dashboard, History and direct terminal URLs. No new privileged delivery, raw audit payload, contact copy in activity, media URL or Guest-photo path was added.
- **History is terminal and immutable.** `src/lib/events/history.ts:45` restricts filters to Completed/Cancelled and returns authoritative counts without fetching operational attempt pages for every row. The detail read at line 77 uses all-time stable activity pages, separate Capture totals and attached-media metadata. Failed required reads return unavailable. `src/app/(admin)/events/[eventId]/page.tsx:31` routes successful terminal records to their dedicated view and stops on failure; Draft/Live behavior and independent attempt-page handling remain below that branch. `src/features/admin/events/history-detail.tsx:116` preserves the unavailable-media message and cleanup reminder, including genuinely empty metadata. The earlier unsupported past-use sentence is gone. Browser tests send valid terminal mutation requests and require HTTP 409 / `invalid_transition`, rather than treating missing controls alone as authorization proof.
- **Shared-shell changes are bounded and covered.** `src/components/layout/admin-shell.tsx:16` uses a pathname-scoped terminal marker with unmount cleanup. The new History selection is checked on terminal reload, navigation into a Draft and back; Live retains Events. November colors/font reuse semantic roles, shared components and local font delivery. The enlarged-text CSS correction addresses an observed failure; saved screenshots and assertions show readable stacking. Existing wide light/dark Draft workflows, public recovery, Profile and native zoom provide useful regression evidence for the shared foundation change.
- **Retirement and scope control are sound.** The obsolete `getHistorySummary` and its caller are removed. A fresh source search found no retired allowance/stock/waste/corrected-total/redaction/summary consumer outside generated database types. No schema, dependency, analytics infrastructure or new mutation owner was added. Existing pending removal remains an opaque previously deleted Draft workflow, separate from terminal History.

## Issues

### Critical — Must fix

None found.

### Important — Should fix

None found.

### Minor — Nice to have

None requiring a follow-up in this branch.

## Evidence assessment

- Read the durable raw logs: the prescribed four-file Vitest command passed **34/34 at `bb04723`**. Independently recomputed all 15 files in `vitest-source-equivalence.json`; their recorded revisions and current HEAD match the recorded final source blobs.
- Both complete F7 production browser journeys passed at **`652d181`**. The combined command is correctly retained as **4 passed / 1 failed**, because the native 1000 Draft focus helper ran before hydration enabled its button.
- Inspected **`652d181` → `55f0afd`**: its only source/test change adds the enabled wait before focus. The focused native log records **3/3 passing**, retaining focus, in-viewport and Enter assertions. No production source or F7 browser spec changed afterward; **`55f0afd` → `d4b5cb4`** contains no source/test change. A repeat of unchanged F7 flows is not needed to substantiate this split evidence, and no combined final 5/5 run is claimed.
- The preflight raw log records production simulation denial, both existing wide Admin theme cases, public recovery and Dashboard passing; its History navigation timing failure is retained, corrected and superseded by the later complete History pass. Native metrics distinguish actual browser zoom from separate root-text enlargement.
- Static/Markdown/link and final isolated-stack cleanup results are preserved as recorded evidence. This reviewer did not regenerate those outcomes or inspect the current live environment. Earlier Task 2 results remain attributed to that report where raw logs are unavailable; the later integrated raw logs cover the required final paths.
- Documentation accurately separates approved scope, implementation, local software verification, issue closure and external gates. The pause handoff's pending-review statements are dated historical status; recording resumption and this final approval is controller bookkeeping, not a production defect.

## Declined to judge

- Enabled media transfer, renewal, private playback and supported byte-cleanup proof: deliberately open #30 qualification; this branch makes no enabled-media acceptance claim.
- F6 recovery, F8 schema removal/fresh installation and full #9/whole-application requalification: separately owned work, with no schema or accounting mutation introduced here.
- Physical automatic full ejection, reload/recovery, actual iPad A16/Bluefy and hosted deployment: not established by local reads, simulator fixtures or Chromium evidence.
- New aggregation infrastructure or History batching redesign: existing package reads meet the specified boundary; no measured load failure justifies expanding this branch. Large-dataset performance is not benchmarked by the current evidence.
- Snapshot-consistent paging while other requests add activity: the agreed contract requires stable ordering on a fixed dataset, which is covered; it does not require a new cursor/snapshot protocol.
- Pixel-identical specimen decoration, unused editorial fonts and new event-label/contact enrichment: not required by the approved scope and unnecessary for the functional reporting contract.

## Recommendations and assessment

Record the final review and resumed completion status in the controller's maintained handoff/evidence flow. No implementation correction or additional unchanged test rerun is requested.

**Ready to merge: Yes.** The final branch satisfies the F7 read, presentation, privacy and immutable-retention requirements with meaningful database and browser evidence. The implementation reuses existing boundaries and avoids expanding into deferred media, recovery or schema work.

Skipped fresh test/static/DB/browser runs and a complete unchanged-SQL security re-audit; recorded results were inspected rather than recreated. Remaining risk is unqualified enabled media, F6/F8/fresh schema, whole-application acceptance, physical printer recovery and actual-iPad release—not an identified F7 branch defect.
