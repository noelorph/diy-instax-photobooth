# Cohesive Admin UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every implemented Admin route a cohesive, accessible interface with root-level reusable components and Geist typography shared with future Booth screens.

**Architecture:** Put reusable shadcn/ui primitives in root `components/ui`, product-neutral compositions in `components/shared`, and auth/Admin layouts in `components/layout`. Keep actions, validation, and route-specific form state in `src/features/admin`; bridge existing semantic theme variables into Tailwind CSS 4 utilities. Migrate one UI area at a time without changing server-action or authorization contracts.

**Tech Stack:** Next.js 16.4, React 19.3, TypeScript, Tailwind CSS 4, shadcn/ui, Lucide, Geist, React Hook Form, Vitest/Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-admin-ui-refresh-design.md`

## Global Constraints

- Read the relevant installed `node_modules/next/dist/docs/` guides before product code changes, and follow `AGENTS.md`, `PRD.md`, `ARCHITECTURE.md`, and `DESIGN_SYSTEM.md`.
- Cover `/sign-in`, `/forgot-password`, `/reset-password`, the Admin shell, `/dashboard`, `/events`, `/events/new`, `/events/[eventId]`, `/history`, `/profile`, and their implemented loading, empty, error, pending, and success states.
- Preserve Admin access, Draft Event, Profile, reset, authorization, validation, and server-action behavior. Dashboard and History remain truthful foundation pages; do not add Booth features or fabricated data.
- Use Geist Sans Variable across Admin and future Booth, the existing light/dark semantic palettes, 14/18 px secondary and 16/22 px Admin body rhythm, and larger Booth instruction/countdown roles.
- Use root `components/{ui,shared,layout}` and the specific `@/components/*` path mapping alongside the existing `@/*` to `src/*`; keep feature rules in `src/features/admin`.
- At 1024 px and above use a 240 px sidebar and content no wider than 1280 px; at 640–1023 px use a collapsible rail; at compact widths use a labeled menu with Escape focus restoration and 16 px page inset.
- Preserve visible labels, 44 CSS px touch targets, long actionable text, native select/date-time behavior, keyboard access, and valid link/button semantics; use Lucide outline icons at 16 px in dense rows and 20 px in standard controls/navigation.
- Work in the existing isolated worktree. Leave the pre-existing untracked `supabase/snippets/` untouched. Use TDD for interaction changes, sequential implementers with independent task reviews, then an independent whole-branch review and final verification. Do not push or merge.

## Review Focus

1. React Hook Form field registration (`name`, `ref`, and `onChange`) survives the shared-field migration so Draft edits still serialize and stale errors clear; Task 4 adds a regression test.
2. A reset failure or saved-but-unrevoked state stays visible and actionable while pending submissions remain blocked; Task 2 extends password-reset component tests.
3. Nested Event routes retain the selected Events destination; compact Escape returns focus and the medium rail keeps accessible names; Task 3 extends shell tests.
4. Long Event, client, and time-zone text remains readable without horizontal overflow at compact width and native 200% zoom; Task 6 adds a browser check.
5. The saved dark preference only changes authenticated pages, and Geist loads from this app's origin in both themes; Task 6 adds a browser check.

---

### Task 1: Theme bridge and reusable controls

**Files:** Create `components.json`, `components/ui/{button,input,label,native-select,badge,alert}.tsx`, `components/shared/{form-field,form-feedback,page-header,status-badge,empty-state}.tsx`, `src/lib/utils.ts`, `tests/components/admin-ui-primitives.test.tsx`; modify `package.json`, `package-lock.json`, `tsconfig.json`, `src/app/layout.tsx`, `src/styles/globals.css`.

**Interfaces:** `FormField({id,label,help?,error?,children})` takes `children: (a11y: {id: string; 'aria-invalid': boolean; 'aria-describedby'?: string}) => ReactNode` so callers spread native and React Hook Form props onto `Input`/`NativeSelect` without an intermediary swallowing handlers. Export `FormFeedback({kind: 'error'|'success'|'status', children, feedbackRef?, tabIndex?})`, `PageHeader({title,description?,action?,meta?})`, `StatusBadge({status:'Draft'})`, and `EmptyState({title,description,action?})`. Keep primitives standard shadcn exports with forwarded refs/native props.

- [ ] **Step 1: Write failing component tests** for `FormField` label/help/error associations, changing `aria-invalid` as `error` changes, `Input` forwarding `name/ref/onChange`, disabled `Button` semantics, and a styled `Link` remaining an anchor.
- [ ] **Step 2: Run `npm test -- tests/components/admin-ui-primitives.test.tsx`; expect failure because root components are absent.**
- [ ] **Step 3: Add the specific root alias to `tsconfig.json`; configure shadcn for root `components`, install only the six used primitives plus `lucide-react` and `geist`, and inspect/customize the generated files.** Use `@theme inline` aliases such as `--color-ds-canvas: var(--color-canvas)` to avoid self-referential token names; keep light/dark values in existing CSS variables. Load Geist from the installed package in the root layout, with tabular numerals where counts/times display. Retain global tokens/reset; remove broad control selectors only as owning screens migrate.
- [ ] **Step 4: Implement the shared compositions and run `npm test -- tests/components/admin-ui-primitives.test.tsx`, `npx tsc --noEmit`, and `npm run lint`; expect all to pass.**
- [ ] **Step 5: Commit Task 1 files as `feat: add Admin UI foundations`.**

### Task 2: Public auth frame and forms

**Files:** Create `components/layout/auth-frame.tsx`; modify `src/app/(auth)/layout.tsx`, `src/app/(auth)/{sign-in,forgot-password,reset-password}/page.tsx`, `src/features/admin/auth/{forms,reset-form}.tsx`, `src/styles/globals.css`; test `tests/components/{admin-auth,password-reset}.test.tsx`.

**Interfaces:** `AuthFrame({children}: {children: ReactNode})` owns the centered ≤480 px public layout and small portrait photo-frame mark. Feature forms consume Task 1 `FormField`, `FormFeedback`, `Button`, and `Input`; keep the current action signatures and reset state branches.

- [ ] **Step 1: Add failing tests** that public auth keeps visible labels and recovery links, password-reset field errors stay associated with inputs, saved-but-unrevoked and new-link-required guidance remains distinct, pending blocks duplicate submits, and success appears only after action confirmation.
- [ ] **Step 2: Run `npm test -- tests/components/admin-auth.test.tsx tests/components/password-reset.test.tsx`; expect the new assertions to fail.**
- [ ] **Step 3: Move layout into `AuthFrame` and replace native form controls/feedback with Task 1 components, preserving every current state transition and focus target.** Style the compact form with semantic tokens and remove only now-obsolete auth selectors.
- [ ] **Step 4: Run the two component files plus `tests/integration/password-reset.test.ts` and `npx tsc --noEmit`; expect pass.**
- [ ] **Step 5: Commit Task 2 files as `feat: refresh public Admin auth`.**

### Task 3: Responsive authenticated shell

**Files:** Create `components/layout/{admin-shell,admin-navigation}.tsx`; modify `src/app/(admin)/layout.tsx`, `src/features/admin/app-shell.tsx` (remove or retain a compatibility re-export), `src/styles/globals.css`; test `tests/components/admin-shell-profile.test.tsx`.

**Interfaces:** `AdminShell({children,theme}: {children: ReactNode; theme:'light'|'dark'})` reads the pathname and composes `AdminNavigation`. `AdminNavigation` owns Dashboard, Events, History, Profile links, the medium rail state, compact menu state, active route semantics, and focus restoration. Layout still calls `readAdminProfile()` before rendering.

- [ ] **Step 1: Add failing shell tests** for selected Events on `/events/new` and `/events/[eventId]`, Profile last, compact menu Escape/focus, medium rail accessible names while collapsed, and skip-link/main target.
- [ ] **Step 2: Run `npm test -- tests/components/admin-shell-profile.test.tsx`; expect new assertions to fail.**
- [ ] **Step 3: Build the 240 px wide sidebar, medium collapsible rail, and compact labeled menu with Lucide navigation icons and current semantic tokens.** Keep links as links, a visible menu label, `aria-current`, and no loss of accessible destination names. Constrain content to 1280 px.
- [ ] **Step 4: Run the shell test and `npx tsc --noEmit`; expect pass.**
- [ ] **Step 5: Commit Task 3 files as `feat: refresh responsive Admin shell`.**

### Task 4: Draft list and editor

**Files:** Modify `src/features/admin/events/{draft-list,draft-form}.tsx`, `src/styles/globals.css`; test `tests/components/draft-event-ui.test.tsx` and `tests/e2e/draft-event.spec.ts` only if a browser interaction changes.

**Interfaces:** Keep `DraftList({drafts,now})` and `DraftForm({initial?,createAction,updateAction})` unchanged. Consume Task 1 `PageHeader`, `StatusBadge`, `EmptyState`, `FormField`, `FormFeedback`, `Input`, and `Button`.

- [ ] **Step 1: Add a failing Draft regression test** that edits a registered field, sees its current error clear, and submits `FormData` with the edited field value while an unrelated error remains; assert empty/overdue labels and link semantics in the existing list tests.
- [ ] **Step 2: Run `npm test -- tests/components/draft-event-ui.test.tsx`; expect the new presentation/field assertion to fail.**
- [ ] **Step 3: Migrate the list to compact semantic rows and labeled summaries at narrow width; migrate the editor to labeled sections and two columns where space permits.** Spread `register(name)` directly onto `Input` inside `FormField`'s render prop and preserve the current `onChange` validation reconciliation, `datetime-local`/number native props, conflict/reload guidance, pending and saved feedback.
- [ ] **Step 4: Run `npm test -- tests/components/draft-event-ui.test.tsx tests/integration/draft-events-dal.test.ts tests/integration/draft-events-rls.test.ts` and `npx tsc --noEmit`; expect pass.**
- [ ] **Step 5: Commit Task 4 files as `feat: refresh Draft Event screens`.**

### Task 5: Profile, foundation pages, and loading states

**Files:** Modify `src/features/admin/profile/profile.tsx`, `src/features/admin/page-loading.tsx`, `src/app/(admin)/{dashboard,history}/page.tsx`, `src/app/(admin)/**/loading.tsx`, `src/styles/globals.css`; test `tests/components/admin-shell-profile.test.tsx` and `tests/e2e/admin-profile.spec.ts` only if a browser interaction changes.

**Interfaces:** Keep `Profile({initial,saveAction,passwordAction,signOutAction})` unchanged. Use Task 1 `PageHeader`, `FormField`, `FormFeedback`, `Input`, `NativeSelect`, `Button`, and `EmptyState`; keep `AdminPageLoading()`.

- [ ] **Step 1: Add failing Profile tests** for associated phone/theme/password errors, saved-preference feedback disappearing after an edit, pending duplicate-submit protection, and failed sign-out remaining actionable; verify Dashboard and History retain honest placeholder copy.
- [ ] **Step 2: Run `npm test -- tests/components/admin-shell-profile.test.tsx`; expect new assertions to fail.**
- [ ] **Step 3: Apply the shared page hierarchy, adjacent wide/stacked compact setting descriptions, semantic controls and feedback, and shell-consistent loading views.** Preserve Profile action calls, current error/confirmation focus behavior, and protected page copy.
- [ ] **Step 4: Run `npm test -- tests/components/admin-shell-profile.test.tsx tests/integration/admin-profile.test.ts` and `npx tsc --noEmit`; expect pass.**
- [ ] **Step 5: Commit Task 5 files as `feat: refresh Profile and Admin foundation pages`.**

### Task 6: Browser verification and visual finish

**Files:** Create `tests/e2e/admin-ui-refresh.spec.ts`; modify only visual/component files from Tasks 1–5 that the browser pass exposes; update `src/styles/globals.css` and documentation only when needed to make the implementation match the approved spec and ADRs.

**Interfaces:** No new feature API. Exercise the delivered routes and components as users see them.

- [ ] **Step 1: Add failing Playwright checks** for no horizontal overflow at compact width/native 200% zoom with long Event/client/time-zone text; theme scoping to authenticated Admin pages; self-origin Geist font request; menu keyboard behavior; and presence of Draft status/link at compact widths.
- [ ] **Step 2: Run `npm run test:e2e -- tests/e2e/admin-ui-refresh.spec.ts`; expect at least one new assertion to fail before final CSS/interaction fixes.** Use the existing local Supabase and Playwright setup documented by the test suite; do not replace a missing service with a fake success.
- [ ] **Step 3: Fix only observed issues, then inspect screenshots at compact, medium, and wide widths in light/dark Admin and ordinary public auth, including 200% zoom, long text, invalid/pending/success states.** Use semantic tokens, consistent 4 px rhythm, 44 px touch targets, and the single photo-frame cue.
- [ ] **Step 4: Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npx prettier --check components docs/superpowers/plans/2026-10-15-admin-ui-refresh.md`, `npm run format:check`, `npm run build`, and `npm run test:e2e`; expect all applicable gates to pass.** Review the diff for raw palette leakage, dead broad selectors, fake dashboard data, and unintended behavior changes.
- [ ] **Step 5: Commit Task 6 files as `test: verify cohesive Admin UI refresh`.** Request an independent whole-branch code review against the spec and design system, fix any findings with targeted RED/GREEN verification, rerun affected tests and final gates, and report evidence. Do not push or merge.
