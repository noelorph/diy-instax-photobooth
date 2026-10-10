<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context layout with a root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Product requirements

Read the root `PRD.md` for the agreed product scope, behavior, and launch constraints.

### Architecture

Read the root `ARCHITECTURE.md` for the proposed system design and technical boundaries.

### Keep decisions and documentation in sync

Before modifying important documentation such as `PRD.md`, `GLOSSARY.md`, `docs/adr/`, or product specs, ask the user focused questions about the intended decision, its scope, and affected behavior. Wait for the answers before editing those files.

When work adds or changes a durable product or technical decision, document it in `docs/adr/` in the same change. If it replaces an existing decision, identify the superseded ADR and link the new decision from it so the history remains clear. Update every affected document, including `PRD.md`, `GLOSSARY.md`, the README, specs, and relevant guides, so they describe the current decision and behavior. Do not leave conflicting guidance in place.
