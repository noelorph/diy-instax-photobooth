# Task 4 report — stage readiness and reload confirmation

Status: implemented and locally verified; commit recorded below. No hosted service, old stack, reset, HTTP route, hardware or release-gate change.

## Scope and changes

- Added `private.package_readiness(event, stage, attempt)` for setup, guest, reserve, dispatch and resume. Equipment, capacity, active session, run state, grant, pending attempt, and persistent run blockers remain independent. Setup requires no run/grant. Resume checks Paused directly. Dispatch allows its own Reserved hold at zero available; it validates the own run/session/capture/printer/generation and excludes only that attempt from the unresolved blocker.
- Reused the existing owner-controlled `printer_completion_policy`: disabled blocks readiness; simulated supports the isolated nonproduction fixture. Reports never accept a client qualification assertion. Real physical qualification remains open.
- Added server-issued five-second readiness windows, bound to Event/run/device/printer/generation and Admin user/session or originating Booth grant. Expired windows are pruned on issuance. Reports reject different bindings, expired/future windows, client wall-clock fields, negative/fractional/out-of-range ages and observations predating issuance. The conservative stored observation bound is issuance time; receipt time is stored separately, so delay cannot refresh old evidence.
- Added strict Booth `report_readiness`, Admin `report_setup_readiness`, `request_reload`, and `confirm_reload` branches. Authority is checked before receipt replay; replay precedes stale-revision rejection. Whole integral JSON decimal fields are normalized before integer casts and receipt hashing. Fractional, overflow, wrong-type and unknown fields remain rejected.
- Fresh same-state heartbeats and window issuance preserve aggregate revision. Real equipment/blocker changes, recovery of expired dynamics, generation changes and reload actions increment Event revision. Reconnect invalidates dynamic checks, updates open reload generation, preserves physical loading and durable pause, and requires a later new-generation heartbeat.
- Reload request records the authenticated Admin and reason, supersedes a previous open request, and changes only loading readiness. Reliable `no_film`, `cover_open`, or `load_change` creates a scoped request. Confirmation records Admin/time/source and checks current Event revision/request/printer/generation. It never changes package capacity, outcomes, pause or finish. Simultaneous faults and old-job uncertainty remain independent.
- Added scoped setup/Booth state RPCs and Admin reload projection with counts, blockers and safe allowed actions. Public wrappers are SECURITY INVOKER and service_role-only; private entry functions recheck live authority under fixed empty search paths. Internal helpers remain revoked. Prior accounting dispatcher is retained under `package_accounting_admin_operation`, delegated only for add_packages.
- Extended contract types, strict TypeScript schemas, shared owner-seeded run/setup fixture, schema function allowlist and focused regression suites. Regenerated public database types for new RPCs and reload audit fields.

## Scoped implementation rulings from coordinator

1. Setup transport: `package_setup_read(admin_user, admin_session, event, device_hash, printer_id, generation)` private entry plus service_role-only public invoker wrapper issues a bound window. Admin `report_setup_readiness` consumes it. Existing `package_admin_read` signature remains unchanged. Task 8 exposes setup read through authenticated Event state; Task 5 start consumes the stored exact bound setup report.
2. Reconnect transport: retain one Booth action, with strict `kind: connection_changed`, old/current window, same printer, exactly next `connectionGeneration`, and `expectedRevision`. It invalidates dynamics and updates reload binding. The next read issues a new-generation window. Ordinary heartbeats require exact report/window/current-generation equality.
3. All applied changes use new CLI-generated forward migrations; applied predecessors are never edited.

## Migration history

- `20261021132628_package_readiness_operations.sql`
- `20261021133251_package_readiness_projection.sql`
- `20261021133554_package_readiness_numeric_normalization.sql`
- `20261021133701_package_readiness_freshness_revision.sql`
- `20261021134657_package_readiness_ordered_reports.sql` (review fix)

Each was created by installed `supabase migration new` and applied with `migration up --local` only against `diy-instax-package-contracts`, API 56321/database 56322. The initial operations apply had a PL/pgSQL CASE-expression syntax error; it rolled back fully, was corrected before successful application, and was not rewritten afterward. All subsequent corrections use new forward files. The review-fix migration was already applied locally when this completion pass began; it was not edited afterward.

## Red/green evidence

- Initial readiness suite: 4/4 failed as expected because `private.package_readiness` and public Booth state/operation RPCs did not exist.
- First implemented readiness run: 4/4 passed.
- Expanded suite: cross-Admin/device/generation setup bindings and exact 5-second/generation boundaries passed; reload projection assertion failed because Admin read lacked `reloadRequests`. Projection forward migration made it green.
- Initial focused gate: 56/56 across readiness/accounting/schema/contract passed.
- Raw JSON whole-decimal regression failed with PostgreSQL `22P02` on `connectionGeneration: 0.0`. Numeric forward migration made it pass and integer replay recovered the original immutable receipt.
- Expired-readiness recovery regression failed because Event revision remained 5 instead of 6. Freshness-revision forward migration made it pass; fresh heartbeat stability remains covered.
- Final command: `npm test -- tests/integration/package-readiness.test.ts tests/integration/package-accounting.test.ts tests/integration/package-schema-access.test.ts tests/unit/package-contract.test.ts` — **57 tests passed in 4 files**, 120.97 seconds (6 readiness, 4 accounting, 12 schema/access, 35 contract tests).
- Database-controlled DO blocks assert 4.99 seconds is fresh, 5.001 seconds is stale, and future freshness is rejected. Tests cover last-held-unit dispatch, denied camera live feed despite permission, delayed window, rejected future timestamp field, changed window generation, stale/replayed/leaping reconnect, heartbeat revision stability, actual blocker/recovery revision changes, simultaneous camera/printer faults, media failure ignored, booked exhaustion, confirmation before/after owner-seeded outcome settlement, unchanged pause/capacity, and wrong printer identity.

## Verification and self-review

- `npx tsc --noEmit`: passed; rerun after regenerated types.
- `npm run lint`: passed.
- Prettier checks on changed TypeScript and `git diff --check`: passed.
- `supabase db lint --local --schema public,private --level error`: no results.
- `supabase db advisors --local --level warn`: no issues.
- CLI command help inspected before migration/application/advisor/lint/type generation. Current Supabase changelog and database function security docs fetched; no relevant feature/API break affects these local SQL functions.
- Reviewed global guard → Event → run/window/reload ordering, strict numeric/key/type checks, fresh authority before replay, immutable receipts, transaction rollback on revision overflow, revoked internal execution, invoker wrappers, sanitized Booth projection, and preservation of accounting, pause, finish and existing persistent blockers.
- Supabase emits its existing multiple-GoTrueClient fixture warning; tests pass. No Next.js operation or new qualifying Next.js feedback candidate; coordinator retains earlier candidates for final project feedback pass.

## Integration requirements and limits

- Task 5 start must consume an exact reported setup window bound to its authenticated Admin/session/device/printer/generation and copy physical confirmations plus conservative timestamps into the new run. The event-wide setup projection is a convenience summary of the latest setup report, not independent start authorization for another device. Grant renewal and terminal neutral state behavior are Task 5/8 work.
- Task 6 reserve/dispatch callers must validate the supplied session/capture IDs against the current open session and selected acknowledged capture, then invoke the stage helper under the same locks. The private reserve predicate has no supplied capture argument by design and checks that the current session has acknowledged capture metadata; it cannot select the caller's capture for it.
- Test outcome ordering uses owner-seeded terminal state until Task 7 implements inspection. Task 7 should reuse the readiness predicates without requiring readiness for settlement, preserving persistent old-job/discrepancy blockers.
- HTTP handlers, lifecycle transitions, real end-to-end calls through start/reserve/dispatch, full serial suite (Task 11), production evidence gates and physical printer/iPad qualification were not checked here.

Commit: `24d57ef` — `feat: enforce stage-specific booth readiness and reload confirmation`.

## Review fix round 1

- Ordered windows now have a database issuance order and a single-use report marker. An accepted newer report makes an older window invalid; submitting the same window with another operation ID is invalid, while the original receipt still replays.
- A reliable load fault requires a stable `loadFaultId` UUID for its episode. A new ID supersedes the open reload request and increments Event revision even if the fault kind and readiness blockers are unchanged. A repeat of the same episode preserves revision. This prevents a prepared Admin confirmation from applying to a newer fault.
- Readiness decisions, window issuance and report receipt use `clock_timestamp()` after any global-lock wait, so lock delay consumes the five-second freshness budget.
- Added three integration regressions, including a controlled 5.5-second lock wait. The focused readiness suite passed **9/9**. The combined readiness/accounting/schema/contract suite passed **60/60 in four files**, 138.64 seconds. `npx tsc --noEmit`, `npm run lint`, Prettier check on the changed TypeScript files, `git diff --check`, `supabase db lint --local --schema public,private --level error`, and `supabase db advisors --local --level warn` all passed; both database checks returned no results.
- The existing fixture emits its multiple-GoTrueClient warning. No hardware, hosted service, full serial suite or HTTP routes were checked in this fix.
