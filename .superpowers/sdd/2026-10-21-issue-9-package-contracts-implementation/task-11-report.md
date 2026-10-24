# Task 11 report — issue #9 contract verification and #10 handoff

Base commit for Task 11: `8debfdc`. The implementation range entering review was `4c583a4..8debfdc`; this Task 11 commit contains the route/fixture repairs and acceptance record.

The coordinator asked the focused AGENTS.md documentation question. The user answered **yes** to status-only edits in `PRD.md`, `ARCHITECTURE.md` and the approved replacement spec after verification. Those edits must preserve approved behavior, mark #10 screens and #17/#7 physical gates pending, and leave `GLOSSARY.md` and ADRs unchanged because no new decision was made.

## Work completed

- Mapped every approved contract section and section 6 route to owning contract, HTTP and database tests in `docs/implementation/issue-9-package-contracts-review.md`.
- Repaired the dispatch suite's simulated-policy fixture and used database time for Capture metadata; kept the production shutter/late-Capture checks intact.
- Replaced a timing-fragile 4.99-second positive readiness assertion with a comfortably fresh one-second case. The server still enforces the five-second freshness limit, with stale cases in the database suite.
- Added a real 49 Printed plus one Pending accounting case, including inspected NotPrinted release.
- Found shared-route regressions in the broad run. A five-route missing-auth test failed before the fix and passed afterward. Legacy production resolution tests failed when the v2-only simulator gate ran before version selection; after the fix, four Guest/Test and simulated/disabled policy cases passed, and the v2 gate remained tested.
- A complete broad run found that revoked v2 Admin authority also needs its own version-specific error code on all five shared routes. Five new real-database cases failed red and passed after resource-version-aware response mapping; the original recovery/replay case passed. The five legacy missing-auth cases stayed green.
- A complete broad run also found that the terminal late-Capture suite inherited the global simulator policy. Four cases failed at session start in both full and isolated runs. Saving/enabling/restoring simulated policy in that suite made all four pass without changing the two-minute or pre-stop shutter rule.
- Updated README, documentation index and software qualification checklist status without changing approved product decisions or checking physical proof boxes.

## Verification and blockers

The exact commands, case counts and limitations are in the linked implementation review. A complete first full run had 821/827 passing tests in 49/52 files; six failures were the scoped issues above plus one inherited redaction Draft-list assertion polluted by two exact old Ledger fixture rows from an earlier interrupted local run. Both IDs had no dependents, were removed with exact ID/title/state predicates, and the redaction case passed 1/1 afterward. A second clean full `npm test -- --reporter=verbose` passed **52/52 files and 832/832 tests** in 2505.48 seconds. Production Playwright passed 19/19; Booth simulator passed 2/2. Admin Booth simulator first timed out at 90 seconds with Test Print disabled after Connect, then passed 1/1 with action logging and passed 1/1 on an exact-command rerun. Post-fix `npm run lint`, `npx tsc --noEmit`, `npm run format:check`, and `git diff --check` all exited 0. The required `npm run build` initially failed twice in Turbopack before compilation because its CSS worker could not bind a local port (`Operation not permitted`), including with elevated local execution; its final exact rerun passed, compiling and generating 29/29 static pages. `npx next build --webpack` also passed during diagnosis.

## Open boundaries

- Issue #10 still owns new Admin/Booth UI consumers and browser acceptance. The local creation guard remains version 1; no hosted activation was performed.
- Issue #17 and #7 still own real printer full-ejection, safe recovery and actual iPad release evidence. The simulator does not close those gates.
- The coordinator owns the final whole-branch independent review. The user authorized status-only updates to `PRD.md`, `ARCHITECTURE.md` and the approved spec after verification; those updates preserve the approved behavior and pending #10/#17/#7 gates.

## Implementer self-audit

What this change does: it repairs test fixtures and version-aware response mapping found during acceptance testing, then records the software evidence and pending gates. I traced the five shared route callers, both version branches, the production simulator gate, and their real local Auth tests against the one-device/one-Event operating load. Looks good for this Task 11 diff; no actionable correctness, safety, load, test, or lean finding remains from this self-audit. The independent whole-branch spec/code/Ponytail review is still pending with the coordinator.
