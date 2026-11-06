# Instax Booth — new design reference

Created 5 November 2026 as a separate visual proposal. **Adopted on 6 November 2026** under [ADR-0034](../../docs/adr/0034-use-november-screen-reference-in-implementation-plan.md); the [main implementation plan](../../docs/superpowers/plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract) now owns the screen references and presentation requirements. The creation/verification record below describes the November 5 work, when no application, canonical documentation, existing design asset or GitHub issue was changed.

[Open the Figma file](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj)

| Collection                  | Frames | Open                                                                                 |
| --------------------------- | -----: | ------------------------------------------------------------------------------------ |
| Admin                       |     22 | [Dashboard](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-179)       |
| Booth                       |     30 | [Welcome](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-249)         |
| Dialogs and reference notes |     22 | [Reference cover](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-979) |

Admin includes Dashboard, Events, Draft Editor, Draft Setup, unavailable Event Media, Live Event desktop and phone management/recovery, authentication, History, Profile, and phone/iPad adaptations. Dialogs cover package addition, physical reload, inspected outcomes, pause/resume, finish/complete, cancellation/deletion, cleanup pending, stale saves, reset failures, and feedback. Two critical dialogs have actual 390 × 844 phone layouts.

Booth includes Welcome, mirrored Preview, Countdown, unmirrored Review, inactivity warning, three truthful printing stages, Printed, Bluetooth/camera/network recoveries, out of film, unavailable/pending, exhausted booked prints, Paused, Finishing, Finished, access ended, and overlapping blockers. Four landscape compositions accompany the portrait references.

The warm editorial direction uses cream, dark green ink, coral actions, Manrope, and Libre Baskerville. Artwork is original editable vector illustration. The illustrated people demonstrate mirroring/crop; they are not retained Guest photographs. Figma text, vectors, auto-layout containers, and button/input instances remain editable. These are reference screens, not a working app or a fully connected interactive prototype.

## Product authority and preservation

Read AGENTS.md, PRD.md, GLOSSARY.md, ARCHITECTURE.md, all ADRs, the package/recovery replacement contract, and qualification evidence. Earlier visual references were excluded from the November 5 creation inputs as requested; existing issue references were inspected read-only and preserved at that time. The November 6 migration subsequently updated [#30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [#34](https://github.com/noelorph/diy-instax-photobooth/issues/34), [#35](https://github.com/noelorph/diy-instax-photobooth/issues/35) and [#36](https://github.com/noelorph/diy-instax-photobooth/issues/36). See the [publication record](../../docs/github-issue-update-drafts.md#november-screen-reference-publication--2026-11-06) for that separate work.

The reference preserves package accounting, independent physical reload, unknown-print holds, no automatic resend, remote explicit Resume, Finish versus Complete, device/Admin access separation, disabled media uploads, cleanup-pending safeguards, and Guest-photo privacy. Illustrative accounting is 5 original + 1 additional package = 60 booked; 37 confirmed and 1 pending leaves 22 available.

## Research and plan verification — 2026-11-05

Public product documentation supplied interaction inspiration only; no competitor screens, artwork, or layouts were copied:

- [Simple Booth appearance](https://help.simplebooth.com/en/articles/1310875-booth-appearance-customizations): clear start instruction and visible countdown.
- [Simple Booth HALO launch](https://help.simplebooth.com/en/articles/8482291-launching-the-halo-app): distinct preparation/preflight and Guest use.
- [Snappic App Experience](https://help.snappic.com/en/articles/11421280-app-experience-settings): separate attract, photo-booth, and standby presentation.
- [Touchpix theme references](https://touchpix.com/api/cms/assets/79494053-a2c8-4488-b41c-b0ce4d5b522c.pdf): orientation-specific layouts, safe zones, and central countdowns. Its PDF text was read; the web screenshot service failed to fetch its pages.

The ui-ux-pro-max skill informed touch spacing, contrast, hierarchy, visible labels, feedback, and reduced-motion notes. Its generic marketing-page search patterns and mismatched palette recommendations were not adopted as product requirements.

The connected account reported Starter/View with team-admin role. Creating this draft and all 74 frames succeeded without an upgrade. The file uses three pages, consistent with [Starter limits](https://www.figma.com/pricing-faq/) and [draft support](https://help.figma.com/hc/en-us/articles/13838684089751-Starter-plan-overview). The [Starter MCP read quota](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/) was reached during a final repeated dialog-page audit, after creation and representative visual checks. No paid plan or AI image credits were used.

## Verification and limits — 2026-11-05

- Rendered and visually inspected representative desktop, phone, portrait Booth, printing/recovery, and desktop/mobile dialog compositions. Corrected shared text/row sizing defects, control borders, read-only identity, and misleading dialog backdrops.
- Full final Admin (22) and Booth (30) inventories passed text-bound/height checks and font-family checks. Dialogs passed a 20-frame post-polish bounds audit; two later mobile dialogs passed creation height assertions and rendered inspection. The final repeated whole-dialog-page audit was quota-limited. See [inventory](figma-inventory.json).
- Critical text contrast measured: ink/paper 13.29:1; muted/white 5.79:1; coral/white 5.92:1; success/soft 6.20:1; warning/soft 5.53:1; danger/soft 5.26:1. Input/secondary-action boundaries use the stronger muted color. This is not a full accessibility audit.
- [Apple lists 2360 × 1640 physical pixels](https://support.apple.com/en-us/122240). The reference assumes nominal 820 × 1180 portrait and 1180 × 820 landscape logical canvases at 2×, with generous internal clearance. Actual Bluefy viewport/chrome, Guided Access, camera/printer coexistence, and physical print qualification remain untested. Screen designs do not satisfy the release gate.
- No app/runtime behavior was changed, so app builds, automated product tests, and Playwright checks were not run. No physical iPad/printer trial was performed.

## Drawing sources

The JavaScript files are Figma Plugin API drawing sources, not production application modules. They use the file/page IDs for this specific review file. They are retained for review and future design edits; rerunning creation scripts adds frames. `polish.js` records the subsequent common corrections. `figma-inventory.json` records the final frame links and verification provenance. Run `node artifacts/design-reference-2026-11-05/verify.cjs` for the local source/manifest self-check.

The source files, content JSON and inventory preserve their November 5 contents, including historical proposal-only notes on the cover/research boards. Those notes describe creation status; current adoption and product authority come from ADR-0034 and the main plan above. The November 6 [PDF extraction](../../docs/references/2026-11-06-instax-booth/README.md) supplies 22 separate Admin PNGs; these drawing sources also preserve the Booth and dialog references absent from that PDF. The local self-check parses the scripts without executing Figma mutations.
