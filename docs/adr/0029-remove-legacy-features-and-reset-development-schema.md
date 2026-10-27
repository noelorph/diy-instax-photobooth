# ADR-0029: Remove legacy features and replace the development schema

**Status:** Decision accepted by the user on 2026-10-25. The revised #10 implementation/publication plans were approved on 2026-10-25. The approved documentation was committed as `0bd7503`, then the user authorized publishing #10 and F1–F8 (#29–#36). Other #10 work may proceed with uploads unavailable under [ADR-0032](0032-build-full-f2-with-uploads-unavailable.md); #30 stays open in #10 and is completed last before #10 closure. This documentation change leaves code and databases unchanged.

**Supersedes:** The legacy-data preservation, Draft conversion, historical-reader and applied-migration retention requirements in [ADR-0025](0025-package-accounting-and-booth-recovery.md) and section 8 of its [contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md). All other package, access, privacy, recovery and physical qualification rules remain in force.

## Context

The user confirmed that the existing data is disposable development/test data and that the client has not bought the project. The abandoned features should disappear completely from maintained product code, database schema, migration history and obsolete specifications. Git history is the archive. The checkpoint before this revision is `1de2272`.

## Decision

Revise the plans now and complete removal within #10. Each F1–F7 capability removes the obsolete code it replaces, including callers, routes, actions, schemas, exports, fixtures and obsolete success tests. Features with no replacement are deleted once their shared dependencies have been separated. F8 removes remaining shared compatibility code and replaces the migration chain with a verified package-only baseline before #10 can finish.

The finished application has no editable Print Allowance, individual Additional Prints, shared Film Stock, Wasted Film refunds, in-app Test Print, terminal redaction/deletion, old Booth takeover/recovery, legacy History reader or old-Draft conversion. There is no version-1 fallback, legacy snapshot table, booking-conversion review endpoint or retained legacy RPC. Package-era History, safe never-started Draft deletion and the independent physical test reminder remain.

Existing development/test records are discarded during the later local rebuild. Do not convert Drafts, preserve old accounting totals, settle synthetic legacy runs, or build a backup/conversion/rollback framework. This is a development setup operation, never an in-app reset or a way to resolve an uncertain real print. Any real printer must be disconnected/quiescent before resetting a test environment. Normal runtime holds and uncertain attempts still follow #9's safety rules.

Keep the approved #9 contract implementations and regression coverage wherever still applicable. The accepted candidate `2f89a96` and dated verification remain factual evidence of that revision. Reproduce the required final functions, constraints, RLS, grants, fixed search paths, current-session checks after locks, transaction ordering, receipts and recovery behavior in the new baseline. Do not copy only the newest SQL file or delete migration filenames by feature: later definitions depend on earlier ones. Preserve version-2 protocol identifiers where required by the accepted contract; they do not authorize a version-1 branch.

The baseline must create only current package behavior on an empty database. It must not create old objects and later drop them. Remove the previous migration chain only in the same F8 change that supplies the complete baseline, current fixtures/types and passing fresh-install checks. Subsequent migrations are ordinary forward changes from that new baseline. The future local reset is restricted to explicitly identified disposable test projects; no hosted reset, deployment or physical release is authorized here.

Remove obsolete feature specs/plans, source prompts and superseded mockups from the current tree. Retain concise ADR supersession records, accepted #9 evidence and dated physical qualification evidence with explicit historical labels. Those records cannot become work orders. Current docs and proposed #10 issue text must agree; published issue bodies remain dated external context until separately published.

## Approaches considered

1. A separate removal project before #10 would repeat changes in the same UI, routes and database without the replacement flows ready.
2. Removal within #10, selected by the user, lets each capability replace or delete its own behavior and makes the clean baseline part of final acceptance.
3. Cleanup after #10 would require building legacy readers and conversion workflows that have no users or retained data to serve.

## Consequences and acceptance

- #9 stays accepted and closed. #10 reuses its current contracts and re-verifies them after integration/schema changes; old pass counts cannot certify the new baseline.
- F8 proves absence of legacy source/schema/RPCs, safe denial of stale requests, an empty-database install, current package creation by default, and the complete application/security/accounting suites on the final baseline.
- Historical documentation may name a removed feature to explain evidence or supersession. Maintained implementation instructions may only name it as removal work or an absence assertion.
- #17 automatic normal full-ejection/recovery qualification and #7 actual-iPad release remain separate and open. Keep required hardware calibration/proof evidence; isolated qualification tooling must use current contracts or independent transport, never legacy accounting routes.
- If the disposable-data assumption changes before execution, stop the reset and revisit this decision. The approved documentation was committed and GitHub publication was separately authorized. The original publication-stage hold is superseded by ADR-0032 for work with uploads unavailable; #30 stays open in #10 and is completed last before #10 closure. This documentation change performs no reset, code change or push.
