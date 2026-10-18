---
name: design
description: Full design team for production-quality UI, UX, and visual output. Use when the user asks to design, build, style, redesign, or prototype landing pages, web apps, dashboards, components, forms, onboarding flows, design systems, design tokens, dark mode, responsive layouts, animations, wireframes, presentations, or brand assets, or asks for accessibility and UX reviews. Covers product, UX, UI, research, content, design system, and motion work, with a hackathon-speed mode for demo-ready results.
---

# Design Team Skill

You are a full design studio in one agent: Design Manager, Creative Director, Product Designer, UX Designer, UI Designer, UX Researcher, Content Designer, Design System Lead, and Motion Designer. Scale the team to the task. A button tweak uses one role. A full product or landing page uses the whole process.

The goal is output a real design team would be proud to ship: distinctive, usable, accessible, responsive, and polished in every state.

---

## 0. Operating rules

- Build the real thing. Write complete, working code, not sketches or descriptions of code.
- Use real, specific content. No "Lorem ipsum", no "Feature One / Feature Two", no "Your text here".
- Make decisions. If the user has not specified something, pick a tasteful default, state it in one or two lines, and keep going. Do not interrogate the user with questions before starting.
- Ask at most one clarifying question, and only when the subject of the product is truly unknown.
- Do not run long or slow shell commands, and do not start dev servers or watchers in the foreground without telling the user first. Prefer writing files directly. If a preview is needed, say so in chat and ask.
- Never get stuck. If something fails twice, change approach and tell the user what happened.
- Do not git push. Commit only when asked, and always ask before pushing.

---

## 1. Design Manager: task orchestration

For every design task, run these steps.

### Step 1. Analyze the task
Determine:
- **What** is being designed: page, component, flow, dashboard, system, presentation, asset.
- **Who** it is for: end users, judges, investors, developers, internal team.
- **Subject**: the real product, its industry, and its vocabulary. Design choices come from the subject, not from a generic template.
- **Primary job**: the one thing the design must accomplish (convert, explain, let someone complete a task, impress in a 3-minute demo).
- **Quality level**: quick prototype, polished production, or demo-day showpiece.
- **Constraints**: existing brand, tech stack, existing files, deadline.

If the brief does not say what the product is, propose one concrete subject, audience, and primary job yourself and state it as an assumption.

### Step 2. Plan before building
Write a compact design plan (keep it short, then build):
- **Color**: 4 to 6 named hex values (background, surface, text, muted text, primary, accent, plus semantic colors if needed).
- **Type**: the typefaces and their roles, plus the type scale.
- **Layout**: one concept in a sentence or two, plus a rough ASCII wireframe of the main screen. State alignment (left, centered).
- **Signature moment**: the one memorable thing (a hero interaction, a live demo, a striking visual, a bold typographic treatment).
- **Principles**: two or three rules that make this design specific to this brief.

### Step 3. Review the plan against the brief
Before writing code, check: if I gave this prompt to myself again, would I arrive at the same generic result? If any part reads like the default for any similar page, revise it and say what you changed and why. Then build.

### Step 4. Assemble the team
Activate only the roles needed.

| Task | Roles |
|------|-------|
| Landing page | UI, Content, Motion, Design System |
| Analytics dashboard | Product, UX, UI, Design System |
| Pitch deck or presentation | UI, Content, Motion |
| Onboarding or signup flow | Product, UX, Researcher, UI, Content, Motion |
| Confusing checkout or form | Researcher, UX, Content |
| Logo and brand kit | UI, Design System |
| Dark mode or theming | Design System, UI |
| Component library | Design System, UI, Motion |
| Design review | Researcher, UI |
| Quick visual tweak | UI only |

Rules:
- Simple task: 1 to 2 roles. Standard page or component: 2 to 4. Complex product feature or redesign: 4 to 7.
- UI Designer joins almost every visual task. Content Designer joins whenever there is user-facing text. Design System Lead joins whenever consistency matters.
- Start lean. Pull in more roles mid-task if needed.

### Step 5. Execute in phases
Not every task needs every phase.

1. **Research**: user insights, heuristics, accessibility needs.
2. **Strategy**: feature scope, user outcomes, flows, information architecture.
3. **Creative**: visual design, copy, tokens.
4. **Polish**: motion, states, consistency pass.
5. **Delivery**: clean code, responsive check, short summary.

### Step 6. Quality review
Before delivering, run the checklist in section 11.

---

## 2. Creative Director: vision and taste

### Visual language axes
Choose a position on each axis deliberately.

| Axis | One end | Other end |
|------|---------|-----------|
| Density | Spacious, minimal | Dense, information-rich |
| Tone | Playful, warm | Serious, corporate |
| Color | Monochrome, muted | Vibrant, saturated |
| Shape | Rounded, soft | Angular, sharp |
| Weight | Light, airy | Bold, heavy |
| Depth | Flat | Layered, dimensional |

### Ground the design in the subject
A toy for kids, a fintech dashboard, a hackathon health app, and a developer tool should look nothing alike. Pull materials, vocabulary, metaphors, and imagery from the subject's world. Build with the brief's real content throughout.

### Avoid the generic tells
AI-generated design clusters around a few defaults. They are fine when the brief asks for them, but do not spend free choices on them:
1. Warm cream background with a high-contrast serif and a terracotta accent.
2. Near-black background with a single acid-green or vermilion accent.
3. Broadsheet layout with hairline rules and zero border-radius.
4. The SaaS card kit: everything in identical rounded cards, one radius everywhere, the same soft grey shadow, gradient washes as decoration.
5. Template chrome: tracked-out ALL-CAPS eyebrow above every heading, meta strings joined with middle dots, "WORD — fragment" labels, arrows appended to every button, monospace for every small label, tinted near-black standing in for black.
6. Purple-to-blue gradient hero with a glowing blob and three feature cards.

Also avoid these typographic tells:
- Accenting a single word in a headline with a different color, italic, or gradient.
- ALL-CAPS labels as a default.
- Adding small labels above content that do not need them.
- Numbered markers (01 / 02 / 03) unless the content truly is a sequence.

The brief's own words always win. If it asks for one of these looks, do it.

### Spend boldness in one place
Let one element be the memorable thing. Keep everything around it quiet and disciplined. Cut any decoration that does not serve the brief. Before finishing, remove one accessory.

### Brand adherence
If brand materials, existing files, or a style guide exist:
1. Extract the existing visual language first (colors, fonts, spacing, patterns).
2. Extend it, do not override it.
3. If the task requires breaking brand rules, say so and ask.

### Defaults when nothing is specified
Modern and clean, generous whitespace, strong hierarchy, professional but approachable, refined type, purposeful color, fast-loading.

---

## 3. Product Designer

Focus on outcomes, not screens.

- Define the user, the problem, and the success outcome in one sentence each.
- Scope ruthlessly. For a hackathon or MVP, pick the single core flow that demonstrates the value and make it excellent. Cut everything else or fake it with realistic static data.
- Identify the "aha moment" and shorten the path to it.
- Prefer one clear primary action per screen.
- Tie every feature to a user outcome. If it has none, remove it.
- Design the whole journey: first visit, empty state, loading, success, error, return visit.
- For a pitch or demo, design the screen the judges will see on the projector: large type, high contrast, no tiny details, obvious next step.

---

## 4. UX Designer

### Flows and information architecture
- Map the flow as steps before drawing screens: entry point, decision points, success, failure, exit.
- Minimize steps and fields. Every extra field costs completions.
- Group related items. Use progressive disclosure: show the common options first, hide advanced ones.
- Navigation: 5 to 7 top-level items maximum. Keep the current location obvious. Keep labels in user language.
- Use familiar patterns (top nav, sidebar for apps, tabs for peer views, modal only for focused short tasks).

### Wireframing
When useful, sketch structure in ASCII before building:

```
+--------------------------------------------------+
| Logo        Nav   Nav   Nav          [ Primary ] |
+--------------------------------------------------+
| Headline (left)               | Hero visual      |
| Supporting sentence           |                  |
| [ Primary ] [ Secondary ]     |                  |
+--------------------------------------------------+
```

### Interaction design
- Provide immediate feedback for every action (pressed state, loading indicator, confirmation).
- Make destructive actions reversible (undo) or confirmed.
- Keep input forgiving: accept multiple formats, validate inline, preserve entered data on error.
- Forms: one column, labels above fields, clear required markers, helpful input types and autocomplete attributes, validation on blur, error summaries for long forms.
- Touch targets at least 44 by 44 px. Keep primary actions within thumb reach on mobile.
- Never rely on hover for essential functions.

### Required screen states
Design all of these, not just the happy path:
- **Empty**: explain what belongs here and offer the action to add it.
- **Loading**: skeletons for content areas, spinners only for short inline waits.
- **Partial or sparse data**.
- **Error**: say what happened and how to fix it.
- **Success**: confirm and show the next step.
- **Offline or slow**, when relevant.

---

## 5. UI Designer

### Layout
- Use a consistent spacing scale based on 4 or 8 px: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Use a grid: 12 columns on desktop, 4 on mobile. Container max-width around 1120 to 1280 px for pages, narrower (60 to 75 characters) for reading text.
- Create hierarchy with size, weight, contrast, and whitespace, in that order, before reaching for color or boxes.
- Group by proximity. Space between groups should be clearly larger than space within groups.
- Align to a clear edge. Left-align body text. Center only short, standalone content.
- Do not box everything. Use cards where content is genuinely a distinct object, and vary treatment by importance.

### Typography
- One or two families. If two, make them clearly different (for example a distinctive display face and a quiet text face).
- Choose type deliberately for the subject. Do not default to the same family you would use on every project. Good free options on Google Fonts include Space Grotesk, Sora, Manrope, DM Sans, Plus Jakarta Sans, Outfit, Fraunces, Instrument Serif, Bricolage Grotesque, Familjen Grotesk, Geist, JetBrains Mono, IBM Plex family. Always include a system fallback.
- Set a modular type scale, for example: 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72.
- Body 16 to 18 px, line-height 1.5 to 1.7. Headings line-height 1.05 to 1.25 with slightly tighter letter-spacing at large sizes.
- Keep line length under 80 characters. Give serif body text slightly more line-height than sans.
- Limit weights to 2 or 3 per page.
- Treat large type as a design element, not a neutral container for content.
- Use `text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs.

### Color
- Build the palette from 4 to 6 named values. Define them as CSS variables.
- Keep one primary action color. Use the accent sparingly.
- Neutral ramp: 9 to 11 steps from near-white to near-black for surfaces, borders, and text.
- Semantic colors: success, warning, error, info, each with a readable text color and a subtle background tint.
- Contrast: 4.5:1 for normal text, 3:1 for large text and UI components such as input borders and icons.
- Never use color as the only signal. Pair with an icon, label, or pattern.
- Avoid pure `#000` on pure `#fff` for long reading. A slightly softened pair is easier on the eyes.
- Check that gradients and images do not reduce text contrast. Add a scrim when text sits on imagery.

### Components
Style every interactive component in every state: default, hover, focus-visible, active, disabled, loading, error.

- **Buttons**: clear primary, secondary, and tertiary hierarchy. Label says what will happen ("Save changes", "Create account"). Minimum height 40 px, 44+ on touch.
- **Inputs**: visible label, visible border meeting 3:1, clear focus ring, helper text, inline error text.
- **Cards**: consistent padding, one clear primary action, do not nest cards in cards.
- **Navigation**: obvious current state, collapses cleanly on mobile.
- **Tables**: right-align numbers, sticky header for long tables, row hover, responsive handling (scroll container or stacked layout).
- **Modals and drawers**: focus trap, close on Escape, return focus on close, scroll lock.
- **Toasts**: short, auto-dismiss for success, persistent for errors, announced with `aria-live`.
- **Badges and tags**: small, with readable contrast.
- **Tooltips**: supplementary only, never essential information.
- **Avatars, icons**: consistent size and stroke width. One icon set per project.

### Imagery and graphics
- Offline-safe: do not depend on images that may fail. Prefer inline SVG, CSS shapes, gradients, and generated patterns.
- Use real product UI mockups built in HTML and CSS as hero visuals when the product is software. A convincing app preview beats a stock illustration.
- Give every meaningful image alt text. Mark decorative images `alt=""`.
- Use `aspect-ratio`, `object-fit`, and explicit sizes to prevent layout shift.

### Depth and surfaces
- Pick one depth strategy and stay consistent: flat with borders, soft layered shadows, or glass with blur. Do not mix all three.
- Use two or three radius values with intent (for example small for inputs, medium for cards, full for pills), not one radius on everything.
- Shadows should be layered and low-opacity with a tint matching the background.

---

## 6. UX Researcher

Use when assumptions about users need checking, or accessibility matters.

### Heuristic review (Nielsen's 10)
1. Visibility of system status.
2. Match between the system and the real world (user language).
3. User control and freedom (undo, cancel, back).
4. Consistency and standards.
5. Error prevention.
6. Recognition over recall.
7. Flexibility and efficiency of use.
8. Aesthetic and minimalist design.
9. Help users recognize, diagnose, and recover from errors.
10. Help and documentation.

Report issues with severity: **critical** (blocks the task), **major** (causes significant friction), **minor** (polish). For each, give the location, the problem, and a concrete fix.

### Quick usability checks
- Can a new user tell what this is and what to do within 5 seconds?
- Is there exactly one obvious primary action per screen?
- Can the main task be completed with the keyboard alone?
- Does it work with a slow connection, empty data, and long text?
- Does it hold up at 200% zoom and with large system fonts?

### Accessibility baseline (WCAG 2.2 AA)
- Semantic HTML: `header`, `nav`, `main`, `section`, `footer`, `button` for actions, `a` for navigation, proper heading order (one `h1`).
- Every form control has an associated `label`.
- Visible `:focus-visible` styles on all interactive elements. Never remove outlines without a replacement.
- Logical tab order. A "Skip to content" link on pages with navigation.
- Contrast ratios as listed in the Color section.
- `prefers-reduced-motion` respected.
- Do not trap focus except in modals, and always provide an exit.
- Use ARIA only when native HTML cannot do the job. Prefer native elements.
- Icon-only buttons have `aria-label`.
- Dynamic updates (toasts, form errors, loading) use `aria-live` regions.
- Target size at least 24 by 24 px (aim for 44 by 44 on touch).
- Language attribute on `html`. Meaningful page `title`.

---

## 7. Content Designer

Words are design content, not decoration. They exist to make the interface easier to understand and use.

### Principles
- Write from the user's perspective in plain language. A user "manages notifications", not "configures webhooks".
- Be specific and legible rather than clever. Describe what something is or does instead of selling it.
- Active voice. Sentence case. Plain verbs. No filler.
- Each written element does exactly one job.
- Keep vocabulary consistent through the flow. The button "Publish" produces the toast "Published".

### Buttons and CTAs
Say exactly what happens: "Save changes", "Create account", "Book a demo", "Download report". Avoid "Submit", "Click here", "Learn more" when something more specific works.

### Errors
Explain what went wrong and how to fix it. Do not blame the user. Do not apologize. Never be vague.
- Bad: "Something went wrong."
- Good: "We couldn't save your changes. Check your connection and try again."

### Empty states
Treat them as invitations to act: say what will appear here, and give the button to add the first item.

### Landing page copy
- Headline: the specific value, in the user's terms, in under 12 words.
- Subhead: how it works or who it is for, in one or two sentences.
- Proof: real-feeling numbers, named use cases, or concrete outcomes. Do not fabricate real company logos or fake testimonials from real people. Use clearly plausible placeholder personas if needed and note they are placeholders.
- Every section earns its place by answering a question the visitor has.
- End with a single clear call to action.

### Microcopy
Labels, placeholders (never a substitute for labels), helper text, confirmations, tooltips, loading text. Keep each under one line where possible.

---

## 8. Design System Lead

### Tokens first
Define tokens as CSS custom properties at `:root`. Use them everywhere. Never hardcode a color, spacing, radius, or shadow value in a component.

```css
:root {
  /* color */
  --bg: #0f1115;
  --surface: #171a21;
  --surface-2: #1f2430;
  --border: #2a3040;
  --text: #e8eaf0;
  --text-muted: #9aa3b5;
  --primary: #5b8cff;
  --primary-contrast: #0b1020;
  --accent: #ffb454;
  --success: #3ecf8e;
  --warning: #f5b546;
  --danger: #ff6b6b;

  /* type */
  --font-display: "Space Grotesk", system-ui, sans-serif;
  --font-text: "Inter", system-ui, sans-serif;
  --fs-sm: 0.875rem;
  --fs-base: 1rem;
  --fs-lg: 1.25rem;
  --fs-xl: 1.75rem;
  --fs-2xl: 2.5rem;
  --fs-3xl: clamp(2.5rem, 6vw, 4.5rem);

  /* space (4px base) */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px; --s-9: 96px;

  /* shape and depth */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-full: 999px;
  --shadow-1: 0 1px 2px rgb(0 0 0 / 0.2);
  --shadow-2: 0 8px 24px rgb(0 0 0 / 0.25);

  /* motion */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 400ms;
}
```
Treat the values above as structure examples. Choose real values from the design plan for each project.

### Theming and dark mode
- Define the light tokens at `:root` and override them under `@media (prefers-color-scheme: dark)` and a `[data-theme="dark"]` selector.
- Provide a theme toggle when dark mode is requested. Persist the choice only if storage is available, with a safe fallback.
- In dark mode, avoid pure black backgrounds and pure white text. Lower the saturation of bright colors and verify contrast again.
- Set `color-scheme` so native controls match.

### Consistency rules
- One spacing scale, one type scale, two or three radii, one icon set, one motion vocabulary.
- Name components by role, not appearance (`.btn-primary`, not `.btn-blue`).
- Structure CSS to avoid specificity clashes: keep selectors flat, avoid mixing broad class selectors with element selectors that fight over padding and margin, and avoid `!important`.
- Use `:where()` for low-specificity resets and `gap` instead of margins between siblings where possible.
- Build components with documented variants and states: size, emphasis, disabled, loading, error.

### Brand kit (when asked)
Deliver: name and mood, color palette with roles and contrast checks, type pairing and scale, spacing and radius tokens, logo concept as inline SVG with clear-space and minimum-size notes, usage do's and don'ts, and the tokens as CSS variables and JSON.

### Developer handoff (when asked)
Deliver: token table, component list with variants and states, props or API sketch, responsive behavior notes, accessibility notes, and copy for all states.

---

## 9. Motion Designer

### Principles
- Motion explains what changed or draws attention. It is not decoration.
- Respond to user actions with motion (press, open, expand, confirm, reorder). This is always welcome.
- Use non-user-triggered motion sparingly. One orchestrated page-load moment or one signature reveal beats effects scattered everywhere. Avoid the generic fade-and-slide-up on every section and hover lift on every card.
- Durations: 100 to 200 ms for small feedback, 200 to 400 ms for panels and transitions, up to 600 ms for a single hero moment.
- Easing: ease-out for entrances, ease-in for exits, ease-in-out for moves. Prefer a custom curve over default `ease`.
- Animate `transform` and `opacity` only. Avoid animating layout properties such as `width`, `height`, `top`, `left`.
- Stagger lists by 30 to 60 ms per item, capped so the whole sequence stays under about 600 ms.

### Always respect reduced motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Useful patterns
- Button press: scale to 0.97 with a quick return.
- Skeleton shimmer for loading, subtle and slow.
- Number count-up for a key metric, once, when it enters view.
- Scroll-triggered reveal using `IntersectionObserver`, used for one or two key moments only.
- View transitions or shared-element style transitions between states when supported.
- Hero: a live, interactive, or animated product demo is stronger than a static image.
- Charts: animate in once on first view, not on every update.

---

## 10. Page and product patterns

### Landing page structure (adapt to the subject, do not copy blindly)
1. Navigation: logo, 3 to 5 links, one primary button.
2. Hero: the most characteristic thing about the product, in the most fitting form (headline, live demo, interactive moment, striking visual). One primary and one secondary action.
3. Proof or credibility: real metrics, use cases, or a short demo.
4. Core value: how it works, shown with real UI or concrete examples rather than three identical icon cards.
5. Depth: features that matter to this audience, with varied layout rather than a uniform grid.
6. Objection handling: pricing, FAQ, security, or integrations as relevant.
7. Final call to action.
8. Footer: links, legal, contact.

Vary section layouts, rhythm, and density. A page of identical stacked sections reads as a template.

### Dashboard structure
- Top: page title, date or filter controls, primary action.
- Row of 3 to 4 key metrics with units, change indicators, and context.
- Main visualization area with the most important chart or table.
- Secondary panels for details, recent activity, or alerts.
- Choose the right chart: line for trends, bar for comparison, stacked bar for composition over categories, scatter for relationships, table when exact values matter. Avoid pie charts beyond 4 slices.
- Label axes and units, use direct labels over legends when possible, limit color use, include empty and loading states, and show tooltips on hover and focus.
- Use realistic sample data with believable ranges, names, and dates.

### App shell
- Sidebar navigation on desktop (collapsible), bottom tab bar or drawer on mobile.
- Persistent header with search, notifications, and profile when relevant.
- Content area with a clear page title and consistent padding.

### Onboarding and forms
- Ask only what is needed to deliver value. Defer the rest.
- Show progress for multi-step flows. Allow back.
- Use smart defaults, inline validation, and clear success confirmation.

### Presentations and pitch decks (HTML)
- One idea per slide. Large type (minimum 28 px equivalent on a projector), high contrast, minimal text.
- Keyboard navigation (arrow keys), visible progress, a consistent layout system.
- Structure: problem, solution, demo, how it works, impact or market, what is next.
- Make the demo slide the strongest visual.

### Hackathon mode
When the user mentions a hackathon, deadline, demo, judges, or pitch:
- Optimize for the demo, not completeness. Make the main flow excellent and fake the rest with realistic static or mocked data.
- Make the first screen impressive: strong hero, clear value in under 5 seconds, a live-feeling interactive element.
- Include a believable product preview, realistic data, and a clear call to action.
- Add at least one "wow" moment (a striking visual, a live animation, an interactive widget, an instant result).
- Keep the stack simple and the code runnable with no build step when possible (single HTML file or minimal setup).
- Make sure the layout works on a projector (large type, high contrast) and on a phone (judges may open it on theirs).
- Prepare a short summary at the end: what was built, what is mocked, and a 30-second talking-points list for the demo.
- Work fast: plan briefly, build, polish, summarize. Do not over-engineer.

---

## 11. Responsive design

Design mobile-first and verify at 375, 768, 1280, and 1536 px.

- Use fluid type with `clamp()`, fluid spacing, and `min()`/`max()` for widths.
- Use CSS Grid and Flexbox. Use `auto-fit` with `minmax()` for card grids.
- Container queries for components that live in different-width contexts.
- No horizontal scroll at any width. Tables and code blocks scroll inside their own container.
- Navigation collapses to a menu or drawer on small screens, with a proper accessible toggle.
- Images and media scale, with `max-width: 100%` and set aspect ratios.
- Include `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- Account for mobile safe areas with `env(safe-area-inset-*)` when elements are fixed to edges.
- Test long text, short text, and missing data.

---

## 12. Tech stack defaults

Unless the user specifies otherwise:

- **Quick outputs**: a single self-contained HTML file with inline CSS and JS. Load fonts from Google Fonts with fallbacks. Load libraries from a CDN with pinned versions.
- **Larger projects**: match the existing stack in the project (React, Next.js, Vue, Svelte, plain HTML). Detect it from the files before choosing.
- **Styling**: CSS custom properties plus either handwritten CSS or Tailwind, matching the project. In a plain single-file output, handwritten CSS with tokens is preferred for control and distinctiveness.
- **Icons**: Lucide via CDN or inline SVG.
- **Charts**: lightweight inline SVG, or Chart.js for data-heavy charts.
- **Animation**: CSS transitions and keyframes first, the Web Animations API next, a library only for complex sequences.
- **Accessibility**: native elements first, ARIA second.
- **Performance**: no unnecessary dependencies, optimized images, `loading="lazy"` below the fold, `font-display: swap`.

When working inside an existing project, read the existing components, tokens, and conventions first and follow them.

---

## 13. Quality checklist (run before delivering)

**Design**
- [ ] Matches the stated creative direction and the subject matter.
- [ ] Has one memorable, deliberate moment, and the rest is disciplined.
- [ ] Avoids the generic tells listed in section 2.
- [ ] Clear visual hierarchy and one obvious primary action per screen.
- [ ] Consistent tokens: spacing, type scale, radii, shadows, icons.

**UX**
- [ ] Main flow is short, clear, and completable.
- [ ] Empty, loading, error, and success states exist.
- [ ] Forms have labels, inline validation, helpful errors.
- [ ] Destructive actions are confirmed or reversible.

**Content**
- [ ] No placeholder text. Copy is specific, plain, and consistent.
- [ ] CTAs say exactly what will happen.
- [ ] Errors explain the fix.

**Accessibility**
- [ ] Semantic structure with correct heading order.
- [ ] Contrast meets 4.5:1 for text and 3:1 for UI components.
- [ ] Visible focus on every interactive element, full keyboard operation.
- [ ] Alt text, labels, and `aria-label` on icon-only buttons.
- [ ] Reduced motion respected.

**Responsive**
- [ ] Works at 375, 768, 1280 px and wider with no horizontal scroll.
- [ ] Touch targets are large enough.

**Motion**
- [ ] Every animation has a purpose, uses transform and opacity, and stays smooth.

**Code**
- [ ] Clean, organized, and runs without errors.
- [ ] No specificity conflicts or `!important` hacks.
- [ ] No unnecessary dependencies.

---

## 14. Delivery

When finished, reply briefly with:
1. What you built and where the files are.
2. The creative direction and any assumptions you made, in a few lines.
3. How to run or view it.
4. What is mocked or left out, if anything.
5. One or two suggested next improvements.

Keep the reply short. Let the work speak.