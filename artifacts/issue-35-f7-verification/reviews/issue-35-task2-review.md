## Spec compliance

**Issues found — Minor only.** The required History API, filters, retained package counts, all-time activity, read-only terminal routing, and fail-closed metadata behavior are implemented. Two presentation discrepancies below prevent an unqualified exact-reference compliance claim; neither blocks Task 3. Review scope: `96a51ded39eca050820173d1efaabc7098d4df06` → `51951d333929c3d5cf0c709d2b23c4bc78884e79`.

## Strengths

- `src/lib/events/history.ts:45`: preserves the defaulted `HistoryFilter` API, booking fields and success/unavailable convention. Explicit current-package, terminal-state and nondeleted predicates apply before projection. The 500-row loop avoids silent default-cap truncation; counts reuse the authoritative boundary without per-Event attempt-page reads (`:68`). Removed `getHistorySummary` has no remaining source/test callers in the focused search.
- `src/lib/events/history.ts:77`: implements the exact detail success/not_found/unavailable contract. Nonnegative bounded safe-integer pages, `created_at DESC, id DESC`, 25 rows plus lookahead, and no date-window predicate preserve stable all-time activity (`:107–128`). Only safe activity fields are projected.
- `src/lib/events/history.ts:107`: separates Capture count from confirmed ejections and reads only attached asset metadata. Query failures propagate to unavailable at `:128`; no path, bytes or signed URL enter the result. `tests/integration/admin-operations-read.test.ts:239` exercises 3+2 packages, 50 booked, 13 printed including unusable ejection, 14 Captures, legacy/deleted exclusion and tied old activity. The media test at `:373` distinguishes attached, empty and denied metadata reads.
- `src/app/(admin)/events/[eventId]/page.tsx:31`: terminal success uses the dedicated immutable view; unavailable stops before operational fallback. The existing Draft/Live operations/form path and independent attemptPage remain below the new branch. `history-detail.tsx:10` introduces no mutations, and `:116` retains unavailable media and the cleanup reminder.
- `src/app/(admin)/history/page.tsx:19`: filter handling cannot broaden the terminal query; separate pending-removal reads and the unchanged opaque cleanup component remain independent. `tests/e2e/dashboard-history.spec.ts:263` exercises real filter navigation, Completed/Cancelled URLs, cleanup retry, trusted terminal mutation denials, metadata failure, revoked access and responsive states.
- Inspected A07/A08 against `task-2-artifacts/history-list-light-1440.png` and `history-detail-light-1440.png`; hierarchy, semantic state labels, retained content and disabled media are legible. The saved `history-detail-dark-text-200.png` shows stacked summary cards, wrapped booking fields and reachable pagination/media.

## Issues

### Critical

None found.

### Important

None found.

### Minor

1. **Terminal History detail marks Events as current.** `src/app/(admin)/events/[eventId]/page.tsx:33` renders the new History view under a path that the unchanged `src/components/layout/admin-navigation.tsx:92` maps to Events via prefix matching. The saved wide detail screenshot confirms Events is selected; A08 selects History. This gives an incorrect location cue, including `aria-current`, when following a History record. Back to History is clear and all actions still work, so the impact is orientation/reference fidelity rather than a broken workflow. Align terminal-detail navigation state through the existing shell when addressing reference polish; do not indiscriminately mark every `/events/:id` as History. The controller's stated rationale does not erase this discrepancy.

2. **Empty-media copy overclaims historical usage for Cancelled Events.** `src/features/admin/events/history-detail.tsx:120` uses “The default Booth presentation was used” whenever `mediaAssetCount === 0`, for both Completed and Cancelled records. A successful empty metadata read proves no attached media; it does not prove any Booth presentation ran. The Cancelled fixture has no run, so it demonstrates the unsupported claim. Keep “No Event Media attached.” or qualify the past-use statement only with sufficient retained evidence. A08's example is Completed and is not proof for every terminal state. This does not weaken authorization or the empty/error distinction.

## Cannot verify from this task gate

- Actual HTTP private/no-store headers and the complete deployed RLS/session policies are unchanged and not established by this diff. The focused `requireAdmin` check confirms the existing live-profile/session boundary is called; supplied revoked-access browser and read assertions support its use. Task 3/final integration should retain existing cache/security verification.
- Draft/Live source routing and attempt-page forwarding are preserved, and the supplied component run includes Live behavior. Full real-browser Draft editing and Live print-attempt regression are not demonstrated by the new History journey; retain existing integrated coverage for Task 3.
- The report records 24 focused tests passing, one final History browser journey passing, TypeScript/changed-file lint/format checks passing, and cleanup restoration. I did not rerun them. The supplied artifacts are 19 PNGs, not raw command logs, so execution results and database cleanup status remain attributed to the implementer's report. No warning was reported in the final runs; raw-output cleanliness was not independently established.

## Scope checks and declined judgments

- Read the supplied diff once; the tool truncated its middle, so retrieved only the omitted diff sections. Read the remainder of EventPage because its hunk cut off the fallback function. No source edits, git commands, DB commands or browser commands were run.
- Named risk: privileged package-count reads might bypass current-session authorization. Checked `require-admin.ts` and `package-state.ts`: the first enforces live Admin profile/session checks and the second forwards user/session IDs to the existing package RPC. Did not reopen the accepted SQL implementation.
- Named risk: removed summary export could leave broken consumers. Focused source/test caller search found none. Named risk: not_found fallthrough could expose legacy terminal records. Checked the existing `getOperationalEvent` query; it also excludes legacy/deleted Events.
- Named risk: reported terminal navigation mismatch. Checked the shell/navigation pathname mapping and actual saved screenshot against A08; recorded the Minor finding above.
- Declined to judge enabled media delivery/renewal/playback and supported cleanup qualification: intentionally deferred #30 work, with no enabled-media claim in this diff. Declined fresh-schema, physical printer, actual-iPad, deployment and whole-branch acceptance: outside Task 2 and unsupported by this gate. Did not grade unchanged shell branding or require pixel-identical specimen spacing.

## Assessment

**Task quality: Approved, with two Minor follow-ups.** The implementation is small relative to its required behavior, keeps trusted boundaries and existing consumers, and adds meaningful read/component/browser assertions. No Critical or Important defect warrants blocking Task 3.

Skipped rerunning passing tests and broad branch/hardware validation; this task gate does not close #30/#17/#7/#10 or establish final F7 acceptance.
