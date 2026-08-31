# PixelAlt AI — Interface & Component Reference

This README is the single source of truth for how this app's UI is built. It
exists so that **future Kourify apps can copy this interface pattern
directly from here** — no need to point at another app's screenshots again.

Stack: Shopify Remix app (`@shopify/shopify-app-react-router`) + Prisma +
**Shopify Polaris web components** (the `s-*` custom elements Shopify injects
via `app-bridge.js`/`polaris.js`). We do **not** use `@shopify/polaris`
(the React package) — everything is the newer web-component system. This
matters: read the "Polaris web component gotchas" section before writing
any new page, or you will hit the exact bugs this project already hit and
fixed.

---

## 1. File map

```
app/
  components/        Reusable UI pieces (see §3)
  hooks/
    useFetcherToast.ts   Fires a toast on fetcher submit→idle completion
  lib/
    *.server.ts       Business logic (billing, sync, generation, settings)
    *-options.ts       Static option lists (tone, language, plans)
  routes/
    app.tsx            Layout: nav + ToastProvider wrapper
    app._index.tsx      Dashboard
    app.product-images.tsx
    app.other-images.tsx
    app.job-history.tsx
    app.settings.tsx
    app.pricing.tsx
  styles/theme.css     All custom CSS classes (Polaris elements are
                       self-styled; theme.css only styles our own
                       hand-built pieces — see §2)
```

---

## 2. Design tokens (`app/styles/theme.css` `:root`)

```css
--color-accent-dark: #5b21b6;
--color-accent:      #7c3aed;   /* primary purple */
--color-accent-light:#ede9fe;
--color-black:        #000000;
--color-white:        #ffffff;
--color-muted:        #6b7280;
--status-good:        #0ca30c;
--status-warning:     #fab219;
--status-critical:    #d03b3b;
```

The signature **gradient** (used for the one "hero" CTA per page, and only
that one — never more than one gradient button on screen) is:

```css
linear-gradient(90deg, var(--color-accent) 0%, #db2777 100%)
```

This exact gradient is reused for: the Growth plan's "Upgrade to Growth"
button, the "Annual · Save 2 months" toggle badge, and empty-state CTA
buttons that represent the primary action (e.g. "Start generating"). Use
`<AppButton variant="gradient">` (see §3.1) — never hand-roll it.

Everything else (buttons, badges, tables, banners, form fields, modals,
choice lists, icons) is a native Polaris web component and is **not**
styled by us — it inherits Shopify admin's own styling automatically.

---

## 3. Components (`app/components/`)

### 3.1 `AppButton.tsx`
Thin wrapper around real `<s-button>` — **always use this instead of a
plain `<button>` or raw `<s-button>`**, so every button in the app stays
visually consistent (native Polaris look, not a custom CSS button).

Props: `variant` (`"primary" | "secondary" | "gradient"`, default
`"primary"`), `type`, `href`, `disabled`, `onClick`, `command`,
`commandFor`, `slot`, `children`.

- `variant="gradient"` is the *only* case that doesn't render `<s-button>`
  — it renders a plain `<button>`/`<a>` styled with `.app-btn-gradient`
  (Polaris has no native gradient button). Use sparingly (see §2).
- `command`/`commandFor` are native HTML Invoker Commands attributes used
  to open/close an `<s-modal>` (see §3.7) — pass `command="--show"` and
  `commandFor="<modal-id>"` on the trigger button.
- `slot` exists **only** for the one legitimate use of Shopify's action
  slots we still use directly with raw `<s-button>` (we don't actually use
  `AppButton`'s `slot` prop in practice — see §4.1's warning about
  `s-page` slots).

### 3.2 `Card.tsx` — `Card` and `StatTile`
- `Card` renders `<s-section heading={heading}>{children}</s-section>` —
  Polaris's native card. Always use this instead of a hand-rolled div.
- `StatTile` renders one of the small icon+label+value tiles seen in every
  page's stats row (`Available credits`, `Total images`, etc). Props:
  `icon` (a **Polaris icon name string**, not JSX — see §5), `label`,
  `value`, `tone` (`"default" | "success" | "warning" | "critical"`,
  colors the icon only). Built from `<s-box>` + `<s-icon>` + `<s-text>`.
  Always lay 4 of these out in a row via the `.app-card-row` CSS class
  (`display:grid; grid-template-columns: repeat(auto-fit, minmax(170px,1fr))`).

### 3.3 `PageHeader.tsx`
Renders a title + subtitle + right-aligned actions **inline in our own
page content** (`.app-banner` flex row). **This is how every page's title
+ header buttons must be built** — see §4.1 for why `s-page`'s own
`primaryAction`/`secondaryActions` must NOT be used.

```tsx
<s-page>
  <PageHeader
    title="Product Images"
    actions={
      <>
        <AppButton href="/app/job-history" variant="secondary">Job history</AppButton>
        <AppButton href="/app/pricing" variant="secondary">Buy credits</AppButton>
        <s-button command="--show" commandFor="resync-modal" variant="primary" icon="refresh">
          Sync from Shopify
        </s-button>
      </>
    }
  />
  ...
</s-page>
```

Button order in the actions row is always: **secondary actions left→right,
primary/black button last (rightmost)**. On pages with a resync/generate
flow, the rightmost primary button is the one that opens a modal (icon
`"refresh"`).

### 3.4 `GettingStarted.tsx`
The dashboard onboarding checklist widget. Props: `steps: {label, detail,
done, action?: {label, href}}[]`, `estimatedMinutes` (default 3).

- Auto-hides itself once every step is `done` (`percent === 100`).
- Has its own dismiss `×` button (local state only, resets on reload —
  there is no persisted "dismissed" flag in the DB).
- Header: trophy icon (`s-icon type="reward"`) in a lavender rounded
  square, title "Get started with ImageAlt", "`N of M steps complete · ~X
  min to finish`" subtitle, percent text + inline progress bar on the
  right.
- Each row is a full-width clickable button (toggles which row is
  "expanded" — only one at a time) with: check circle (**black** when
  done, not purple — `.app-getting-started__check--done` is
  `var(--color-black)`), label (strikethrough when done), detail text
  (always visible, not just when expanded), and a chevron
  (`s-icon type="chevron-down"`/`"chevron-up"`) on the right.
- If a step has `action`, that action button (`<AppButton variant="primary">`)
  only renders when that row is the expanded one.

### 3.5 `Toast.tsx` — `ToastProvider` / `useToast()`
**Uses Shopify's real native App Bridge toast** (`window.shopify.toast.show(message,
{isError})`) — not a custom-built floating div. This was a deliberate choice
after fighting with matching Shopify's own toast position/animation by hand;
native guarantees pixel-identical behavior to every other Shopify app.

- `ToastProvider` must wrap the app once, in `app/routes/app.tsx` around
  `<Outlet />`. It provides `useToast()` via context.
- `useToast().showToast(message, options?)` — `options.isError: true` is
  the only styling control available (red vs default dark). **There is no
  green "success" color** — that's a Shopify platform limitation, not
  something we can restyle. Don't try.
- **Never call `showToast` directly inside a `useEffect` watching only
  `fetcher.data`** — see §3.6, this was a real shipped bug.

### 3.6 `hooks/useFetcherToast.ts`
The correct way to show a toast when a `useFetcher()` action completes.

```tsx
const syncFetcher = useFetcher<{ synced: number }>();
useFetcherToast(syncFetcher, (data) => `Resync complete — ${data.synced} images synced.`);
```

**Why this exists (do not revert to a plain `useEffect`):** a `useEffect`
with `[fetcher.data]` as its only dependency misses the case where
`fetcher.state` flips `submitting → loading → idle` in a *later* render
than the one where `data` was set. The effect fires once while `state` is
still not `"idle"`, does nothing, and then never re-fires when `state`
finally settles because `data` didn't change again. Net effect: the
"start" toast shows, the "complete" toast silently never does. This hook
tracks the transition with a ref instead of relying on `data` alone — use
it for every fetcher that should toast on completion.

For a one-off "action just started" toast (not tied to fetcher
completion), call `showToast("Resync started.")` directly, synchronously,
right after `fetcher.submit(...)`.

### 3.7 `PolarisChoice.tsx` — `Choice`
Wrapper around `<s-choice>` that exists for exactly one reason: **`details`
is not a valid React prop on `<s-choice>`** — Shopify's type layer
explicitly `Omit`s it from the JSX props (same pattern as `s-page`'s action
slots, see §4.1). It has to be set as a real DOM property, so `Choice` sets
it via a ref callback.

```tsx
<s-choice-list
  label="Choose which product status you want to resync"
  name="resyncStatus"
  values={[resyncStatus]}
  onChange={(event: Event) => {
    const value = (event.target as HTMLElement & { values: string[] }).values[0];
    setResyncStatus(value as "active" | "draft" | "all");
  }}
>
  <Choice value="active" details="Resync images from active products">Active products only</Choice>
  <Choice value="draft" details="Resync images from draft products">Draft products only</Choice>
  <Choice value="all" details="Resync images from all products">All products</Choice>
</s-choice-list>
```

`multiple` defaults to `false` on `s-choice-list`, which makes it a radio
group (single value in the `values` array). This is the **only** correct
way to build a radio-button choice UI — never hand-roll `<input
type="radio">` rows with custom CSS (that was tried, reverted, don't
repeat it).

### 3.8 `EmptyState.tsx`
The "no results" state used on every filterable list (Product Images,
Other Images, Job History). Props: `icon` (Polaris icon name, default
`"image"`), `heading`, `description`, `action?` (a `ReactNode`, typically
an `<AppButton>`).

Visual: a soft radial-gradient + diagonal-hatch background
(`.app-empty-state::before`, `z-index: -1` so it sits behind content — if
you ever add a background effect to a container like this, remember
`position:absolute` children with no `z-index` paint **on top of**
in-flow siblings by default; you need a negative z-index to sit behind
them), a 72px icon circle with a subtle purple ring-glow, heading,
description, then the action button. Icon choice by context:
`"image"` for plain "nothing synced", `"plus-circle"` for "nothing
generated yet" (Job History).

### 3.9 `StatusBadge.tsx`
Maps our internal `status` strings to `<s-badge tone="...">`:
```
not_generated → warning   "Not Generated"
processing    → neutral   "Processing"
completed     → success   "Completed"
failed        → critical  "Failed"
```
Always route status through this component — never inline a raw
`<s-badge>` with a hand-picked tone for image/job status.

### 3.10 `Pagination.tsx`
Prev/Next `AppButton`s + "Page X of Y" label, built from `page`,
`totalPages`, `basePath`, `extraParams` (query params to preserve, e.g.
`{ tab }`). Renders `null` when `totalPages <= 1`. Standard pattern for
every paginated table.

### 3.11 `SearchableSelect.tsx`
A combobox for long option lists (currently only the ~80-entry language
list). Local state, filters as you type, closes on blur/select. Don't use
`<s-select>` with 80 `<s-option>`s — use this instead for any list over
~15 items.

### 3.12 `DashboardHeader.tsx`
Dashboard-only header: small brand row (24px purple-square icon +
"PixelAlt AI" text, `.app-dash-header__brand`, with a bottom divider) above
the greeting (`h1`) + subtitle + right-aligned actions. This is distinct
from `PageHeader` — only the Dashboard uses this pattern, every other page
uses `PageHeader`.

### 3.13 `icons.tsx` (legacy — do not add to it)
Hand-drawn SVG icon components (`TrophyIcon`, `ChevronIcon`, `BoxIcon`,
etc.) from before the switch to real Polaris icons. **Dead code, not
imported anywhere.** Use `<s-icon type="...">` (§5) for every new icon
instead of adding here.

---

## 4. Polaris web component gotchas (read before writing a new page)

These are real bugs this project shipped and fixed. Each one cost a full
debugging round-trip — don't repeat them.

### 4.1 `s-page`'s `primaryAction`/`secondaryActions`/`aside`/`breadcrumbActions` are unusable via JSX props
The TypeScript types explicitly `Omit` these four props from the React
version of `<s-page>`. If you pass them as props, it's a compile error;
if you instead render children with `slot="primary-action"` /
`slot="secondary-actions"` attributes (the "correct" web-components way),
**it visually works but Shopify hoists that content into its own outer
admin chrome** — the buttons end up floating in the top-right corner of
the browser, disconnected from the page's own heading, looking like a
separate nav bar. This happened twice in this project (Job History's
"Back to images", then Product/Other Images' 3-button row) before the fix
stuck: **always use `PageHeader` (§3.3) for page title + action buttons,
never `s-page`'s own action slots.** Only exception: nothing so far — if
you think you need the native slot, you probably don't.

### 4.2 `<s-choice>`'s `details` prop
See §3.7 — use the `Choice` wrapper, not raw `<s-choice details="...">`.

### 4.3 `<s-table variant="list">` is NOT a "compact" style — it forces mobile layout
`variant` only accepts `"list" | "auto"` in the JSX type (not `"table"`,
even though the underlying component supports it). `"list"` **always**
renders every row as a stacked label-above-value card, regardless of
viewport width — it is not a visual density option, it's the responsive
mobile fallback. Every real data table in this app must use
`<s-table variant="auto">` (renders as a proper table on desktop,
falls back to the list layout only on narrow screens). This was shipped
broken once (copied blindly from a sibling project's `variant="list"`)
and produced a garbled page where every column header repeated per-row.

### 4.4 Checkbox + thumbnail in a table cell need an explicit flex wrapper
`<input type="checkbox">` followed by `<img>` inside a bare
`<s-table-cell>` stacks vertically by default (block-level children).
Always wrap them: `<div className="app-image-cell">` (flex row, `gap:
0.6rem`, `align-items: center`) — see any image-table row in
`app.product-images.tsx` / `app.other-images.tsx`.

### 4.5 There is no `<s-toast>` component
Don't go looking for one. Use `window.shopify.toast.show()` via
`useToast()` (§3.5) — it's provided by the `app-bridge.js` script that
`AppProvider` already injects (see `app/routes/app.tsx`), not by the
Polaris web-component set.

### 4.6 `s-table`, `s-modal`, `s-choice-list` etc. all need real DOM ids for cross-references
`commandFor="resync-modal"` must match the modal's own `id="resync-modal"`
exactly (both are plain string attributes, no type-checking connects
them — a typo silently does nothing, the button just won't open anything).

---

## 5. Icon system

Every icon in the app is `<s-icon type="<polaris-icon-name>" />` — one of
Shopify's ~500 built-in icon names (kebab-case strings, e.g. `"credit-card"`,
`"images"`, `"check-circle"`, `"alert-triangle"`, `"reward"`,
`"chart-line"`, `"refresh"`, `"clock"`, `"wand"`, `"bolt"`, `"search"`,
`"plus-circle"`, `"chevron-down"`/`"chevron-up"`, `"check"`, `"apps"`,
`"image"`, `"image-alt"`). Never hand-draw a new SVG icon component (see
§3.13) — find the closest existing Polaris icon name instead. Optional
props: `tone` (`"auto"|"neutral"|"info"|"success"|"caution"|"warning"|"critical"`,
colors the icon), `color` (`"base"|"subdued"`), `size` (`"small"|"base"`).

Icon-to-meaning conventions used consistently across the app — reuse these,
don't invent new mappings for the same concept:

| Concept                        | Icon             |
|--------------------------------|------------------|
| Credits / billing               | `credit-card`    |
| Total image count                | `images`         |
| "With alt text" / success        | `check-circle`   |
| "Missing" / warning              | `alert-triangle` |
| Plan / reward tier                | `reward`         |
| Runway / stats / chart            | `chart-line`     |
| Sync action                       | `refresh`        |
| Job history / time                | `clock`          |
| Brand voice / AI writing          | `wand`           |
| Automation                        | `bolt`           |
| Search field                      | `search`         |
| Empty state — "nothing generated" | `plus-circle`    |
| Empty state — "nothing synced"    | `image`          |
| Settings / gear                    | `settings`       |

---

## 6. Page-level conventions

### 6.1 List pages (Product Images, Other Images)
Standard structure top to bottom:
1. `PageHeader` — title, then secondary buttons (Job history, Buy
   credits), then primary sync button that opens a resync modal.
2. Plain `<s-paragraph>` — "`N images across your store`".
3. Conditional banner: green success banner if nothing's missing, blue
   info banner if nothing's synced yet, nothing otherwise.
4. `.app-card-row` of 4 `StatTile`s: Available credits, Total images,
   With alt text, Missing alt text.
5. A `Card` containing: filter tab row (see 6.3) + the data table (or
   `EmptyState` if zero rows) + `Pagination`.
6. "Bulk actions" `Card` with the "Generate for selected (N)" button.
7. Two `<s-modal>`s at the bottom of the JSX: `resync-modal` (product
   status choice — Product Images only, Other Images has no status
   concept so its sync button is a direct action) and `generate-modal`
   (AI vs Template choice, shared by single-row and bulk generate,
   see §6.4).

### 6.2 Status filter tabs
Six filters, always in this order, as `AppButton` pills (`variant="primary"`
for the active one, `"secondary"` otherwise), each a plain link to
`?tab=<value>`: **All, Containing Alt Text, Missing Alt Text, Processing,
Completed, Failed**. Wrapped in `<s-stack direction="inline"
gap="small-200">` inside `.app-search-bar` (a light-grey rounded
container). Job History uses the same pill pattern but with **counts**
next to each label (`All · 12`) and only four tabs: All, Running,
Completed, Failed — counts come from separate `prisma.count()` calls per
status in the loader, not from filtering the already-paginated list
client-side.

### 6.3 Compact search box (Job History only, so far)
`.app-search-compact` — a small bordered pill (not a full `<s-text-field>`
with visible label) containing a `<s-icon type="search" color="subdued"
size="small">` and a bare `<input>`, right-aligned opposite the filter
tabs in `.app-tabs-row` (`justify-content: space-between`). Use this
pattern (not a labeled Polaris text field) anywhere a search box needs to
sit inline next to filter pills rather than stacked above a table.

### 6.4 The Generate modal (AI vs Template)
Single shared `<s-modal id="generate-modal">` per page, driven by React
state (`pendingGenerateIds: string[]`, `generateMode: "ai" | "template"`).
Both the per-row "Generate" button and the bulk "Generate for selected"
button call the same `openGenerateModal(ids)` function before opening the
modal (`onClick` + `command="--show"` on the same `<s-button>`). Modal
body: image-count + credit-cost summary (`~N credits` for AI, `Free — no
credits used` for Template), the `Choice`/`s-choice-list` AI-vs-Template
picker, a note linking to Settings, and a single "Generate" button that
calls `runGenerate()` then closes via `command="--hide"` on the same
button.

### 6.5 Settings page layout
Two-column grid (`.app-settings-layout`, `220px 1fr`, collapses to one
column under 720px): left column = vertical tab nav card (`Brand voice` /
`Automation`, icon + label rows, active one gets a `#f1f1f4` background)
plus a separate "Available credits" card below it; right column = the
active tab's `Card`. Section header inside the card: icon + title, with a
`Growth+` badge (`.app-plan-badge`, amber) and an `Upgrade to enable →`
link (`.app-upgrade-link`) next to the title when the feature is gated —
every field in a gated section is `disabled` and the Save button is
replaced by the upgrade link instead of a disabled Save button.

### 6.6 Pricing page layout
Top to bottom: intro paragraph → store-size info `Card` ("Your store has
N images...") → "pick a plan" `Card` → Monthly/Annual toggle
(`.app-billing-toggle`, pill switch, Annual has a gradient "Save 2
months" badge) → `.app-plan-cards` grid of 3 cards (Starter / Growth /
Scale) → exploring-the-free-plan footnote → "buy credits" `Card` →
`.app-faq-grid` of 3 plain `Card`s (no shared heading box — each FAQ
question is its own card).

Plan card anatomy (`.app-plan-card`): optional ribbon badge centered on
the top edge (`"Most popular"` gradient ribbon on Growth,
`"Save ≈50%"` green ribbon on Scale — see `.app-plan-card__ribbon`), plan
name, big price (`$` + number + `/year` or `/mo`), small "`N,NNN
credits/yr · $X.XX/mo`" line, a green "Save $X/year vs one-time" pill
(annual view only), a feature checklist (`check` icon + text), then the
CTA (`AppButton variant="gradient"` only on Growth, `"primary"` on
Starter/Scale, disabled + "Current plan" label if it's the active tier).

**Note:** the Monthly/Annual toggle currently only changes displayed
numbers — actual billing is wired to Shopify's real Billing API for the
*annual* interval only (see `app/lib/shopify-billing.server.ts`). A
"Choose Starter" click always requests the annual subscription regardless
of which toggle position is showing. Wire up real monthly plans in
`shopify.server.ts`'s `billing` config before making the toggle
functionally change what gets charged.

**Deliberately not built:** a merchant-reviews / star-ratings /
"Trusted by N,NNN merchants" section. Any such section would be
fabricated testimonials attributed to fake people — build it for real
once there are actual reviews to show, never with placeholder names.

### 6.7 Job History page layout
`PageHeader` (title + "Back to images" secondary button only — no
primary action here) → 4 `StatTile`s (Jobs run, Success rate, Images
processed, Credits used) → `Card` with `.app-tabs-row` (filter pills +
compact search, see §6.2/6.3) → table (or `EmptyState` with `plus-circle`
icon and a gradient "Start generating" button linking to Product Images)
→ `Pagination`.

---

## 7. Data model quick reference (`prisma/schema.prisma`)

- `ProductImage` / `OtherImage.status`: `"not_generated" | "processing" |
  "completed" | "failed"` — always route through `StatusBadge` (§3.9),
  never inline.
- `GenerationJob.kind`: `"sync" | "ai_generate"` — label via `KIND_LABEL`
  map (`Sync` / `AI Generate`) in each route file.
- `ShopBilling.planTier`: `"free" | "starter" | "growth" | "scale"`.
  Brand voice / automation settings are gated behind `growth`/`scale` via
  `canUseBrandVoice()` in `app/lib/billing.server.ts`.
- Credits: 1 credit = 1 AI generation. Template-mode generation and manual
  edits are always free (no `deductCredit` call). This must stay true
  everywhere generation happens — it's stated explicitly in the Pricing
  FAQ, so the code has to match the copy.

---

## 8. Applying this to a new app

1. Copy `app/components/`, `app/hooks/useFetcherToast.ts`, and the
   relevant chunks of `app/styles/theme.css` (skip `icons.tsx`, §3.13).
2. Copy the page-level structure from §6 for whatever page types the new
   app needs (list page, settings page, pricing page).
3. Read §4 (gotchas) *before* writing a single `<s-page>` — every one of
   those bugs will resurface if skipped.
4. Pick new icon names from Shopify's actual icon set for new concepts,
   but keep the icon-to-meaning table in §5 for the concepts that repeat
   (credits, images, success, warning, etc.) so every Kourify app reads
   the same at a glance.
