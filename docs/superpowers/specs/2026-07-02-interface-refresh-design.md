# Design — Interface refresh (professional polish across Map, Agent, Use-with-agent)

**Date:** 2026-07-02
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Problem

The three product surfaces (`/map`, `/agent`, `/use-with-agent`, plus the `/` landing
and the shared nav) work and share a coherent palette, but read as *functional* rather
than *crafted*. Concrete gaps: the top nav is plain with no active-route state, buttons
are flat (no press/focus states), the type scale and page paddings differ per page,
there are no `:focus-visible` rings, empty/loading states are thin (bare muted text),
and there's little intentional depth or micro-motion. We want a more professional,
"refined fintech" feel — **without changing the theme, palette, or overall vibe.**

## Decisions (locked during brainstorming)

- **Approach: shared polish + targeted UX.** Refine the shared design system once so all
  three pages level up cohesively, plus a handful of high-impact per-page placement/UX
  tweaks. Layouts stay mostly intact (low risk before the deadline).
- **Priority: even across all three pages.** No single hero page; each gets a similar
  amount of targeted UX love on top of the shared foundation.
- **Feel: refined fintech (Stripe-like).** Warm layered depth (soft shadows), generous
  whitespace, confident typography, tasteful *quiet* motion. Keep the existing cream +
  green + mono palette exactly.
- **Implementation strategy: additive design-token layer.** Introduce a small set of new
  CSS custom properties (elevation, motion, focus, type/rhythm) and layer refinements
  onto the **existing class names** rather than rewriting components. Keeps all markup +
  the 131 web tests intact; makes the refinement cohesive and reversible. Rejected
  alternative: per-component rewrites (more churn/risk, no gain here).

## Design principles

1. **Palette is frozen.** Use only the existing tokens (`--canvas`, `--panel`, `--ink`,
   `--ink-2`, `--muted`, `--green`, `--green-bright`, `--green-tint`, `--green-line`,
   `--line`, `--amber`). New tokens are for *depth/motion/rhythm*, not new hues.
2. **Depth is subtle.** Shadows are low-alpha and layered (Stripe-style), never heavy.
3. **Motion is quiet and optional.** Nothing bounces or distracts; every animation is
   gated behind `prefers-reduced-motion: reduce`.
4. **No logic changes.** This is CSS-first plus minimal JSX (nav active state, step-card
   wrappers, empty/skeleton states). No data flow, pricing, or on-chain behavior changes.
5. **Class names the tests query are preserved** (e.g. `.streampanel__amt`, `.awallet__amt`,
   `.savings`, `.walletbalances__row`, button labels "Fund"/"Run agent", the mocked
   component names). Structural test contracts stay green.

---

## Section 1 — Shared foundation (`app/globals.css`, `components/SiteNav.tsx`)

New tokens added to `:root`:

```css
/* elevation (low-alpha, green-tinted ink shadows) */
--shadow-sm: 0 1px 2px rgba(11,26,18,.04), 0 1px 3px rgba(11,26,18,.05);
--shadow-md: 0 2px 4px rgba(11,26,18,.05), 0 8px 20px rgba(11,26,18,.07);
--shadow-lg: 0 12px 32px rgba(11,26,18,.10), 0 24px 60px rgba(11,26,18,.12);
--shadow-dark: 0 12px 40px rgba(0,0,0,.45); /* for the dark map rail on the globe */

/* motion */
--ease: cubic-bezier(.2,.6,.2,1);
--ease-out: cubic-bezier(.16,1,.3,1);
--dur-1: 120ms; --dur-2: 220ms; --dur-3: 420ms;

/* focus ring */
--ring: 0 0 0 2px var(--canvas), 0 0 0 4px var(--green);

/* radius scale (aligns to existing 8–14px usage) */
--r-sm: 8px; --r-md: 11px; --r-lg: 14px; --r-xl: 18px;
```

**Elevation applied.** Resting cards (`.agent-run`, `.run-form`, `.agent-rail`, `.onb__sec`,
`.awallet`, `.agent-answer`, `.node-card`) get `--shadow-sm`. Interactive cards
(`.node-card`, `.run-form`, `.onb__sec`, code sections) lift to `--shadow-md` + a `-1px`
translate on hover. The floating `.maprail` gets `--shadow-dark` so it reads as glass
above the globe.

**Motion applied.** All existing transitions re-pointed to `--ease`/`--dur-*`. New quiet
interactions: `.btn` press (`transform: scale(.985)` on `:active`), card hover-lift, and a
**staggered section fade-in** on load — a reusable `@keyframes riseIn` (opacity + 6px
translateY) applied to top-level page sections with small `animation-delay` steps
(extends the existing `tapein`). All new motion wrapped so
`@media (prefers-reduced-motion: reduce)` disables it (join the existing reduced-motion
block).

**Focus & accessibility.** Global `:focus-visible { box-shadow: var(--ring); outline: none;
border-radius: inherit; }` for buttons/links/inputs/selects. Verify contrast of `--muted`
on `--canvas` and green-on-tint stays ≥ WCAG AA for text.

**Type & rhythm.** Establish a shared scale and apply it so pages feel like one product:

| role | size / weight | notes |
|---|---|---|
| page title (`h1`) | 24px / 700, `-0.02em` | unify agent (was 22) + onb (was 26) |
| card title | 15px / 600 display | e.g. `.agent-run__goal` |
| list-section header | 10.5px mono eyebrow | reasoning/payments headers, rail sections |
| body | 14.5px / 1.6 | |
| eyebrow / micro | 10.5px mono uppercase `.13em` | unchanged |

Container/padding rhythm: a shared page top-padding (~40px desktop) and consistent max
widths (agent 1200, onb 720 kept; landing/map full-bleed kept).

**Buttons.** Refine `.btn--primary` — keep `var(--green)` but add a subtle top-highlight
(`linear-gradient(180deg, rgba(255,255,255,.12), transparent)` overlay) + `--shadow-sm`,
hover to `--shadow-md`, `:active` press. `.btn--ghost` / `.btn--secondary` keep their
colors, gain the focus ring + press. Radius standardized to `--r-md`.

**Nav (`SiteNav.tsx` + CSS).** Add an **active-route indicator**: the current link gets
`color: var(--ink)` + a 2px `var(--green)` bottom underline (chosen over a pill — lighter,
matches the hairline aesthetic). Implemented with a tiny `NavLinks` client child using
`usePathname()` to set `aria-current="page"` + an `is-active` class (keeps `SiteNav` itself
a server component). Smoother link hover, slightly refined `.netpill` (subtle shadow) and
wallet button.

---

## Section 2 — Map page (`components/MapRail.tsx`, `WorldMap` zoom, CSS)

Keep the full-bleed WebGL globe. Targeted tweaks:

- **Rail hierarchy:** every rail section gets a clear eyebrow header + consistent spacing;
  `.maprail` gains `--shadow-dark` and a marginally refined border so it lifts off the map.
- **Live counter is the hero:** the streaming USD figure (`.streampanel__spend`) enlarged,
  tabular, paired with the existing flow bar for a "money is moving" read.
- **Flow states:** connect → connecting → streaming standardized on the refined button
  system; the `.seg` stream-intensity control and "Let AI pick" button unified in size/
  radius/hover.
- **Node card:** polish the selected exit-node card + rate chip (shadow-sm, tighter type).
- **Zoom controls (`.wmap__zoom`):** restyle to match the button system (radius, border,
  hover ring) instead of the current ad-hoc dark squares.

No change to map logic, MapLibre init, or the no-backdrop-blur constraint (documented GPU
crash guard stays).

## Section 3 — Agent page (`components/AgentRunForm.tsx`, `AgentFeed.tsx`, `AgentStatusRail.tsx`, page, CSS)

Keep the 2-column `agent-layout`. Targeted tweaks:

- **Run form:** tighten into a deliberate composition — goal input full-width; budget +
  node select + a prominent **"Run agent ▸"** primary aligned on one row; clearer field
  labels via the eyebrow style; card gets shadow-sm + focus rings on inputs/select.
- **Timeline:** consistent eyebrow section headers for reasoning/payments; refined row
  rhythm and kind badges (unchanged colors).
- **Real states:** replace the bare `<p class="muted">` empty state with a proper
  **empty state** (icon/eyebrow + one line "Launch an agent to watch it reason and pay");
  add a **shimmer skeleton** for "syncing…" balances (a reusable `.skeleton` shimmer under
  reduced-motion rules) instead of bare text.
- **Rail:** apply the shared rhythm; keep the wallet card + `.agent-rail__money` group;
  emphasize the savings figure (slightly larger, green).

## Section 4 — Use-with-agent (`app/use-with-agent/page.tsx`, `CopyButton`, CSS)

Keep the centered single column. Targeted tweaks:

- **Hero:** eyebrow + title + lede on the shared type scale.
- **Numbered step cards:** turn the "1 · …" / "2 · …" sections into proper step cards
  (numbered badge + card treatment + shadow-sm).
- **Code blocks (`.onb__code`):** add a header strip with a small label chip (e.g. `PROMPT`,
  `JS`) + a corner copy button, subtle inner background, roomier padding, rounded.
- **Endpoint facts:** render as a clean spec table (aligned key/value rows, hairline
  separators) instead of the current inline list.

## Section 5 — Landing (`app/page.tsx`, CSS) — light touch

Already strong. Adopt the refined primary CTA + focus ring; add a subtle secondary link
("or use with your agent →") under the CTA; ensure the hero matches the elevated feel.
Keep the animated backdrop + entrance animation.

---

## Motion, accessibility & error handling

- **Motion inventory:** staggered section `riseIn` on load; card hover-lift; button press;
  input/select focus rings; skeleton shimmer. Existing `flow`, `tapein`, pin pulses,
  `landingIn` retained.
- **Reduced motion:** the existing `@media (prefers-reduced-motion: reduce)` block extended
  to disable `riseIn`, hover-lift, and shimmer.
- **Focus:** every interactive element reachable + visibly focused via `:focus-visible`.
- **Contrast:** re-check `--muted`/green-on-tint combinations at text sizes for AA.
- **No new failure modes:** purely presentational; data/loading/error *logic* unchanged.

## Testing & verification

- **Preserve test contracts.** Do not rename classes the tests query
  (`.streampanel__amt`, `.awallet__amt`, `.savings`, `.walletbalances__row`, etc.) or button
  labels ("Fund", "Run agent"); keep mocked component export names. Existing **131 web
  tests** must stay green — they assert structure/behavior, not pixels.
- **SiteNav change:** if SiteNav (or a `NavLinks` child) becomes a client component using
  `usePathname()`, update/extend `site-nav.test.tsx` to still assert the three links render
  (mock `usePathname` if needed). Add a light test that the active link gets
  `aria-current="page"`.
- **New JSX gets light tests** where behavior is testable (step-card render, empty-state
  render, skeleton present when balance is null). Prefer extending existing tests over new
  files.
- **`pnpm --filter web test` green + `pnpm --filter web build` (next prod build) clean.**
- **Visual pass is Martin's** — browser-verify all three pages + landing after deploy.

## Files touched (anticipated)

- `apps/web/app/globals.css` — the bulk: tokens, elevation, motion, focus, type/rhythm,
  buttons, nav, and per-page rule refinements.
- `apps/web/components/SiteNav.tsx` (+ maybe a small `NavLinks.tsx`) — active-route state.
- `apps/web/components/MapRail.tsx` — rail section headers/structure.
- `apps/web/components/AgentRunForm.tsx` — form composition.
- `apps/web/components/AgentFeed.tsx` — section headers + empty/skeleton states.
- `apps/web/app/use-with-agent/page.tsx` (+ `CopyButton`) — hero, step cards, code chrome,
  facts table.
- `apps/web/app/page.tsx` — CTA + secondary link.
- `apps/web/components/WorldMap.tsx` — zoom-control classes only (if needed).
- `apps/web/test/*` — SiteNav active state + any new light tests.

## Out of scope

- No palette/hue changes; no new brand colors.
- No new features, routes, pricing, or on-chain behavior.
- No MapLibre/globe re-architecture; no backdrop-blur on the map rail (GPU crash guard).
- No dark-mode toggle, no i18n, no component-library migration (Tailwind stays unused
  beyond the existing `@import`).
- Deep restructures of any page layout (that was the rejected "per-page redesign" option).

## Rollout

Web-only; deploy to Vercel. Likely split into an implementation plan with a
**foundation-first phase** (tokens + nav + buttons + shared rhythm) then **per-page phases**
(map, agent, use-with-agent, landing), each independently testable and shippable.
