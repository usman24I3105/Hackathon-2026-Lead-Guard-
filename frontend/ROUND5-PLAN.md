# Round 5 — Unified Enterprise Design System

## Repo audit

- The app is a React + TypeScript + Tailwind frontend with route-level pages in `src/features` and a shared authenticated shell in `src/components/AppShell.tsx`.
- Existing foundations include semantic theme variables in `src/index.css`, Signal Cyan variables, `Button`/`Input`/`Textarea`/`Select`/`Card`/`EmptyState`/`Skeleton` in `Primitives.tsx`, a basic paginated semantic `DataTable`, `Avatar`, `StatusChip`, and `PermissionDenied`.
- Routes exist for `/login`, `/signup`, `/leads`, `/recovery`, `/contacts`, `/contacts/:id`, `/companies`, `/companies/:id`, `/conversations`, `/appointments`, `/payments`, `/team`, and `/settings`. There is no forgot-password or access-request route/flow. Settings has a Security section; integrations has its own route.
- Several features already have functional mock-backed interactions. This pass must preserve those handlers, routes, permissions, and data contracts while replacing presentation primitives.
- Live Relay has recently completed layout and action-color passes. Keep its layout and tokens intact; migrate shared presentation only where a shared primitive can be substituted without changing its behavior.

## Shared component plan

1. Extend the token layer with neutral surfaces and action aliases that preserve the current dark theme and Round 4 Signal Cyan; remove page-level use of legacy purple/gradient accents as components are migrated.
2. Add shared `PageHeader`, `Notice`, `FilterBar`/portal `Combobox`, richer `DataTable`, `StatusBadge`, deterministic `Avatar`/`AvatarStack`, and compact `KpiTile` primitives.
3. Standardize buttons, icon buttons, inputs, textareas, checkboxes, switches, tabs, menus, tooltips, toast, drawer/sheet, skeleton, empty state, and chips. Reuse existing implementations where compatible; avoid parallel variants.
4. Update the app shell: persistent dismissible preview banner above the sticky top bar, consistent controls, action-colored active navigation, count badges, and responsive sidebar behavior.

## Page-by-page migration order

1. **Phase 1 — Foundations and shell:** tokens, shared primitives, table/filter patterns, shell, no-access state. Keep this phase buildable before any feature migration.
2. **Phase 2 — Authentication:** Login and Signup on the shared auth shell, without adding routes or changing submitted data.
3. **Phase 3 — Customer lists:** Lead records, Recovery queue, Contacts. Establish the common header/filter/table/status/avatar patterns.
4. **Phase 4 — Profiles:** Contact detail, Companies, Company profile. Apply full-width profile layouts, activity/timeline and shared compact cards.
5. **Phase 5 — Communication and money:** Conversations, Appointments, Payments. Keep integrations and permission behavior unchanged.
6. **Phase 6 — Operations and settings:** Team & availability and Workspace settings, including responsive settings navigation and accessible control states.
7. **Phase 7 — Consistency pass:** remaining shared-component adoption in Live Relay, responsive/accessibility checks, edge-case review, and cleanup of duplicate page styles.

## Risks and guardrails

- Some controls are intentionally disabled because the current role lacks permission or an integration is unavailable. Keep the underlying permission and integration logic unchanged; improve only the explanation and visual state.
- DataTable and FilterBar replacements touch many pages. Keep adapters/backward-compatible props during migration so intermediate phases compile and retain page behavior.
- Mock data may not represent all requested edge cases. Add robust truncation, tabular formatting, empty states, and overflow behavior without fabricating records or changing schemas.
- The route map has no forgot-password or request-access flow. Do not create either as part of a presentation-only pass.
- A repository build currently has a known unrelated TypeScript unused-variable diagnostic in `src/mock/store.ts`; do not change data/store logic to hide it. Vite build and focused UI checks can still be used to validate presentation work.
- Screenshot capture is unavailable in this workspace session. Responsive behavior can be reviewed from CSS and component structure; screenshot evidence must be reported as unavailable rather than fabricated.

## Implementation log

- **Phase 1 — shared foundation and shell:** added the shared page header, notice, filter, status badge, KPI, tooltip, switch, checkbox, selectable tabs, shared table treatment, deterministic avatars, responsive shell behavior, and the dismissible preview banner.
- **Phase 2 — authentication:** migrated Login and Sign up to the branded split shell and used the supplied LeadGuard lockup/mark assets.
- **Phases 3–6 — page migration:** migrated customer lists, profiles, recovery, conversations, appointments, payments, team availability, settings, and no-access presentation while retaining their existing mock-backed handlers and permission checks.
- **Table refinement after visual review:** added fixed column layouts and consistent footer spacing for the Company profile opportunities table, Recovery queue, Appointments, Payments, and Team & availability. Payments KPI cards now use three equal columns. Appointment date/time uses a separate line for its duration chip.
- **Verification:** lint passes with existing warnings; all 103 tests pass after replacing the stale light-only contrast assertions with light/dark action, status, and focus-ring checks. The Vite build succeeds. The combined TypeScript build still reports the existing unused data parameter in src/mock/store.ts.
- **Visual evidence:** the requested responsive screenshot set was not captured in this environment. Do not treat code-level responsive review as screenshot verification.
