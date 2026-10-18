# Live Relay Round 4 plan

- Shared Button: `frontend/src/components/Primitives.tsx`. Add primary, secondary, ghost, and danger variants; sm/md/lg sizing; icon-only, loading, and success presentation states.
- Theme tokens: `frontend/src/index.css`. Add the light and dark Signal Cyan action tokens, foregrounds, focus-ring colors, and subtle primary hover shadows. Check label and ring contrast against both theme surfaces.
- Relay accents and usage: update `Relay.tsx`, `LeadCard.tsx`, `RelayUi.tsx`, `relay.css`, and the Relay navigation style in `Sidebar.tsx`. Use action tokens for selected controls, focus, links, and row outlines; keep green/amber/red status semantics and existing layout intact.
- Scope: presentation only; retain the current data and action behavior, with acknowledgement feedback and tab presentation handled in the existing flow. No backend work.
- Verification: inspect the affected components and styles, run the project checks, and capture light/dark interaction states if the available preview supports them.
