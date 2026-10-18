# Live Relay UI polish plan

## Discovery

- The frontend is React 19 + TypeScript + Vite, styled with Tailwind utilities and page-scoped CSS in `features/relay/relay.css`.
- The shared shell is `components/AppShell.tsx` plus `components/shell/Sidebar.tsx`; theme and color tokens live in `src/index.css`.
- Icons come from the shared inline SVG `Icon` component. Relay already has reusable `Avatar`, `CountdownRing`, modal, drawer, toast, and focus/dismiss hooks.
- Relay state is read from the existing store. Existing actions include acknowledge, reassign, availability, timeline, and the sample baton demo. There is no explicit manual-escalation action in the store contract.

## Plan

### Files to touch

- `src/index.css` — extend semantic light/dark surface, text, status, spacing, radius, type, elevation, z-index, and motion tokens; keep the persisted charcoal theme and purple accent.
- `src/components/icons.tsx` — add distinct relay, list, notification, copy, menu, and source icons to the existing SVG family.
- `src/components/AppShell.tsx` — align toolbar controls, add a search shortcut hint, unread activity affordance, dismissible preview banner, compact tablet toolbar, and bottom safe-area space without changing app routes or data contracts.
- `src/components/shell/Sidebar.tsx` — add the live relay count and reuse the account menu in the sidebar footer.
- `src/components/shell/ActivityPopover.tsx`, `PreviewBanner.tsx`, and `UserMenu.tsx` — add accessible, dismissible shell interactions with safe local persistence.
- `src/components/shell/SearchBox.tsx` and `nav.ts` — expose the search shortcut and a semantic list icon for lead records.
- `src/components/CountdownRing.tsx` — center the ring, progress arc, and check in one SVG coordinate system.
- `src/features/relay/Relay.tsx`, `TeamStrip.tsx`, `LeadCard.tsx`, and `LeadTrack.tsx` — reorganize the page header, KPI strip, roster, queue tabs, lead rows, and interactions while preserving store actions.
- `src/features/relay/RelayUi.tsx` and `relayFormat.ts` — reusable status, source, priority, availability, and loading/error presentation primitives.
- `src/features/relay/relay.css` — responsive layout, state styling, focus, transitions, and reduced-motion behavior.
- `src/test/relay/relay.test.tsx` — cover queue keyboard behavior, availability menu, preview notice dismissal, lead timeline, and loading/error states.
- `artifacts/relay/` — reserved for viewport and interaction captures; not created because browser access was blocked (details below).

### Components to extract or reuse

- Reuse shared `Avatar`, `CountdownRing`, `Button`, `useDismiss`, toast, and timeline behavior where they fit.
- Add relay-only `SourceChip`, `PriorityBadge`, `AvailabilityMenu`, `RelayStatusBadge`, and loading/error states instead of expanding the global component API.
- Use the existing SVG `Icon` family at fixed 16/18/20 px sizes; replace ambiguous pulse icons with semantic list, history, and bell icons.

### Tokens

- Keep the paired themes: off-white/slate light mode and charcoal `#121212` dark mode with soft gray text, muted `#444` borders, and the existing purple/orchid accent gradient.
- Add semantic surface, text, spacing, type, radius, shadow, z-index, and motion tokens to `index.css`; page-specific components consume token references rather than literal palette values.

### Risks and boundaries

- The store has no explicit manual-escalation operation. Do not approximate it by reassigning a lead; keep escalation automatic and show the existing timeline/owner options where supported.
- Sidebar and topbar are shared with other routes, so changes will be limited to presentation and existing shell actions; other page data and behavior stay untouched.
- The floating circular widget is outside the relay components; reserve at least 88 px at the bottom of the relay content so it cannot cover the last row.
- Do not invent an escalation action. Escalation remains automatic; reassignment uses the existing store action.
- The preview browser rejected the local app URL and explicitly blocked alternate browser routes. Per that policy, do not retry through another browser, raw browser protocol, or an indirect capture tool. Screenshot artifacts are therefore deferred to a user-opened preview.

## Implementation and QA sequence

1. Browser screenshot capture was attempted before editing but blocked by the app's browser policy for the local preview.
2. Implemented the shared tokens/shell polish and Relay header, KPI strip, roster, queue, lead cards, and responsive states.
3. Added keyboard/interaction tests and Relay loading/error presentation.
4. Verified 87 tests pass; lint completes with existing warnings; a TypeScript check passes when the unrelated unused mock-store parameter is excluded. The standard build is blocked by that pre-existing warning being treated as an error. The independent Vite bundle succeeds with the existing large-chunk warning.
5. After screenshots and viewport/zoom visual review remain deferred until the preview is opened through a supported browser surface. No screenshot files were generated.

## Design direction

- Light: off-white canvas, white and cool-gray surfaces, slate text, orchid accents.
- Dark: charcoal canvas, layered charcoal surfaces, soft-gray text, muted borders, orchid accents.
- Typography: existing Inter family, with tabular figures for metrics/timers.
- Layout: the team and queue stay operational and scan-friendly; the response path is the focal Relay interaction.
- Motion: concise state feedback and transitions, with reduced-motion support.

## QA checklist

| Check | Result | Evidence |
|---|---|---|
| Queue tabs switch by click, Left/Right, Home, and End | Pass | Relay interaction tests |
| Availability menu has radio semantics and arrow-key navigation | Pass | Relay interaction tests |
| Lead timeline opens from the row and closes with Escape | Pass | Relay interaction tests |
| Preview notice dismisses and remembers that choice | Pass | Relay interaction tests |
| Loading skeleton and recoverable error state render | Pass | Relay state tests |
| Full frontend test suite | Pass | 87 tests across 10 files |
| TypeScript check excluding the pre-existing unused parameter | Pass | `npx tsc -p tsconfig.app.json --noEmit --noUnusedParameters false` |
| Production bundle | Pass with warning | Vite bundle succeeds; main JS chunk is 520.53 kB |
| Standard `npm run build` | Blocked | Existing `frontend/src/mock/store.ts:381` declares an unused `data` callback parameter; that file was already modified before this Relay task |
| Lint | Pass with existing warnings | No new Relay warnings; remaining warnings are in existing files |
| 1440/1024/768/390 screenshots and 360px/200% zoom review | Blocked | Local browser access was explicitly denied by the app policy; no alternate capture route was used |
| Hover/focus/empty/loading/error/progress screenshots | Blocked | Same browser-policy restriction |
