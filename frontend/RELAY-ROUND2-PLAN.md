# Live Relay Round 2 plan

Presentation-only pass. Preserve existing theme tokens, Round 1 layout decisions, Round 4 Signal Cyan buttons, data, routes, and APIs.

## Files to touch

- `src/features/relay/Relay.tsx` — refine KPI content, add the shared queue column header, and tighten queue summary wording.
- `src/features/relay/RelayUi.tsx` — extract a reusable fixed-position portal menu for availability, including viewport collision handling and keyboard/focus behavior.
- `src/features/relay/TeamStrip.tsx` — standardize team cards and status/workload alignment.
- `src/features/relay/LeadCard.tsx` — align row cells with the queue header and remove the repeated owner caption.
- `src/components/shell/UserMenu.tsx` — portal the sidebar account menu and support the collapsed rail trigger.
- `src/components/shell/UserMenu.tsx`, `src/components/Avatar.tsx`, and `src/index.css` — portal the account menu, standardize the sidebar user block, and keep the shell top bar sticky while the preview banner scrolls away.
- `src/components/icons.tsx` — add only any missing semantic icon needed by the KPI tiles.
- `src/features/relay/relay.css` and the relevant shell stylesheet — implement responsive cards, shared grids, spacing, and portal/menu placement without changing theme tokens.
- `src/components/usePortalPosition.ts` and `src/components/shell/useDismiss.ts` — share fixed-position viewport-aware placement and outside-click/focus-return handling across the portal menus.
- Focused component tests — cover portal placement, dismissal/focus return, and structural card/header behavior.

## Components to extract

- A small shared fixed portal-menu positioning helper for the availability and sidebar account menus; keep each menu’s existing actions and state updates.
- Reuse the existing shared `Button`, `Avatar`, and icon components for visual consistency.

## Verification

Run the frontend test suite, lint, and production build. Check responsive CSS at the requested widths; capture screenshots and browser bounding-box comparisons only if the provided browser preview is available.
