# Spec compliance

**Verdict: Pass for the implemented Task 1 behavior, with the nonblocking verification gaps below.** Reviewed `be7d69074d01ad7450f86e49dff9c4557cd00faf..e4f48ba8bf53ed9fa2892758bf6a4cdc1eca90c9` against the supplied task brief, exact interfaces, Global Constraints and November presentation contract. Task 2/3 requirements are not graded as missing Task 1 work.

**Task quality: Approved for proceeding to Task 2.** No Critical or Important finding. The read projection is small, uses the existing authoritative accounting boundary, and has meaningful database and presentation assertions. The remaining concerns do not demonstrate incorrect production behavior.

## Strengths

- `src/features/admin/dashboard/read.ts:16`: authorization precedes reads; package-only and nondeleted predicates protect the summary. Explicit 500-row pages avoid the default database cap. `tests/integration/dashboard-read.test.ts:1` supplies real database regressions for the four Event states, retained cancellation, deleted Drafts, 1001 rows, venue-local month boundaries and DST, instead of mocking query results.
- `src/features/admin/dashboard/read.ts:42`: upcoming Events are selected independently from monthly totals and sorted by scheduled instant then ID. Both scheduled start and server instant are converted into the Event's venue zone for the monthly comparison (`read.ts:91`).
- `src/features/admin/dashboard/read.ts:64`: the Live card delegates counts/run state to `readPackageAdminState`; it does not introduce another ledger. `src/features/admin/dashboard/dashboard.tsx:67` separately renders Event Live and actual run state, including no run. The component regressions assert 60 booked, 37 confirmed, one Pending and 22 available, plus distinct absent/unavailable states (`tests/components/dashboard-history.test.tsx:34`).
- `src/features/admin/dashboard/read.ts:66`: activity predicates, descending timestamp/ID order and the 26-row lookahead are applied in the database. The returned projection contains exactly four safe fields; the bounded reference lookup suppresses links to deleted Events. The integration assertions check exact IDs across tied timestamps, repeated fixed-dataset reads, 7/30-day boundaries and the precise safe object keys.
- `src/features/admin/dashboard/dashboard.tsx:117`: window links reset page selection and pagination preserves the window. Unknown audit kinds use an own-property check and a fixed fallback, with `constructor` and `__proto__` regressions (`tests/components/dashboard-history.test.tsx:130`).
- `src/app/(admin)/dashboard/page.tsx:5`: a request-time server instant follows `connection()`; route query values are validated before use. `src/features/admin/dashboard/read.ts:119` preserves Next control-flow exceptions and returns an honest unavailable result for read failures. Loading/error states retain a Dashboard heading, and retry performs a full navigation.
- `src/styles/globals.css:111` and `src/app/layout.tsx:15`: the November palette/font reuse semantic roles and local font delivery, with Admin/Profile-preview scoping rather than a second component system. The supplied wide-light and compact-dark screenshots show the A01 summary hierarchy, inverse Live card, grouped activity and compact reflow; the appearance is not a claim of pixel-identical reproduction. Shared header/control reuse and actual-state labels appropriately differ from the sample.
- Existing evidence inspected: `/tmp/f7-dashboard-final-tests.log` records 43/43 tests in four files; `/tmp/f7-dashboard-browser-pass.log` records 1/1 browser test. Browser assertions cover actual data, filters/pages, links, run variants, font loading, themes, contrast, focus, multiple widths, increased text size, outage and retry. No passing test was rerun.

## Findings

### Critical

None.

### Important

None.

### Minor

1. **Add the specifically requested Live-count failure regression.** `tests/integration/dashboard-read.test.ts:314` injects failure into `activity_events`; the Live-state test signs out the Admin but does not isolate an authorized Live Event whose package-count read fails. Task 1 Step 2 specifically calls for this case. The inspected implementation propagates the package RPC/read errors into unavailable, so this is a coverage gap rather than an observed runtime defect. A focused test should preserve successful Event/activity reads, fail the package-state/count dependency, and assert unavailable rather than `liveEvent: null` or successful zero counts. This would protect the distinct failure path from future changes.

2. **The browser monthly-count fixture depends on the wall-clock month.** `tests/e2e/dashboard-history.spec.ts:16` takes the current instant, and its Draft starts one hour later (`tests/e2e/dashboard-history.spec.ts:37`), while the monthly assertion always expects three. During the final hour of the Asia/Manila month, the Draft belongs to the next month and the correct result is two. This can fail a correct implementation periodically. Make the server/fixture clock deterministic or calculate the expected venue-month membership independently for this fixture; retain the fixed four-state monthly integration regression.

3. **Passing browser output is noisy.** `.superpowers/sdd/2026-10-24-issue-10-f7-visibility-history/task-1-artifacts/f7-dashboard-browser-pass.log:1` repeatedly reports that `NO_COLOR` is ignored because `FORCE_COLOR` is set. The test still passes, but the warnings make real runtime warnings harder to spot. Resolve the conflicting runner environment when maintaining its launch configuration; no runtime source change is needed for this task.

## Named outside-diff checks

- **Risk: privileged package reads could hide failures or bypass current Admin authority.** Inspected `src/lib/operations/package-state.ts:7`, `src/lib/operations/package-rpc.ts:7` and the package Admin read/count SQL in `supabase/migrations/20261021131049_package_accounting_operations.sql:1`. The TypeScript path throws on RPC, unresolved-attempt and run-query errors; its SQL boundary invokes `private.package_require_admin` and requires a current, nondeleted Event. It returns authoritative counts, not fabricated defaults. This was a focused dependency check, not a re-audit of all later migrations or package contracts.
- **Risk: version filtering could discard current audit records or include legacy records.** Inspected package migration references/inserts; current package activity writes explicitly carry version 2, while the schema still contains version 1. The new version predicates are exclusion guards as required, not dual-version readers. A broad initial textual search produced truncated migration output; no conclusion relies on unseen output.
- **Risk: moving authorization out of the route could weaken session checks or caching.** Inspected `src/lib/auth/require-admin.ts:5`, `src/proxy.ts:10` and `src/lib/supabase/proxy.ts:26`. `requireAdmin` still verifies the profile through the live-session policy, Dashboard remains in the proxy matcher, and the proxy sets private/no-cache/no-store response headers. Redirect/control-flow exceptions are rethrown by the new read.
- **Risk: foundation changes could be outside the accepted presentation scope.** Read `docs/README.md`, then `docs/superpowers/plans/2026-10-24-issue-10-implementation-plan.md:38`. The accepted contract explicitly supplies these roles and Manrope and asks for shared-component/semantic-role reuse. Inspected A01 plus the provided 1440px light and 390px dark captures. No additional design feature was inferred from the references.

## Cannot independently verify in this gate

- Actual browser response headers, real unmocked session-revocation behavior across every consumer, and all Admin/Profile screens after the shared foundation change are not proved by the Task 1 diff. The focused source checks preserve their existing boundaries; broader integration review remains Task 3/whole-branch work.
- Static-check claims in the implementer report were not regenerated. The test/browser logs above were read directly; screenshots are supplied artifacts, not a browser session run by this reviewer.
- Physical printer completion, actual iPad/Bluefy, enabled media and fresh-schema qualification are outside this task and remain open.

## Behaviors considered and deliberately not requested

- Did not request a new SQL aggregation/projection or an analytics abstraction: explicit pagination meets the stated cap requirement, and no measured query problem supports new infrastructure.
- Did not request snapshot isolation/keyset pagination across activity navigation: the requirement is stable ordering/membership on a fixed dataset, which the implementation/tests provide. Fresh activity can naturally change offset pages between separate requests.
- Did not request Event titles or richer audit payloads: the binding `ActivityItem` contract permits the safe Event reference used here; adding contacts or raw payloads would broaden scope/privacy exposure.
- Did not treat sample greeting, synthetic counts, additional sample artwork or an unused editorial font as requirements: the plan explicitly preserves a Dashboard heading and real state/counts, and the current screen does not need decorative typography.
- Did not demand History, terminal media controls, migrations or a broad branch suite before Task 2: those belong to subsequent work or unchanged contracts.

Skipped rerunning tests, DB/browser commands, branch/index mutations and physical checks; only this report was written. Remaining risk is the three minor verification/runner issues above plus the explicitly deferred cross-task and hardware gates.
