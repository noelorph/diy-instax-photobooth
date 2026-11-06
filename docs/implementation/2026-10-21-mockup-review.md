# Mockup review record

> **Historical record retained on 2026-11-06:** This evidence describes the former October set, superseded by the [November screen reference](../superpowers/plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract). References to “current” below mean October 21, not the new target. The original files remain in Git revision `969e27eaa9082992ed58bbacd1b8c32c4393fbf0`.

> **Dated visual-review evidence:** The results below describe the October 21 artifact set. On October 25, ADR-0029 removed the obsolete October 20 source archive from the working tree; it remains in Git checkpoint `1de2272`. The 17 current mockup images are unchanged. Earlier file counts and scope statements are not results of the current documentation review.

**21 October 2026 · static design review.** This records the mockup task separately from the earlier [documentation review](../documentation-review.md).

## User approval

On 21 October 2026, the user approved the complete 17-sheet mockup set. It is now the current approved visual reference for Admin, phone recovery and Booth Mode. The original PNGs and generation records are unchanged.

Approval is recorded in the gallery, mockup guides and README links. Product behavior, exact design tokens and hardware gates retain their existing authority. This records mockup approval only; application implementation and commit remain pending.

## Deliverables

- 17 generated PNG sheets: 11 Admin, five Booth and one paired iPad/phone recovery sheet.
- A local HTML gallery, screen/route notes, current semantic tokens, prompts and correction records.
- Gallery links in the root README, documentation map and design index.

## Visual and content review

All final PNGs were inspected directly. Targeted corrections are recorded in the archived generation-corrections record at that Git revision.

Checked the shared Admin shell, cards, typography direction, primary/secondary actions and phone adaptations. Confirmed the package examples use ten prints per package; unresolved attempts reduce availability; loading film does not add capacity. The review also checked:

- Test reminder only, without a Test Print action or quality inspection gate.
- Distinct physical reload and exceptional unknown-outcome actions on the Admin phone.
- No routine iPad sign-in for equipment faults or an Admin pause.
- Single Bluetooth reconnect action and the camera enable action.
- No automatic resend, invented print percentage or completion on mere command acknowledgement.
- No Guest photo on the completed, recovery or History screens.
- Separate Booth finish and Event completion, with retained terminal History.
- No inventory/allowance/wasted-film/redaction or terminal-delete controls.
- Recovery does not clear explicit pause, remaining blockers or an unknown attempt.

The layout follows the archived current-branch reference while applying the active Geist/teal design system. Exact values live in the current design system and copied tokens; generated text glyphs and color rendering remain approximate. Authentication/feedback sheets are collections of separate states, not simultaneous successful and failed form states.

## Validation boundaries

The PNGs were reviewed directly. The browser tool reported no available browser session, so the HTML gallery was not visually rendered in a browser during this task. Local checks passed: 68 Markdown files, 548 local links with no missing paths/anchors, and documentation JSON parsing. All 17 PNG files are present. The baseline scope check found only the new mockup directory and the three documentation entry-point updates for this task; the 20 archived reference assets/JSON remain byte-identical to development. Git whitespace checks passed, the index is empty and HEAD is unchanged.

No application tests, accessibility automation, printer trials, deployments or live Admin actions were run. This work does not prove automatic ejection feedback or the actual-iPad release gate. Use the [qualification checklist](../qualification/booth-recovery-proof-checklist.md).

## Initial mockup change scope

The existing documentation work was preserved. This task adds the mockup directory and updates three documentation entry points. Application source, configuration, migrations and tests are unchanged. Original archived reference assets remain intact. No files are staged and no commit or publication was made.
