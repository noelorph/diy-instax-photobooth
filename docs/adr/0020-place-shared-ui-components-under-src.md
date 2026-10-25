# Place shared UI components under src

The owner directed the existing reusable component library to move from repository-root `components/` into `src/components/`, alongside the application code already under `src/`. This supersedes the location and special import-alias choices in [ADR-0018](0018-share-ui-primitives-at-repository-root.md).

Store customized shadcn/ui primitives in `src/components/ui/`, product-neutral compositions in `src/components/shared/`, and reusable page shells in `src/components/layout/`. Move the existing files rather than creating a parallel library. Feature state, validation, data access, and page-specific compositions remain in `src/features/admin/`.

Keep component exports, props, behavior, and `@/components/...` imports stable. The existing `@/*` → `./src/*` TypeScript mapping now resolves those imports, so remove the special root-components mapping. Keep the shadcn aliases `@/components` and `@/components/ui`; future additions resolve under `src/components/`. Formatting scripts cover these files through their existing `src` glob.

This keeps application code together and removes an unnecessary alias exception. It changes no product behavior, design tokens, authorization boundaries, or component responsibilities from ADR-0018. The Admin UI refresh spec (Git checkpoint `1de2272`, `docs/superpowers/specs/2026-10-15-admin-ui-refresh-design.md`) describes the current structure.
