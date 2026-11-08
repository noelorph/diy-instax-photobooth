# Task 1 implementation report

## Status and scope

Implemented the bounded development authority, immutable run policy and correlated outcome contract. This is a software candidate for independent review, **not database/software acceptance**: Docker is unavailable, so the migration has not been applied and SQL/integrated browser behavior remains unverified. No physical printer operation, database reset, hosted change, policy enablement, deployment, issue closure or owner environment edit occurred. The original checkout/owner README was not edited.

Used the project TDD and Ponytail full skills. Approved test seams were the mode helper, strict HTTP/RPC boundaries, adapter observations, durable metadata journal and existing Booth controller/components. No subagents/dependencies were added. Read the task brief, global constraints, approved external design, installed Next.js route/server-client/environment guides and current authority documents before implementation. Task 5's file map was used only for accompanying decision documentation.

## Changes

- `BOOTH_PRINTER_MODE` replaces the old boolean in actual setup/entry/operation callers, CI, runner and tests. Missing/unknown modes and production fail closed. New work passes the trusted server mode into private SQL checks; browser schemas cannot select it.
- Readiness carries strict simulator/FI033-0102 descriptors and separate old-job safety. Reconnect reports validate the descriptor against the run pin. Stable paired cover/load fault metadata is forwarded from adapter snapshots.
- Ready-for-new-job is attempt/dispatch/printer bound. All persisted observation metadata and HTTP serializers retain adapter/evidence/generation/identity correlation. Connection-scoped callbacks are bound by the controller to authoritative pending work before journaling; old unbound journal shapes fail closed.
- Scoped state exposes the evidence pin and pending dispatch ID. A valid pinned simulated run retains nonproduction entry reconciliation after mode-disable; physical runs remain blocked until Task 3 installs their owner, without simulator fallback. Task 3 must mount the pinned physical owner for reconciliation even when new-work mode is disabled.
- The forward migration leaves the owner policy/default disabled and adds an immutable run pin. Existing version-2 rows receive only simulator-v1. New Start pins supported acknowledged setup evidence. Start/session/reserve/dispatch enforce matching server/database/run authority; correlated outcomes use the original pin after either setting changes.
- SQL preserves receipt-before-fresh-generation checks, global guard → Event → run → attempt/request lock ordering, existing Admin/grant attribution, later media cleanup/commit safeguards and shutter-time selection.
- Physical policy rejects automatic no-film and unqualified inspected NotPrinted/clearance, preserves prior safety for proven non-send, and allows normal readiness only after matching uninterrupted normal Printed evidence. Contradictory terminal observations retain accounting and block physical safety. Physical Finish waits for safety and the final valid ready report; Start rejects unsafe physical history across Events/runs.
- Added ADR-0035 and concise current-authority/contract/setup updates. Historical acceptance/physical reports remain unchanged. Physical adapter, reload endpoint/observer, final full documentation reconciliation and broader F6/F8/media work remain with their owning tasks.

The 620-line / approximately 61 KB migration primarily repeats the existing current function bodies so PostgreSQL can replace them atomically. Sources: equipment blockers (20261021132628), ordered readiness validator/reporter (20261021134657), lifecycle with latest media guard (20261026143000), Finish/scoped read (20261021135752), current grant-attributed Start Session (20261021151455), shutter-order Reserve/Dispatch (20261022130949), observation validator (20261021154657), latest Observe (20261022124723), and current Resolve Attempt (20261021233012). The new logic is policy/descriptor validation and pinning, identity correlation and physical safety guards; the rest preserves those existing bodies.

## TDD and checks

1. Added “production refuses both development modes” and missing/unknown mode assertions before implementing the helper. The required baseline command was:
   `npm test -- tests/unit/package-printer.test.ts tests/integration/package-instax-policy.test.ts tests/integration/package-outcomes.test.ts tests/integration/package-http-access.test.ts`
   Result: the two new unit assertions failed because `getBoothPrinterMode` did not exist; 16 existing printer tests passed. The new integration file had not yet been created in that first slice. Existing integration suites failed in their setup hooks before creating fixtures, initially because sandboxed Supabase telemetry writes were denied. An approved read-only preflight then reached Docker and failed `failed to inspect container health: EOF`. Coordinator separately confirmed `docker info`/`docker ps` EOF; no database was mutated. The environment failure is not a policy-test red/green result.
2. Added all requested named integration scenarios before writing the SQL implementation: physical mismatches, immutable pin, uninterrupted readiness, mode-change settlement/new-work denial, non-send safety, unsafe Finish/Start bypass and receipt-versus-fresh-stale evidence. Additional direct service-RPC tests cover unsupported model/firmware/adapter/version, browser-role RPC denial and retaining the active grant until final physical ready/Finish. These tests compile/collect but cannot establish behavioral results without Docker.
3. Focused runnable command:
   `npm test -- tests/unit/package-printer.test.ts tests/unit/package-contract.test.ts tests/unit/package-print-dispatch.test.ts tests/unit/package-print-journal.test.ts tests/unit/booth-flow.test.ts tests/unit/booth-page.test.tsx tests/components/booth-setup.test.tsx tests/integration/package-http-contracts.test.ts`
   Final green: **277 tests passed in 8 files**, 15.20 seconds, including adapter load-fault forwarding. Tests use fake adapters/HTTP seams and do not contact a printer/database.
4. `npx next typegen`: passed. A first `npx tsc --noEmit` identified missing generated PageProps/LayoutProps plus the affected caller fixtures. After generation/caller fixes, TypeScript passed; the final rerun also exited 0 with no diagnostics.
5. `npm run lint`: zero errors, 14 warnings on the first run. One new unused fixture import was removed; 13 existing design-reference artifact warnings remain. Changed source-file ESLint passed with zero warnings/errors.
6. `npx vitest list tests/integration/package-instax-policy.test.ts tests/integration/package-outcomes.test.ts tests/integration/package-readiness.test.ts tests/integration/package-dispatch.test.ts tests/integration/package-schema-access.test.ts tests/integration/package-http-access.test.ts`: passed collection of 124 test cases; no hooks/mutations run. This is discovery only, not SQL verification.
7. Changed TS/TSX/MJS/Markdown/YAML were formatted with the installed Prettier. `git diff --check` passed. Final changed-file Prettier check passed, and final `git diff --check` passed.

## Self-review and remaining proof

Reviewed every old mode-switch caller, observation/readiness serializer, journal shape, simulator ready emitter, current RPC strict validator, fixture pin/default/cleanup path and database permission boundary. Newly created private helpers/triggers explicitly revoke execute from public/anon/authenticated/service_role; no policy table grants were added. Current SQL functions retain their existing rights. Every new-work SQL check runs under the existing guard after receipt recovery. No image bytes/raw device metadata were added to HTTP, database or journals.

Self-review corrected the initially selected renamed Start Session body to the latest grant-attributed implementation, retained reconnect hardware evidence, allowed disconnected null-evidence setup without authorizing Start, preserved pre-write safety, and made terminal contradictions hold physical safety. Subsequent independent review is still required; no database execution validates these conclusions yet.

**Blocked:** migration application (`npx supabase migration up --local` only after verified named empty stack), direct SQL policy/receipt/concurrency outcomes, affected readiness/dispatch/schema-access/HTTP-access integration runs and running-browser journeys/viewports. Fixture discovery cannot verify a safe usable local stack while Docker returns EOF, so no browser flow or actual database migration was attempted. Do not use owner Events or enable a policy to bypass this blocker. Full suite/build/database lint belong to final integrated verification once the stack is available; they are not claimed here.

The local Playwright CLI skill was read. The required real flow browser checks depend on the unavailable local stack. Guest screenshots/tracing/video remain off. Existing accepted physical evidence remains accepted within its recorded scope; no new physical/iPad qualification is claimed.

Next.js feedback reporting pass: no newly verified qualifying Next.js issue was retained. Missing generated route helper types were resolved by the documented `next typegen`; no feedback command was required.

## Review fix round 1 — base fc03911

Read `task-1-review.md` in full and checked both Important findings against the current Observe/Resolve Attempt bodies. Applied the receiving-code-review skill alongside the existing TDD/Ponytail full workflow. Both findings were valid; no product decision changed.

1. Physical `definitely_not_sent` now retains Pending and audits a discrepancy when a dispatched attempt is already Pending or has recorded unknown/connection/readiness-fault evidence, even without `accepted_at`. The existing accepted-command guard remains shared; the added restriction applies only to the physical pin. A clean Dispatching pre-write non-send still becomes NotPrinted while preserving prior safety, including a false prior flag. Server-proven Reserved cancellation and simulator behavior remain unchanged.
2. A conflicting terminal Admin inspection now explicitly invalidates physical old-job safety, independently of whether the discrepancy blocker was already present. Printed/NotPrinted accounting stays immutable. Existing physical Finish and cross-Event Start guards therefore retain the block.

Added the direct privileged-RPC regressions **before** editing SQL: unknown-without-acceptance → non-send and readiness-fault-without-acceptance → non-send both retain one unresolved hold, count zero, and audit the conflict; normal Printed → ready → contradictory terminal inspection preserves one Printed, clears safety, keeps Finish Finishing, denies Complete, rejects later ready and blocks new Start even behind a synthetic historical terminal row. Existing clean pre-write cases remain in this same policy suite.

Commands and output:

- `npx vitest list tests/integration/package-instax-policy.test.ts` — exit 0, **12 policy scenarios collected**, including all three new cases. This ran before the SQL edit. Docker remains unavailable; collection does not establish a runtime red/green result. No migration, RPC, fixture mutation or physical operation was executed.
- `npm test -- tests/unit/package-printer.test.ts tests/unit/package-contract.test.ts tests/unit/package-print-dispatch.test.ts tests/unit/package-print-journal.test.ts tests/unit/booth-flow.test.ts tests/unit/booth-page.test.tsx tests/components/booth-setup.test.tsx tests/integration/package-http-contracts.test.ts` — exit 0:

  ```text
  Test Files  8 passed (8)
       Tests  277 passed (277)
    Duration  15.58s
  ```

- `npx tsc --noEmit` — exit 0, no diagnostics.
- `npx eslint tests/integration/package-instax-policy.test.ts` — exit 0, no diagnostics.
- Changed test/report Prettier checks and `git diff --check` — exit 0.

The migration is still unapplied. These changes were checked by source review, typecheck and unaffected runnable boundary/controller regressions; **neither SQL fix nor its new direct-RPC regressions has runtime verification**. The blocked database acceptance from the original report remains mandatory once the verified named local stack is usable. No browser rerun is claimed for this backend-only correction. No new Next.js feedback candidate arose.
