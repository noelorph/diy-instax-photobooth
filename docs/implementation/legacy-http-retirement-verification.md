# Legacy HTTP retirement: baseline and software verification

Branch: `fix/retire-legacy-http-branches`. Evidence collected 2026-11-04–05. This record does not close #10, F8, printer qualification or actual-iPad qualification.

## Comparison boundary

The retirement implementation was uncommitted, so its pre-change parent was `441ff78` (current HEAD), not HEAD's parent. Read-only source snapshots were created with `git archive HEAD`; only the candidate received the frozen retirement patch. Patch SHA-256: `1fd784366f5efaff2dfd7a0e537922d930f10438ef5b66736e809e526cb61631`.

Each snapshot used its own synthetic-data Supabase stack with the existing, unchanged migration chain. The baseline used `diy-instax-retirement-verification` at API/DB `58321/58322`; the candidate used `diy-instax-retirement-candidate` at `59321/59322`. Both began with zero Events and the installed chain's creation default of version 1. All six DB/Auth/REST/Storage/gateway/Mailpit images matched exactly, including Postgres `17.11.0.004`. Node was `v24.22.1`; installed dependency versions were unchanged.

The identical test-only address/project substitutions selected those stacks. Temporary dependency symlinks initially prevented Turbopack resolving Next outside each snapshot's filesystem root. Identical filesystem-cloned dependencies fixed that harness error without changing either application. The candidate's comparison app used different ports to avoid collisions with the baseline. Native-zoom tab discovery was corrected to use the actual page URL rather than assuming port 1437.

No ordinary development Events, print attempts or media were copied into either comparison stack. Read-only Event and PrintAttempt JSON fingerprints matched the initial checkpoint after the software test runs, including the existing Live Event and Dispatching attempt. The ordinary `56321` stack contained eight Events, including one Live Event with a Dispatching attempt, and had an Event creation default of version 2. Those records were not deleted, resolved or used as fixture data.

## Comparison commands

The comparison commands executed were:

```sh
python3 /tmp/instax-comparison/run-vitest.py baseline
python3 /tmp/instax-comparison/run-vitest.py candidate
python3 /tmp/instax-comparison/run-browser.py baseline
python3 /tmp/instax-comparison/run-browser.py candidate
```

The scripts, exact argument arrays, selected failed-file list, source snapshots, frozen patch, image comparison and JSON results remain under `/tmp/instax-comparison` for this session. Each Vitest command selects the same 22 previously failed files. Each browser command selects the same 14 previously failed cases in `admin-ui-refresh.spec.ts`, `draft-event.spec.ts` and `package-capacity.spec.ts`. Baseline and candidate ran serially on their respective independent stacks. Temporary diagnostics and address substitutions were test-only; the parent application source stayed unchanged.

## Vitest baseline results

All 22 files from the earlier failed-file report were run on both revisions, with files serial within each stack.

| Run | Passed | Failed assertions | Skipped by setup |
| --- | ---: | ---: | ---: |
| Initial baseline | 367 | 1 | 7 |
| Initial retirement candidate | 347 | 0 | 33 |
| Baseline focused rerun | 13 | 0 | 0 |
| Candidate focused rerun | 33 | 0 | 0 |

The baseline page suite was blocked by the external dependency symlink. The candidate had a 60-second cold-build setup timeout and a 10-second Docker/CLI-discovery setup timeout. Reruns used local dependency copies and the same 120-second build allowance. The baseline's one assertion failure used an uncontrolled host-clock shutter timestamp in a pre-stop capture fixture; its rerun passed and verified the database bounds, and the candidate's original case passed. The maintained fixture now samples the database clock, preserving the server's pre-stop/two-minute guards.

After those documented reruns, all **375 common tests passed on both revisions**. The candidate's **five additional legacy-payload rejection tests passed**, for 380 candidate tests in the selected files. No retirement regression was found in that comparison. Initial failures and reruns remain separately recorded; these totals are unique-test outcomes, not a claim that both initial commands were green.

The large prior database-constraint failure groups did not recur on isolated data. Neither single-Live-Event nor unresolved-printer constraints was relaxed. The current migration chain and its security/negative boundary tests remain; F8 owns SQL retirement and the package-only baseline.

## Browser diagnosis

The unchanged baseline ran the 14 previously failing browser cases: eight passed and six failed on the outdated `Unable to load Draft` expectation. The page correctly displayed `Unable to load Event` because its operations read failed first. The candidate reproduced those six failures; a seventh native-zoom failure came from the comparison port mismatch, and its focused rerun passed after querying the actual page URL. The maintained test expects the current Event error heading and retains error/recovery assertions.

The original mobile Draft flow passed on clean data on both revisions, with `scrollWidth=390` at a 390px viewport. Adding a controlled synthetic Live Event reproduced the old overflow on the unchanged baseline: `scrollWidth=402`, with the Live banner text container retaining a 160px minimum at 200% scaling. The mobile-layout change caps that minimum with `min(10rem, 100%)`. The existing Draft browser flow now seeds its own Paused Live Event and checks the banner, so this coverage no longer depends on stray development data. Both 390px and 1440px cases passed with 200% scaling after the fix.

The Draft browser journey also checks that both removed `redact-client` and legacy event `pause` HTTP endpoints return 404/405. Generic parser tests use the current package `operationId` schema and reject the retired `operationKey` shape. No legacy HTTP behavior was restored to satisfy tests.

## Maintained fixture isolation

`tests/fixtures/test-stack.mjs` is the shared test-only selection/validation boundary. An explicit `INSTAX_TEST_WORKDIR` selects the named verification project; absent that variable, discovery still targets the ordinary local project. Before returning credentials, discovery verifies the exact local API and Docker project identity and refuses nonempty Event data or unresolved printer work. It does not erase or settle existing work. Six unit tests cover hosted/misrouted endpoints, project mismatch, valid verification discovery and contaminated state. Fixture callers, raw Docker operations, Mailpit reads and browser fault injection use the same selected stack.

`node tests/fixtures/start-verification-stack.mjs` prepares `.worktrees/verification-stack` from the existing migration chain and starts only the separate verification project. It does not reset the ordinary stack, globally activate package accounting or implement F8's baseline. Commands against a stack remain serial; cleanup remains scoped to exact synthetic IDs.

A complete verification run then exposed a second fixture-state dependency: the first legacy disabled-policy inspection test assumed the previous suite had left `printer_completion_policy.mode='disabled'`. A cancelled simulator run can leave `simulated` behind. The failure was reproduced on the idle candidate stack by explicitly starting with simulated policy: the inspection succeeded, contrary to that test's assumed precondition. The test now establishes disabled policy in `beforeEach`; the same controlled reproduction passed. No production policy, deadline or SQL guard was relaxed.

The completed pre-fix full run recorded 1,040 passes, one failure (that exact policy case), and 15 intentional media skips. A subsequent clean complete run passed all 60 files: **1,041 passed, 15 intentionally skipped, zero failures**, exit 0. This is a full-run result, not an aggregate of the earlier red run and a focused rerun.

Docker/CLI setup hooks have a 30-second runner budget, and the production page-suite setup has 120 seconds. Application deadlines, accounting locks, readiness expiry and printer safety rules were not changed.


## Simulator browser failures

The first complete Guest simulator run had one pass and one strict-locator failure. Both the application feedback and Next's empty route announcer matched the global `role=alert` selector. Scoping the two assertions to `main` preserves their content checks and avoids the unrelated announcer; the complete two-case rerun passed.

The first complete Admin/Booth simulator run had 18 passes and two failures: lost issue/confirmation responses reached the recovery dialog, but its viewport-covering assertion failed. A focused diagnostic measured the dialog at `x=0,y=410,width=1280,height=720` in a `1280×720` viewport, with computed `position:relative`. The shared Booth class overrode the handoff class's `position:fixed` at equal specificity. The unchanged parent snapshot reproduced the same failed viewport assertion, confirming this is a pre-existing layout defect rather than an HTTP-retirement regression. `.handoff[role='dialog']` makes the handoff positioning win independently of stylesheet order. Existing viewport coverage, accessibility, protected-content absence and hit-testing assertions remain unchanged; diagnostic instrumentation was removed.

Exact additional diagnostic commands (the working-branch command ran from the repository root, not the parent-snapshot directory):

```sh
# Run from the parent snapshot, whose fixture configuration selects only the synthetic 58321 stack:
cd /tmp/instax-comparison/baseline
npx playwright test --config playwright.admin-booth.config.ts --grep 'issue commit loss'
# Run from the working branch with temporary geometry instrumentation, before the CSS fix:
INSTAX_TEST_WORKDIR="$PWD/.worktrees/verification-stack" npx playwright test --config playwright.admin-booth.config.ts --grep 'issue commit loss'
```

Both commands exited 1 on the viewport assertion. The two cases are supported recovery behavior; their assertions were not retired or weakened. The complete 20-case simulator rerun then passed, exit 0.

## Earlier build/type setup blockers

The original `npm run build` failed before compilation completed when Turbopack's CSS-loader worker attempted an internal `127.0.0.1:0` listener: `Operation not permitted (os error 1)`. No ephemeral port number was assigned. An application-independent Node probe failed with `listen EPERM` on port 0 and ports 1436/1437 in the default sandbox, then succeeded with escalated execution. `lsof` found no competing listener. This was an environment limitation, not an occupied port or an application configuration defect. The same unchanged build succeeded outside that socket restriction. No loader/config bypass was introduced.

The original Playwright log instead showed its setup build failing type-check, so that particular attempt did not prove a port failure. `.next/dev/types/validator.ts:412` referenced exactly the deleted legacy `/api/admin/events/[eventId]/pause/route.js`. The supported `next typegen` command updates production route types; stale development output survived in the other included tree. The old ignored development type directory was archived under `/tmp/legacy-blocker-investigation/dev-types-before`, then types were regenerated and checked successfully. The current `/booth/pause` route remains distinct and supported. No legacy route was restored and no TypeScript exclusion was added.

Exact investigation commands (logs retained under `/tmp/legacy-blocker-investigation`):

```sh
lsof -nP -iTCP -sTCP:LISTEN
node /tmp/legacy-blocker-investigation/port-probe.cjs  # default sandbox, then escalated: same probe
sed -n '400,425p' .next/dev/types/validator.ts
mv .next/dev/types /tmp/legacy-blocker-investigation/dev-types-before
npx next typegen
npx tsc --noEmit
npm run build
npm run test:e2e
npx vitest run tests/integration/package-http-contracts.test.ts
```

Type generation/TypeScript passed; the escalated build completed (22 static pages) and Playwright started all 32 configured cases. Its earlier assertion failures were diagnosed by the comparison above. If loopback permission is unavailable, route generation, TypeScript and in-process HTTP-contract tests still run (72 contract tests passed in the default sandbox); production bundling and browser verification require an unrestricted host/CI runner. These partial checks do not replace those requirements.

## Reproduction and final results

```sh
node tests/fixtures/start-verification-stack.mjs
INSTAX_TEST_WORKDIR="$PWD/.worktrees/verification-stack" npm test
INSTAX_TEST_WORKDIR="$PWD/.worktrees/verification-stack" npm run test:e2e
INSTAX_TEST_WORKDIR="$PWD/.worktrees/verification-stack" npx playwright test --config playwright.booth.config.ts
INSTAX_TEST_WORKDIR="$PWD/.worktrees/verification-stack" npx playwright test --config playwright.admin-booth.config.ts
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
npm run format:check
```

| Check | Actual result |
| --- | --- |
| Full Vitest | Exit 0; 60 files passed, 1,041 tests passed, 15 intentional media skips |
| Production Playwright | Exit 0; 28 passed, 4 intentional media skips |
| Guest simulator Playwright | Exit 0; 2 passed after the locator correction |
| Admin/Booth simulator Playwright | Exit 0; all 20 cases passed in the complete rerun |
| ESLint | Exit 0 |
| Route type generation and TypeScript | Both exit 0; no deleted legacy pause reference in either generated type tree |
| Production build | Exit 0; compiled successfully, TypeScript passed and all 22 static pages generated |
| Formatting | Global check exit 1 on the untouched Profile file; changed-file check exit 0 |

Logs and machine-readable comparison reports are in `/tmp/instax-comparison` for this session. The full Vitest result precedes the final handoff CSS specificity correction; that correction is exercised by the complete simulator browser rerun and final build rather than rerunning unrelated database tests.

## Remaining limits

- The initial final-suite attempt was cancelled after a Draft replay case failed during a contended run; its complete error stack was not emitted before cancellation. That case passed in isolation in 2.2 seconds. No speculative application fix or per-test timeout change was made; the later clean full run passed all 48 DAL cases and all 60 files.
- `npm run format:check` flags the untouched `src/features/admin/profile/profile.tsx`. The same warning occurs on the byte-identical baseline file (SHA-256 `ec06f4eac3fec2a7a19d33c2dcfef06b6c1dcacaf12c7cd33986addaff94ec72`). This unrelated formatting was not silently bundled into the fix.
- Enabled-media tests/acceptance remain subject to ADR-0031/0032; uploads are unavailable. No media enablement or cleanup-proof claim is made.
- F8 SQL removal/fresh package-only installation remain separate. Physical automatic full-ejection and actual-iPad qualification remain open regardless of software results.
