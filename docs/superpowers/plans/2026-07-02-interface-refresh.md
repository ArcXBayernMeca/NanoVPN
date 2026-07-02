# Interface Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the three product surfaces (Map, Agent, Use-with-agent) plus the landing and shared nav a "refined fintech" professional polish on the existing cream/green/mono palette — depth, motion, focus, type rhythm — without changing the theme or any behavior.

**Architecture:** An **additive design-token layer** in `apps/web/app/globals.css` (elevation, motion, focus, radius, type scale) layered onto the *existing class names*, plus small presentational JSX for the nav active-route state, agent empty/skeleton states, and the use-with-agent step cards / code chrome. No logic, data, pricing, or on-chain changes.

**Tech Stack:** Next.js App Router (React 19), plain CSS (Tailwind imported but unused), vitest + @testing-library/react, wagmi/viem (untouched), Supabase realtime (untouched).

## Global Constraints

- **Palette frozen.** Use only existing tokens (`--canvas`, `--panel`, `--ink`, `--ink-2`, `--muted`, `--green`, `--green-bright`, `--green-tint`, `--green-line`, `--line`, `--amber`). New tokens are for depth/motion/rhythm only — no new hues.
- **XSS (principle 6).** No `dangerouslySetInnerHTML`, no `innerHTML` with dynamic values, no markdown→HTML library. `AgentFeed`'s `renderMarkdown`/`renderInline` stay exactly as-is (React children, auto-escaped).
- **Preserve test-queried names.** Do not rename: `.streampanel__amt`, `.awallet__amt`, `.savings`, `.walletbalances__row`, `.agent-answer__body`, `.agent-pay__row`, `.agent-pay__meta`, `.agent-amt`, `.sproof`, `.run-form__goal`; button labels `Fund`, `Run agent ▸`, `Connect wallet`, `Copy prompt`; the meta string format `"200 · 1.46 MB · 216.246.19.66"`; mocked component export names (`WalletButton`, `WalletPanel`, `AgentWalletCard`, `WorldMap`, `WalletBalances`, `SavingsBenchmark`).
- **No dependencies added.** Markdown stays hand-rolled; Tailwind stays unused beyond the existing `@import`.
- **All new motion** wrapped so `@media (prefers-reduced-motion: reduce)` disables it.
- **Testnet only** (chain 5042002); no network/chain/pricing/decimals changes; USDC stays display-only via `formatUsd`.
- **Per-phase gate:** `pnpm --filter web test` green **and** `pnpm --filter web build` clean before a phase is considered done. Visual verification is Martin's (browser), after deploy.

**A note on TDD for this plan:** most tasks are CSS refinements with no unit-testable behavior — their "test" is the existing suite staying green (regression) plus the production build compiling. Only Tasks 4 and 7 add genuinely testable behavior and follow strict TDD (failing test first). CSS tasks: implement the exact rules, run the suite to prove no regression, commit.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `apps/web/app/globals.css` | All token + visual refinements | 1,2,3,4,5,6,7,8,9 |
| `apps/web/components/NavLinks.tsx` (new) | Client nav with active-route state | 4 |
| `apps/web/components/SiteNav.tsx` | Render `NavLinks` (stays server component) | 4 |
| `apps/web/components/MapRail.tsx` | Rail section eyebrow headers | 5 |
| `apps/web/components/WorldMap.tsx` | Zoom-button class only (if needed) | 5 |
| `apps/web/components/AgentFeed.tsx` | Section headers + empty-state copy (NOT renderMarkdown) | 7 |
| `apps/web/components/WalletBalances.tsx` | Skeleton for null balances | 7 |
| `apps/web/components/AgentWalletCard.tsx` | Skeleton for null gateway balance | 7 |
| `apps/web/app/use-with-agent/page.tsx` | Hero, step cards, code chrome, facts table | 8 |
| `apps/web/app/page.tsx` | Landing CTA + secondary link | 9 |
| `apps/web/test/site-nav.test.tsx` | Active-route assertion + usePathname mock | 4 |
| `apps/web/test/wallet-balances.test.tsx` | Skeleton present when null | 7 |

---

# Phase 1 — Foundation (lifts all pages)

### Task 1: Design tokens, focus rings, motion primitives

**Files:**
- Modify: `apps/web/app/globals.css` (`:root` block ~line 16; after `a:hover` ~line 32; keyframes ~line 173; reduced-motion ~line 181)

**Interfaces:**
- Produces: CSS custom properties `--shadow-sm/md/lg/dark`, `--ease`, `--ease-out`, `--dur-1/2/3`, `--r-sm/md/lg/xl`; a `:focus-visible` ring; `@keyframes riseIn`; a `.sr-only` utility. Later tasks consume these.

- [ ] **Step 1: Add tokens to `:root`.** Immediately after the `--amber: #d98a2b;` line, insert:

```css
  /* elevation (low-alpha, ink-tinted — refined-fintech depth) */
  --shadow-sm: 0 1px 2px rgba(11,26,18,.04), 0 1px 3px rgba(11,26,18,.05);
  --shadow-md: 0 2px 4px rgba(11,26,18,.05), 0 8px 20px rgba(11,26,18,.07);
  --shadow-lg: 0 12px 32px rgba(11,26,18,.10), 0 24px 60px rgba(11,26,18,.12);
  --shadow-dark: 0 12px 40px rgba(0,0,0,.45); /* dark map rail over the globe */
  /* motion */
  --ease: cubic-bezier(.2,.6,.2,1);
  --ease-out: cubic-bezier(.16,1,.3,1);
  --dur-1: 120ms; --dur-2: 220ms; --dur-3: 420ms;
  /* radius scale (aligns to existing 8–14px usage) */
  --r-sm: 8px; --r-md: 11px; --r-lg: 14px; --r-xl: 18px;
```

- [ ] **Step 2: Add the focus ring + sr-only utility.** After the `a:hover { text-decoration: underline; }` line, insert:

```css
/* keyboard focus — outline (not box-shadow) so it never fights card shadows */
:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; border-radius: 6px; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
/* visually-hidden but screen-reader-available (used for skeleton "syncing…" text) */
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
```

- [ ] **Step 3: Add the `riseIn` keyframe + a page-section stagger helper.** Next to the existing `@keyframes flow`/`tapein` (~line 173), add:

```css
@keyframes riseIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes shimmer { from { background-position: -160px 0; } to { background-position: 160px 0; } }
/* opt-in section entrance: add data-rise to a container's direct children */
[data-rise] > * { animation: riseIn var(--dur-3) var(--ease-out) both; }
[data-rise] > *:nth-child(2) { animation-delay: 40ms; }
[data-rise] > *:nth-child(3) { animation-delay: 80ms; }
[data-rise] > *:nth-child(4) { animation-delay: 120ms; }
```

- [ ] **Step 4: Extend the reduced-motion block.** Replace the existing block (~line 181):

```css
@media (prefers-reduced-motion: reduce) {
  .meter[data-live="true"] .meter__flow i { animation: none; }
  .tape__row { animation: none; }
}
```

with:

```css
@media (prefers-reduced-motion: reduce) {
  .meter[data-live="true"] .meter__flow i { animation: none; }
  .tape__row, .agent-reasoning li, .agent-payments li { animation: none; }
  [data-rise] > *, [data-rise] > *:nth-child(n) { animation: none; }
  .skeleton { animation: none; }
  * { scroll-behavior: auto; }
}
```

- [ ] **Step 5: Verify no regression.** Run: `pnpm --filter web test`
Expected: `Test Files 44 passed | 1 skipped`, `Tests 131 passed | 1 skipped` (unchanged — this task adds only new, unreferenced rules).

- [ ] **Step 6: Commit.**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): design tokens — elevation, motion, focus ring, sr-only, riseIn"
```

---

### Task 2: Buttons + card elevation + hover-lift

**Files:**
- Modify: `apps/web/app/globals.css` (`.btn*` ~lines 91–102; card selectors listed below; `.maprail` ~line 392)

**Interfaces:**
- Consumes: `--shadow-sm/md/dark`, `--ease`, `--dur-1/2`, `--r-md` (Task 1).

- [ ] **Step 1: Refine buttons.** Replace the `.btn` / `.btn--primary` / `.btn:disabled` rules (lines 91–100) with:

```css
.btn {
  font-family: var(--font-body); font-size: 14px; font-weight: 600;
  border: 1px solid transparent; border-radius: var(--r-md); padding: 12px 15px;
  cursor: pointer; width: 100%;
  transition: filter var(--dur-1) var(--ease), background var(--dur-1) var(--ease),
              border-color var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease),
              transform var(--dur-1) var(--ease);
}
.btn:active:not(:disabled) { transform: scale(.985); }
.btn--primary {
  background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,0) 42%), var(--green);
  color: #fff; box-shadow: var(--shadow-sm);
}
.btn--primary:hover:not(:disabled) { filter: brightness(.97); box-shadow: var(--shadow-md); }
.btn--ghost { background: var(--panel); color: var(--ink); border-color: var(--line); }
.btn--ghost:hover:not(:disabled) { border-color: var(--green-line); background: var(--green-tint); }
.btn:disabled { background: #f1f2ee; color: #aeb4af; border-color: var(--line); cursor: not-allowed; box-shadow: none; }
```

- [ ] **Step 2: Give resting cards `--shadow-sm`.** Append to each of these existing rules a `box-shadow: var(--shadow-sm);` declaration — `.agent-run` (line 195), `.run-form` (line 405), `.agent-rail` (line 295), `.awallet` (line 328), `.agent-answer` (line 498), `.onb__sec` (line 436), `.dev-sec` (line 417). (Edit each rule; do not create new selectors.)

- [ ] **Step 3: Add hover-lift to the genuinely card-like elements.** After the `.node-card` rule (line 114) add:

```css
.node-card { box-shadow: var(--shadow-sm); transition: box-shadow var(--dur-2) var(--ease), transform var(--dur-2) var(--ease); }
.node-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
.onb__sec { transition: box-shadow var(--dur-2) var(--ease), transform var(--dur-2) var(--ease); }
.onb__sec:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
```

(Deliberately NOT hover-lifting `.run-form` / `.agent-run` / `.awallet` — they hold live inputs, a moving card under the cursor reads as a bug. Spec Section 1 called for card hover-lift generally; this narrows it to non-input cards, which is the correct UX call.)

- [ ] **Step 4: Lift the map rail.** In `.maprail` (line 392) add `box-shadow: var(--shadow-dark);`.

- [ ] **Step 5: Verify no regression.** Run: `pnpm --filter web test`
Expected: 131 passed | 1 skipped (button labels/classes unchanged).

- [ ] **Step 6: Commit.**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): refined buttons (press + gradient + shadow) and card elevation"
```

---

### Task 3: Type scale + page rhythm

**Files:**
- Modify: `apps/web/app/globals.css` (`.agent-page` 187–193; `.onb` 425–426; `.dev-page` 414–415)

- [ ] **Step 1: Unify page titles + top padding.** Replace `.agent-page` + `.agent-page h1` (187–193) with:

```css
.agent-page { max-width: 1200px; margin: 0 auto; padding: 40px 24px; }
.agent-page h1 { font-family: var(--font-display); font-weight: 700; font-size: 24px; letter-spacing: -0.02em; color: var(--ink); margin: 0 0 24px; }
```

Replace `.onb` + `.onb h1` (425–426) with:

```css
.onb { max-width: 720px; margin: 0 auto; padding: 40px 24px 64px; }
.onb h1 { font-family: var(--font-display); font-weight: 700; font-size: 24px; letter-spacing: -0.02em; color: var(--ink); margin: 0 0 10px; }
```

(Both page titles now 24px; both pages start at 40px top — the shared rhythm. `.dev-page` is legacy/kept; leave it.)

- [ ] **Step 2: Verify no regression.** Run: `pnpm --filter web test`
Expected: 131 passed | 1 skipped.

- [ ] **Step 3: Verify the build compiles.** Run: `pnpm --filter web build`
Expected: `✓ Compiled` / route list printed, exit 0.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): unified type scale + page rhythm across agent/onboarding"
```

---

### Task 4: Nav active-route state  *(TDD)*

**Files:**
- Create: `apps/web/components/NavLinks.tsx`
- Modify: `apps/web/components/SiteNav.tsx` (replace inline `<nav>`), `apps/web/app/globals.css` (`.sitenav__links`)
- Test: `apps/web/test/site-nav.test.tsx`

**Interfaces:**
- Produces: `NavLinks` (client component, no props) rendering the 3 nav links with `aria-current="page"` + class `is-active` on the current route.
- Consumes: `usePathname` from `next/navigation`.

- [ ] **Step 1: Write the failing test.** Replace `apps/web/test/site-nav.test.tsx` with:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteNav } from "@/components/SiteNav";

vi.mock("@/components/WalletButton", () => ({ WalletButton: () => <button>Connect wallet</button> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/agent" }));

describe("SiteNav", () => {
  it("links to the three surfaces", () => {
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: /^agent$/i })).toHaveAttribute("href", "/agent");
    expect(screen.getByRole("link", { name: /use with agent/i })).toHaveAttribute("href", "/use-with-agent");
    expect(screen.getByRole("link", { name: /map/i })).toHaveAttribute("href", "/map");
  });

  it("marks the active route with aria-current=page", () => {
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: /^agent$/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /map/i })).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm --filter web test -- site-nav`
Expected: FAIL — the second test errors (no `aria-current`) and/or `usePathname` mock unused because SiteNav doesn't call it yet.

- [ ] **Step 3: Create `NavLinks.tsx`.**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/map", label: "Map" },
  { href: "/agent", label: "Agent" },
  { href: "/use-with-agent", label: "Use with agent" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="sitenav__links">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link key={l.href} href={l.href} className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Use it in `SiteNav.tsx`.** Replace the whole file with:

```tsx
import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { NavLinks } from "./NavLinks";

export function SiteNav() {
  return (
    <header className="sitenav">
      <Link href="/" className="sitenav__brand">Nano<b>VPN</b></Link>
      <NavLinks />
      <div className="sitenav__right">
        <span className="netpill"><span className="dot" /> Arc testnet</span>
        <WalletButton />
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Style the active underline.** Replace `.sitenav__links a` + `.sitenav__links a:hover` (lines 39–40) with:

```css
.sitenav__links a { position: relative; font-family: var(--font-mono); font-size: 12.5px; color: var(--muted); text-decoration: none; padding-bottom: 3px; transition: color var(--dur-1) var(--ease); }
.sitenav__links a:hover { color: var(--ink); }
.sitenav__links a.is-active { color: var(--ink); }
.sitenav__links a.is-active::after { content: ""; position: absolute; left: 0; right: 0; bottom: -4px; height: 2px; background: var(--green); border-radius: 2px; }
```

- [ ] **Step 6: Run — expect PASS.** Run: `pnpm --filter web test -- site-nav`
Expected: both tests PASS.

- [ ] **Step 7: Full suite + build.** Run: `pnpm --filter web test` (expect 132 passed | 1 skipped — one new test) then `pnpm --filter web build` (exit 0).

- [ ] **Step 8: Commit.**

```bash
git add apps/web/components/NavLinks.tsx apps/web/components/SiteNav.tsx apps/web/app/globals.css apps/web/test/site-nav.test.tsx
git commit -m "feat(web): active-route underline in the top nav (NavLinks + aria-current)"
```

---

# Phase 2 — Map

### Task 5: Map rail hierarchy + glass shadow + live-counter emphasis + zoom controls

**Files:**
- Modify: `apps/web/components/MapRail.tsx` (add eyebrow headers to the wallet + fetch sections), `apps/web/app/globals.css` (`.streampanel__spend`, `.seg__btn`, `.wmap__zoom`)

**Interfaces:**
- Consumes: `--shadow-dark` (already applied to `.maprail` in Task 2), `--r-md`, `--ease`.

- [ ] **Step 1: Add section eyebrow headers in `MapRail.tsx`.** In the wallet section (line 51) change:

```tsx
      {signedIn && (
        <section className="maprail__sec">
          <WalletPanel />
        </section>
      )}
```

to:

```tsx
      {signedIn && (
        <section className="maprail__sec">
          <span className="eyebrow">Wallet</span>
          <WalletPanel />
        </section>
      )}
```

and in the fetch/stream section (line 55) insert `<span className="eyebrow">Session</span>` as the first child of that `<section className="maprail__sec">`, before `<FetchPanel …>`.

- [ ] **Step 2: Emphasize the live counter + refine seg + zoom.** In `globals.css`, replace `.streampanel__spend` (line 523):

```css
.streampanel__spend { font-size: 40px; font-weight: 700; color: var(--green-bright); line-height: 1.05; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
```

Replace `.seg__btn` (line 401):

```css
.seg__btn { flex: 1; text-align: center; font-family: var(--font-mono); font-size: 11px; text-transform: capitalize; padding: 7px 0; background: transparent; color: rgba(234,242,238,.65); border: none; cursor: pointer; transition: background var(--dur-1) var(--ease), color var(--dur-1) var(--ease); }
```

Replace the `.wmap__zoom button` rules (lines 459–460):

```css
.wmap__zoom button { width: 34px; height: 34px; border-radius: var(--r-sm); border: 1px solid rgba(255,255,255,.16); background: rgba(10,18,14,.92); color: #eaf2ee; font-size: 18px; cursor: pointer; box-shadow: var(--shadow-dark); transition: border-color var(--dur-1) var(--ease); }
.wmap__zoom button:hover { border-color: var(--green-bright); }
```

- [ ] **Step 3: Add spacing between an eyebrow and the panel it heads (map rail).** Append to `globals.css`:

```css
.maprail__sec > .eyebrow { display: block; margin-bottom: 10px; }
```

- [ ] **Step 4: Verify no regression.** Run: `pnpm --filter web test`
Expected: 132 passed | 1 skipped (map-rail tests query behavior/labels that are unchanged).

- [ ] **Step 5: Build.** Run: `pnpm --filter web build` — exit 0.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/components/MapRail.tsx apps/web/app/globals.css
git commit -m "style(web): map rail hierarchy, glass shadow, bigger live counter, refined zoom"
```

---

# Phase 3 — Agent

### Task 6: Run-form composition

**Files:**
- Modify: `apps/web/app/globals.css` (`.run-form*` 405–411)

(The form JSX in `AgentRunForm.tsx` is already correct — goal full-width, a budget field + `Run agent ▸` on `.run-form__row`. This task refines only the layout/spacing so the button sits prominently at the right of the row. There is **no node select** in this form; do not add one.)

- [ ] **Step 1: Refine the run-form CSS.** Replace lines 405–411 with:

```css
.run-form { background: var(--panel); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 18px 20px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 12px; box-shadow: var(--shadow-sm); }
.run-form__goal { width: 100%; font-family: var(--font-body); font-size: 14.5px; padding: 11px 13px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--canvas); transition: border-color var(--dur-1) var(--ease); }
.run-form__goal:focus { outline: none; border-color: var(--green); background: var(--panel); }
.run-form__row { display: flex; align-items: flex-end; gap: 14px; }
.run-form__row .btn { width: auto; margin-left: auto; min-width: 148px; }
.run-form__row select, .run-form__budget { font-family: var(--font-mono); font-size: 12.5px; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--canvas); }
.run-form__budget { width: 100px; }
.run-form__field { display: flex; flex-direction: column; gap: 5px; }
.run-form__field span { font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
```

- [ ] **Step 2: Verify no regression.** Run: `pnpm --filter web test -- agent-run-form`
Expected: PASS (the form's behavior + `Run agent ▸` label unchanged).

- [ ] **Step 3: Commit.**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): refined agent run-form composition (prominent Run button, focus states)"
```

---

### Task 7: Agent feed section headers + real empty states + balance skeleton  *(TDD for skeleton)*

**Files:**
- Modify: `apps/web/components/AgentFeed.tsx` (empty-state copy + a `data-rise` on the grid — NOT `renderMarkdown`), `apps/web/components/WalletBalances.tsx`, `apps/web/components/AgentWalletCard.tsx`, `apps/web/app/globals.css`
- Test: `apps/web/test/wallet-balances.test.tsx`

**Interfaces:**
- Consumes: `--muted`, `--green-tint`, `.sr-only`, `@keyframes shimmer` (Task 1).
- Produces: a `.skeleton` shimmer element used wherever a balance is still `null`, with an `sr-only` "syncing…" label (keeps existing `getByText(/syncing/i)` assertions green).

- [ ] **Step 1: Write the failing test** for the skeleton. In `apps/web/test/wallet-balances.test.tsx`, replace the second test with:

```tsx
  it("falls back to — and a syncing skeleton on nulls", () => {
    mockState = { ...mockState, walletMicroUsd: null, gatewayMicroUsd: null };
    const { container } = render(<WalletBalances />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/syncing/i)).toBeTruthy();          // sr-only text stays for a11y + tests
    expect(container.querySelector(".skeleton")).toBeTruthy();  // visual shimmer present
  });
```

- [ ] **Step 2: Run — expect FAIL.** Run: `pnpm --filter web test -- wallet-balances`
Expected: FAIL — no `.skeleton` element yet.

- [ ] **Step 3: Add the skeleton to `WalletBalances.tsx`.** Replace the Gateway row (line 11) with:

```tsx
      <div className="walletbalances__row"><span>Gateway</span>{gatewayMicroUsd != null ? <strong>{formatUsd(gatewayMicroUsd)}</strong> : <span className="skeleton" role="status"><span className="sr-only">syncing…</span></span>}</div>
```

- [ ] **Step 4: Add the skeleton to `AgentWalletCard.tsx`.** Replace the spending-balance value expression (line 28's `<b>`), i.e.:

```tsx
          <b className="awallet__v">{gatewayMicroUsd != null ? formatUsd(gatewayMicroUsd) : eoaAddress ? "syncing…" : "—"}</b>
```

with:

```tsx
          <b className="awallet__v">{gatewayMicroUsd != null ? formatUsd(gatewayMicroUsd) : eoaAddress ? <span className="skeleton skeleton--lg" role="status"><span className="sr-only">syncing…</span></span> : "—"}</b>
```

- [ ] **Step 5: Refine AgentFeed empty states + stagger.** In `AgentFeed.tsx`: add `data-rise` to the grid wrapper — change `<div className="agent-grid">` (line 83) to `<div className="agent-grid" data-rise>`. Replace the two empty-state paragraphs:
  - line 92 `<p className="muted">Waiting for the agent to think…</p>` → `<div className="feed-empty"><p className="muted">The agent's thinking will stream here as it works.</p></div>`
  - line 103 `<p className="muted">No payments yet.</p>` → `<p className="muted feed-empty__line">No payments yet — each fetch settles here in USDC.</p>`

  **Critical:** the reasoning empty-state copy must NOT contain the word "reasoning" — the existing test `agent-feed.test.tsx` asserts `getByText(/reasoning/i)` and expects it to match the single `<h2>Reasoning</h2>`; a second match (e.g. an eyebrow that repeats "Reasoning") makes `getByText` throw. Use "thinking" as above.
  **Do not touch `renderMarkdown`, `renderInline`, or the payment row markup** (principle 6 + the feed tests assert exact structure/format).

- [ ] **Step 6: Add the skeleton + empty CSS.** Append to `globals.css`:

```css
/* skeleton shimmer (balances still loading) */
.skeleton { display: inline-block; width: 54px; height: 13px; border-radius: 5px; vertical-align: middle;
  background: linear-gradient(90deg, var(--line) 25%, #f1f3ee 37%, var(--line) 63%);
  background-size: 320px 100%; animation: shimmer 1.3s ease-in-out infinite; }
.skeleton--lg { width: 92px; height: 22px; }
.feed-empty { padding: 8px 0 2px; }
.feed-empty .muted { margin: 0; }
.feed-empty__line { margin-top: 0; }
```

- [ ] **Step 7: Run — expect PASS.** Run: `pnpm --filter web test -- wallet-balances agent-feed agent-wallet-card`
Expected: all PASS (skeleton present; `/syncing/i` still found via sr-only; feed structure unchanged).

- [ ] **Step 8: Full suite + build.** `pnpm --filter web test` (132 passed | 1 skipped) then `pnpm --filter web build` (exit 0).

- [ ] **Step 9: Commit.**

```bash
git add apps/web/components/AgentFeed.tsx apps/web/components/WalletBalances.tsx apps/web/components/AgentWalletCard.tsx apps/web/app/globals.css apps/web/test/wallet-balances.test.tsx
git commit -m "feat(web): agent feed empty states + shimmer skeletons for loading balances"
```

---

# Phase 4 — Use-with-agent

### Task 8: Hero + numbered step cards + code-block chrome + facts table

**Files:**
- Modify: `apps/web/app/use-with-agent/page.tsx`, `apps/web/app/globals.css` (`.onb*`)

**Interfaces:**
- Consumes: `--shadow-sm`, `--r-lg`, `.eyebrow`, `CopyButton` (unchanged).

- [ ] **Step 1: Restructure the page.** Replace the body of `apps/web/app/use-with-agent/page.tsx` (keep imports + `metadata`) with:

```tsx
  return (
    <main className="onb" data-rise>
      <span className="eyebrow">For developers</span>
      <h1>Give your AI agent <b>pay-per-use internet</b></h1>
      <p className="onb__lede">Geo-located egress, paid in USDC per request over x402 on Arc — no subscription, no account.</p>
      <div className="onb__flow"><span>POST /egress</span><i>→</i><span>402 challenge</span><i>→</i><span>sign + retry</span><i>→</i><span>200 + egress IP</span></div>

      <section className="onb__sec onb__step">
        <span className="onb__num">1</span>
        <div className="onb__stepbody">
          <div className="onb__head"><span className="eyebrow">Paste this into your agent</span><CopyButton text={AGENT_PROMPT} label="Copy prompt" /></div>
          <div className="onb__codewrap"><span className="onb__codetag">PROMPT</span><pre className="onb__code">{AGENT_PROMPT}</pre></div>
        </div>
      </section>

      <section className="onb__sec onb__step">
        <span className="onb__num">2</span>
        <div className="onb__stepbody">
          <span className="eyebrow">Or call it directly</span>
          <div className="onb__codewrap"><span className="onb__codetag">JS</span><pre className="onb__code">await buyer.pay("https://&lt;node-host&gt;/egress?url=" + encodeURIComponent(url), {`{ method: "POST" }`})</pre></div>
        </div>
      </section>

      <section className="onb__sec">
        <span className="eyebrow">Endpoint reference</span>
        <table className="onb__spec"><tbody>
          <tr><th>Endpoint</th><td><code>{EGRESS_ENDPOINT_FACTS.url}</code></td></tr>
          <tr><th>Network</th><td><code>{EGRESS_ENDPOINT_FACTS.network}</code></td></tr>
          <tr><th>Scheme</th><td><code>{EGRESS_ENDPOINT_FACTS.scheme} (Circle Gateway batched)</code></td></tr>
          <tr><th>Price</th><td><code>~${EGRESS_ENDPOINT_FACTS.pricePerRequestUsd}/request</code></td></tr>
        </tbody></table>
        <p className="hint">Machine-readable: <a href="/agent-onboarding">/agent-onboarding</a> · <a href="/llms.txt">/llms.txt</a></p>
      </section>
    </main>
  );
```

(All interpolated values are trusted constants; everything renders as escaped React children — principle 6 upheld, no `dangerouslySetInnerHTML`.)

- [ ] **Step 2: Add the step-card + code-chrome + spec-table CSS.** Append to `globals.css`:

```css
/* numbered step cards */
.onb__step { display: flex; gap: 16px; align-items: flex-start; }
.onb__num { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--green); background: var(--green-tint); border: 1px solid var(--green-line); }
.onb__stepbody { flex: 1; min-width: 0; }
/* code block chrome: label chip + inset body */
.onb__codewrap { position: relative; margin-top: 10px; }
.onb__codetag { position: absolute; top: 8px; right: 10px; font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .1em;
  color: var(--muted); background: var(--panel); border: 1px solid var(--line); border-radius: 999px; padding: 2px 7px; }
.onb__codewrap .onb__code { margin: 0; padding: 16px; padding-right: 64px; border-radius: var(--r-md); }
/* endpoint spec table */
.onb__spec { width: 100%; border-collapse: collapse; margin-top: 10px; font-family: var(--font-mono); font-size: 12.5px; }
.onb__spec th { text-align: left; font-weight: 500; color: var(--muted); padding: 9px 12px 9px 0; width: 96px; vertical-align: top; border-top: 1px solid var(--line); }
.onb__spec td { padding: 9px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
.onb__spec tr:first-child th, .onb__spec tr:first-child td { border-top: none; }
.onb__spec code { color: var(--ink); }
```

- [ ] **Step 3: Verify + build.** `pnpm --filter web test` (132 passed | 1 skipped — the onboarding page has no unit test, so this proves no cross-regression) then `pnpm --filter web build` (exit 0; `/use-with-agent` renders).

- [ ] **Step 4: Commit.**

```bash
git add apps/web/app/use-with-agent/page.tsx apps/web/app/globals.css
git commit -m "style(web): use-with-agent hero, numbered step cards, code chrome, spec table"
```

---

# Phase 5 — Landing

### Task 9: Landing CTA polish + secondary link

**Files:**
- Modify: `apps/web/app/page.tsx` (add a secondary link under the CTA), `apps/web/app/globals.css` (`.landing__cta`, new `.landing__secondary`)

**Interfaces:**
- Consumes: refined `.btn--primary` (Task 2). Must not break `landing.test.tsx` (asserts the "pay-per-use VPN" tagline + a "Start using" button that calls `request()` then routes to `/map`).

- [ ] **Step 1: Add a secondary link.** In `apps/web/app/page.tsx`, replace the CTA button block (lines 27–29) with:

```tsx
        <button className="btn btn--primary landing__cta" onClick={start} disabled={busy}>
          {busy ? "Locating…" : "Start using"}
        </button>
        <a className="landing__secondary" href="/use-with-agent">or use with your AI agent →</a>
```

- [ ] **Step 2: Style the secondary link.** Append to `globals.css`:

```css
.landing__secondary { display: inline-block; margin-top: 18px; font-family: var(--font-mono); font-size: 13px; color: rgba(234,242,238,.72); transition: color var(--dur-1) var(--ease); }
.landing__secondary:hover { color: var(--green-bright); text-decoration: none; }
```

- [ ] **Step 3: Run the landing test — expect PASS.** Run: `pnpm --filter web test -- landing`
Expected: PASS (tagline + "Start using" button behavior unchanged; the new link doesn't interfere).

- [ ] **Step 4: Full suite + build.** `pnpm --filter web test` (132 passed | 1 skipped) then `pnpm --filter web build` (exit 0).

- [ ] **Step 5: Commit.**

```bash
git add apps/web/app/page.tsx apps/web/app/globals.css
git commit -m "style(web): landing CTA polish + secondary 'use with agent' link"
```

---

## Final verification (after all phases)

- [ ] `pnpm --filter web test` → **132 passed | 1 skipped**.
- [ ] `pnpm --filter web build` → exit 0, all routes listed.
- [ ] Grep guard: `grep -rn "dangerouslySetInnerHTML" apps/web/components apps/web/app` → only the pre-existing **static** `innerHTML` in `WorldMap.tsx`; **no `dangerouslySetInnerHTML` anywhere** (principle 6).
- [ ] Deploy to Vercel prod; **Martin browser-verifies** all three pages + landing: nav active underline, button press/hover, card depth, focus rings (Tab through), agent empty/skeleton states, use-with-agent step cards + code chrome, landing secondary link. Confirm `prefers-reduced-motion` disables the entrance/shimmer (OS setting).

## Notes on spec fidelity

- Spec Section 3 mentioned a "node select" in the run form; the real form has none (the agent/copilot picks the node), so Task 6 refines goal + budget + Run button only.
- Spec Section 1 called for card hover-lift broadly; Task 2 narrows it to non-input cards (`.node-card`, `.onb__sec`) — lifting a card that holds live inputs reads as a bug. This is the intended "refined" behavior.
- Focus ring implemented as `outline` (not the spec's `--ring` box-shadow) so it never fights the new card shadows; same visible-green-ring outcome.
