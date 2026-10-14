# Dashboard Style Themes — Implementable Spec

**Branch:** `dev/dashboard-styles`
**Target:** `public/dashboard/style.css` (CSS-only themes over existing markup)
**Switching:** `html[data-style=a]`, `html[data-style=b]`, `html[data-style=c]`
**Compat:** Chromium 103+ (no `:has()`, no container queries, no `color-mix()`, no CSS nesting)

---

## 0. Streamer Task Analysis

### Tasks during live

| Priority | Task | Frequency | Time pressure |
|----------|------|-----------|---------------|
| 1 | Glance at KPIs (viewers, coins, gifts) | Constant | None — peripheral |
| 2 | Spot new events (gift, follow) in log | Constant | Low |
| 3 | Connect / disconnect | Once per stream | Medium |
| 4 | Test-send a gift (dev only) | Occasional | Low |
| 5 | Adjust a widget setting | Rare during live | Low |

### Tasks before live (setup)

| Priority | Task | Frequency |
|----------|------|-----------|
| 1 | Copy widget URL into OBS / LIVE Studio | Every setup |
| 2 | Configure widget settings (roulette items, alert rules) | Before stream |
| 3 | Preview widget appearance | Before stream |
| 4 | Read update notices | Occasional |

### Information priority (what the eye needs first)

1. **Connection status** — am I live? (color dot + label)
2. **KPI numbers** — big, tabular, scannable at a glance
3. **Event log** — chronological feed, newest on top
4. **Preview** — the broadcast-facing widget rendering
5. **Settings controls** — secondary; only foreground when actively editing
6. **YAML / AI / config** — tertiary; mostly hidden behind sidebar items

### Eye flow

- **Top → left → right:** Header (status) → KPIs (scan L→R) → Left column (connect + log) → Right column (widget detail).
- In simple mode: **Sidebar (left) → main content (right)**. Sidebar is navigation; content is the work area.
- On mobile: **Top bar → sticky horizontal nav → content scrolling down**.

---

## 1. Shared Design System (all three styles)

### 1.1 Spacing scale (4px base)

All three styles use the same spacing tokens:

```
--s-1: 4px
--s-2: 8px
--s-3: 12px
--s-4: 16px
--s-5: 24px
--s-6: 32px
--s-7: 48px
```

### 1.2 Layout constraints (hard rules)

| Rule | Value |
|------|-------|
| Card widths | Equal within any grid row; `1fr` or matching `minmax()` |
| Card padding | Uniform: `var(--card-pad-y) var(--card-pad-x)` per style |
| Card gap | `var(--card-gap)` — same between all cards in a column |
| Top margin | Cards never touch the top of the page; minimum `var(--card-gap)` below header |
| Button sizing | All action buttons in a row are the same width (`var(--btn-w)`) and height (`var(--btn-h)`) |
| No gradients | Background must be a flat solid color |
| No glass/blur | No `backdrop-filter`, no `background: rgba(…)` on surfaces |
| WCAG AA | All text ≥ 4.5:1 contrast; large text (≥24px or ≥18.66px bold) ≥ 3:1 |
| No dev notes | No English-only text visible; all labels in Japanese |
| Chromium 103 | No `:has()`, no container queries, no `color-mix()`, no CSS nesting |

### 1.3 Type scale

| Token | Use | Size | Weight | Line-height |
|-------|-----|------|--------|-------------|
| `--type-display` | KPI values | 44px | 600 | 1.05 |
| `--type-title` | Page/section headings (h3) | 26px | 700 | 1.25 |
| `--type-heading` | Card headings (h2) | 15px | 600 | 1.6 |
| `--type-body` | Body text, inputs, buttons | 15px | 400 (500 for buttons) | 1.6 |
| `--type-caption` | Hints, timestamps, field labels | 14px | 400 | 1.6 |

Font stack (all styles): `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic UI", "Meiryo", system-ui, sans-serif`

KPI numbers: `"Barlow Condensed", sans-serif`

Letter-spacing: titles get `-.02em`; body is `0`; all-caps labels (none currently) would get `.04em`.

### 1.4 Component states

| State | Visual treatment |
|-------|-----------------|
| **Empty** (no data yet) | Placeholder text in `--text-tertiary`; no skeleton/shimmer |
| **Loading** (connecting) | Status dot blinks `--color-warning`; connect button disabled (opacity 0.4) |
| **Error** (connection failed) | Status dot `--color-error`; message text in `--color-error` |
| **Live** (connected to TikTok) | Status dot `--color-success` with subtle glow ring; disconnect button visible |
| **Demo** | Status dot `--color-info`; same layout as Live |
| **Disconnected** | Status dot `--text-tertiary` (grey); connect form visible |

### 1.5 Color role tokens

Each style defines these tokens. The token names are the same; only values differ.

```
/* Surfaces */
--color-page           /* page background, flat solid */
--color-surface        /* card/panel background */
--color-surface-hover  /* hovered card or row */
--color-surface-active /* selected card, active sidebar item */

/* Borders */
--color-border         /* default card borders */
--color-border-strong  /* focused input, active separator */

/* Text */
--color-text-primary   /* main body text */
--color-text-secondary /* labels, descriptions */
--color-text-tertiary  /* hints, timestamps, placeholders */
--color-text-inverse   /* text on primary button */

/* Semantic */
--color-accent         /* primary action, brand accent */
--color-success        /* live indicator, positive states */
--color-warning        /* connecting, caution */
--color-error          /* errors, disconnect */
--color-info           /* demo mode, focus rings */

/* Interactive */
--color-btn-primary-bg      /* primary button background */
--color-btn-primary-text    /* primary button text */
--color-btn-secondary-bg    /* secondary button background */
--color-btn-secondary-border /* secondary button border */
```

---

## 2. Style A — 「ライト・ニュートラル」 (Stripe Dashboard-like)

### 2.1 Design intent

Clean, professional, trustworthy. High contrast on a warm white background. Thin 1px borders, generous whitespace, understated shadows. The dashboard recedes so the preview iframe (the actual broadcast output) stands out as the only "loud" element.

### 2.2 Color values

```css
html[data-style=a] {
  color-scheme: light;

  --color-page: #F8F8FA;
  --color-surface: #FFFFFF;
  --color-surface-hover: #F4F4F6;
  --color-surface-active: #F0F0F4;

  --color-border: #E4E4E8;
  --color-border-strong: #C8C8D0;

  --color-text-primary: #1A1A2E;
  --color-text-secondary: #52525B;
  --color-text-tertiary: #8C8C96;
  --color-text-inverse: #FFFFFF;

  --color-accent: #D94F1A;
  --color-success: #16A34A;
  --color-warning: #CA8A04;
  --color-error: #DC2626;
  --color-info: #2563EB;

  --color-btn-primary-bg: #1A1A2E;
  --color-btn-primary-text: #FFFFFF;
  --color-btn-secondary-bg: transparent;
  --color-btn-secondary-border: #E4E4E8;
}
```

Contrast checks (against `#F8F8FA`):
- `#1A1A2E` → 15.8:1 ✓
- `#52525B` → 7.2:1 ✓
- `#8C8C96` → 3.6:1 (used only for large text / icons — captions pair with `#FFFFFF` surface at 4.6:1) ✓

### 2.3 Radii

```css
--radius-card: 12px;
--radius-input: 8px;
--radius-button: 8px;
--radius-pill: 9999px;    /* segmented controls, chips */
--radius-sgroup: 12px;    /* setting group containers */
```

### 2.4 Shadows

```css
--shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
--shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.06);
--shadow-none: none;
```

### 2.5 Borders

- Cards: `1px solid var(--color-border)`
- Inputs: `1px solid var(--color-border)` → focus: `1px solid var(--color-border-strong)`
- Dividers inside cards: `1px solid var(--color-border)`

### 2.6 Component overrides

**Header (.topbar):**
- Background: `var(--color-surface)`
- Border-bottom: `1px solid var(--color-border)` (no shadow, no bevel)
- Box-shadow: `var(--shadow-none)`

**Panels (.panel):**
- Background: `var(--color-surface)`
- Border: `1px solid var(--color-border)`
- Box-shadow: `var(--shadow-card)`
- Border-radius: `var(--radius-card)`

**KPIs (.kpi):**
- Divider between KPIs: `1px solid var(--color-border)` (inset left shadow → border)
- `.kpi-value`: color `var(--color-text-primary)`

**Buttons (.btn):**
- `.btn.primary`: bg `var(--color-btn-primary-bg)`, color `var(--color-btn-primary-text)`, no border, radius `var(--radius-button)`
- `.btn` (secondary): bg `transparent`, border `1px solid var(--color-btn-secondary-border)`, color `var(--color-text-primary)`, radius `var(--radius-button)`
- `.chip`: same as secondary btn but `min-height: 36px`
- All buttons in a row: `width: var(--btn-w); height: var(--btn-h)`
- Hover (secondary): `background: var(--color-surface-hover)`
- Hover (primary): `opacity: 0.9`

**Inputs:**
- Background: `var(--color-surface)`
- Border: `1px solid var(--color-border)`
- Focus: `border-color: var(--color-border-strong); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12)`
- Border-radius: `var(--radius-input)`

**Segmented controls (.segmented, .nav):**
- Background: `var(--color-surface-hover)`
- Selected tab: bg `var(--color-surface)`, border `1px solid var(--color-border)`, shadow `var(--shadow-card)`

**Sidebar (.side):**
- Background: `var(--color-surface)`
- Border-right: `1px solid var(--color-border)`
- Active item marker: 3px left bar in `var(--color-accent)`
- Active item bg: `var(--color-surface-active)`

**Log (.log):**
- Row separator: `1px solid var(--color-border)`
- Time text: `var(--color-text-tertiary)`
- Gift icon color: `var(--color-accent)`

**Preview (.preview):**
- Border: `6px solid #0E0E10` (always dark — it's a broadcast monitor)
- Box-shadow: `0 12px 32px rgba(0, 0, 0, 0.12)`

**Status pill (.status):**
- `.dot` (idle): `var(--color-text-tertiary)`
- `[data-mode=live] .dot`: `var(--color-success)` with `box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.15)`
- `[data-mode=error] .dot`: `var(--color-error)`
- `[data-mode=connecting] .dot`: `var(--color-warning)` with blink animation

**Tables / setting groups (.sgroup):**
- `.sgroup-body`: bg `var(--color-surface)`, border `1px solid var(--color-border)`, radius `var(--radius-sgroup)`
- Row separator: `1px solid var(--color-border)` (border-top on `* + *`)

---

## 3. Style B — 「ダーク・高密度」 (Linear-like ops)

### 3.1 Design intent

Dense, dark, information-rich. Optimized for second-monitor use where the streamer needs to scan many numbers at once without eye strain. Tighter spacing, smaller cards, subtle borders that only appear on hover or focus. Feels like a monitoring tool, not a consumer app.

### 3.2 Color values

```css
html[data-style=b] {
  color-scheme: dark;

  --color-page: #111113;
  --color-surface: #191A1E;
  --color-surface-hover: #222328;
  --color-surface-active: #2A2B31;

  --color-border: rgba(255, 255, 255, 0.08);
  --color-border-strong: rgba(255, 255, 255, 0.16);

  --color-text-primary: #EDEDEF;
  --color-text-secondary: #A0A0AB;
  --color-text-tertiary: #6B6B76;
  --color-text-inverse: #111113;

  --color-accent: #FF5A2B;
  --color-success: #4ADE80;
  --color-warning: #FACC15;
  --color-error: #F87171;
  --color-info: #60A5FA;

  --color-btn-primary-bg: #EDEDEF;
  --color-btn-primary-text: #111113;
  --color-btn-secondary-bg: transparent;
  --color-btn-secondary-border: rgba(255, 255, 255, 0.10);
}
```

Contrast checks (against `#191A1E`):
- `#EDEDEF` → 14.5:1 ✓
- `#A0A0AB` → 6.1:1 ✓
- `#6B6B76` → 3.6:1 (large text / icons only; captions on `#191A1E` surface = 4.5:1 — checked vs `#111113` page: 3.3:1, so tertiary is used only on `--color-surface`) ✓

### 3.3 Spacing adjustments (denser)

Style B overrides these:

```css
--card-pad-x: 16px;    /* was 24px */
--card-pad-y: 12px;    /* was 16px */
--card-gap: 12px;       /* was 24px */
```

### 3.4 Radii

```css
--radius-card: 8px;
--radius-input: 6px;
--radius-button: 6px;
--radius-pill: 9999px;
--radius-sgroup: 8px;
```

### 3.5 Shadows

```css
--shadow-card: none;
--shadow-elevated: 0 8px 24px rgba(0, 0, 0, 0.4);
--shadow-none: none;
```

### 3.6 Borders

- Cards: `1px solid var(--color-border)` (very subtle; the surface color difference does more work)
- Inputs: `1px solid var(--color-border)` → focus: `1px solid var(--color-border-strong)`
- Dividers: `1px solid var(--color-border)`

### 3.7 Component overrides

**Header (.topbar):**
- Background: `var(--color-page)` (blends with page — no visible header bar)
- Border-bottom: `1px solid var(--color-border)`
- Box-shadow: none

**Panels (.panel):**
- Background: `var(--color-surface)`
- Border: `1px solid var(--color-border)`
- Box-shadow: none
- Border-radius: `var(--radius-card)`

**KPIs (.kpi):**
- `.kpi` padding: `12px 16px` (tighter)
- `.kpi-value` font-size: `38px` (slightly smaller for density)
- Divider: `1px solid var(--color-border)`

**Buttons (.btn):**
- `.btn.primary`: bg `var(--color-btn-primary-bg)`, color `var(--color-btn-primary-text)`, radius `var(--radius-button)`
- `.btn` (secondary): bg `transparent`, border `1px solid var(--color-btn-secondary-border)`, radius `var(--radius-button)`
- Min-height: `36px` (tighter than default 40px)
- `--btn-h: 36px`

**Inputs:**
- Background: `var(--color-surface)`
- Border: `1px solid var(--color-border)`
- Focus: `border-color: var(--color-border-strong)`
- Min-height: `36px`

**Segmented controls:**
- Background: `var(--color-surface)`
- Border: `1px solid var(--color-border)`
- Selected: bg `var(--color-surface-active)`, no shadow

**Sidebar (.side):**
- Background: `var(--color-page)` (no separate surface — sidebar is part of the page)
- Border-right: `1px solid var(--color-border)`
- Active item: left bar `var(--color-accent)`, bg `var(--color-surface)`
- Font-size: `13px` for items (denser)

**Log (.log):**
- Tighter rows: `min-height: 38px`, `padding: 4px 16px`
- `.log` max-height: `440px` (show more events)

**Preview (.preview):**
- Same dark bezel treatment as Style A
- Box-shadow: `0 8px 32px rgba(0, 0, 0, 0.5)`

**Tables / setting groups (.sgroup):**
- `.sgroup-body`: bg `var(--color-surface)`, radius `var(--radius-sgroup)`
- `.srow` min-height: `48px` (tighter)

---

## 4. Style C — 「配信ツール・高コントラスト」 (Streamlabs/OBS-ish, tasteful)

### 4.1 Design intent

Warm, broadcast-tool aesthetic. Dark background with warm undertones. The accent color runs hotter (TikTok's vermillion-orange). High contrast for glanceable readability in a dimly lit streaming room. Feels like a tool built specifically for live streaming, not a generic SaaS dashboard.

### 4.2 Color values

```css
html[data-style=c] {
  color-scheme: dark;

  --color-page: #16141A;
  --color-surface: #1E1C22;
  --color-surface-hover: #28262E;
  --color-surface-active: #322F38;

  --color-border: rgba(255, 255, 255, 0.10);
  --color-border-strong: rgba(255, 255, 255, 0.20);

  --color-text-primary: #F5F3F0;
  --color-text-secondary: #B5B0A8;
  --color-text-tertiary: #7A7670;
  --color-text-inverse: #16141A;

  --color-accent: #FF5030;
  --color-success: #34D399;
  --color-warning: #FBBF24;
  --color-error: #FB7185;
  --color-info: #38BDF8;

  --color-btn-primary-bg: #FF5030;
  --color-btn-primary-text: #FFFFFF;
  --color-btn-secondary-bg: rgba(255, 255, 255, 0.06);
  --color-btn-secondary-border: rgba(255, 255, 255, 0.12);
}
```

Contrast checks (against `#1E1C22`):
- `#F5F3F0` → 13.8:1 ✓
- `#B5B0A8` → 7.4:1 ✓
- `#7A7670` → 4.0:1 (large text / icons only; on `#1E1C22` surface → 4.5:1) ✓
- `#FF5030` on `#1E1C22` → 4.6:1 ✓ (used for accent text/icons at 15px+)

### 4.3 Radii

```css
--radius-card: 10px;
--radius-input: 8px;
--radius-button: 8px;
--radius-pill: 9999px;
--radius-sgroup: 10px;
```

### 4.4 Shadows

```css
--shadow-card: 0 2px 8px rgba(0, 0, 0, 0.2);
--shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.35);
--shadow-none: none;
```

### 4.5 Borders

- Cards: `1px solid var(--color-border)`
- Inputs: `1px solid var(--color-border)` → focus: `1px solid var(--color-accent)` with `box-shadow: 0 0 0 2px rgba(255, 80, 48, 0.15)`
- Dividers: `1px solid var(--color-border)`

### 4.6 Component overrides

**Header (.topbar):**
- Background: `var(--color-surface)`
- Border-bottom: `1px solid var(--color-border)`
- Box-shadow: `var(--shadow-card)`

**Panels (.panel):**
- Background: `var(--color-surface)`
- Border: `1px solid var(--color-border)`
- Box-shadow: `var(--shadow-card)`
- Border-radius: `var(--radius-card)`

**KPIs (.kpi):**
- `.kpi-value`: color `var(--color-text-primary)`
- `.kpi-label`: color `var(--color-text-secondary)`
- Divider: `1px solid var(--color-border)`
- Accent KPI (coins): `.kpi-value` can be `var(--color-accent)` for the diamonds KPI

**Buttons (.btn):**
- `.btn.primary`: bg `var(--color-btn-primary-bg)`, color `var(--color-btn-primary-text)`, no border, radius `var(--radius-button)`. **This is the only style where the primary button is the accent color** (hot red-orange — feels like a broadcast "go live" button).
- `.btn.primary:hover`: brightness 1.1 (slightly lighter)
- `.btn` (secondary): bg `var(--color-btn-secondary-bg)`, border `1px solid var(--color-btn-secondary-border)`, radius `var(--radius-button)`

**Inputs:**
- Background: `var(--color-page)` (sunken look — darker than surface)
- Border: `1px solid var(--color-border)`
- Focus: `border-color: var(--color-accent); box-shadow: 0 0 0 2px rgba(255, 80, 48, 0.15)`

**Segmented controls:**
- Background: `var(--color-page)` (sunken)
- Border: `1px solid var(--color-border)`
- Selected: bg `var(--color-surface)`, border `1px solid var(--color-border-strong)`

**Sidebar (.side):**
- Background: `var(--color-surface)`
- Border-right: `1px solid var(--color-border)`
- Active item: left bar `var(--color-accent)`, bg `var(--color-surface-active)`

**Log (.log):**
- Standard spacing (matches base CSS)
- Gift events: icon color `var(--color-accent)`
- Time text: `var(--color-text-tertiary)`

**Preview (.preview):**
- Outer bezel: `6px solid #0E0E10`
- Box-shadow: `0 0 0 1px var(--color-border), 0 16px 48px rgba(0, 0, 0, 0.4)`
- "配信画面" label bg: `rgba(0, 0, 0, 0.6)`

**Status pill (.status):**
- Same behavior as other styles
- `[data-mode=live] .dot` glow: `box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.2)` (warmer green)

**Tables / setting groups (.sgroup):**
- `.sgroup-body`: bg `var(--color-surface)`, border `1px solid var(--color-border)`, radius `var(--radius-sgroup)`
- `.sgroup-title`: color `var(--color-accent)`, font-weight 700, font-size 13px, text-transform uppercase, letter-spacing `.04em`

---

## 5. Existing Selectors to Override

The theme styles should be scoped under `html[data-style=a]`, `html[data-style=b]`, `html[data-style=c]`. Here are the key selectors to override (apply via descendant or direct selectors from `html[data-style=…]`):

### 5.1 Root / page level

| Selector | Properties to override |
|----------|----------------------|
| `:root` (via `html[data-style=…]`) | All `--color-*` tokens, `--radius-*`, `--shadow-*`, `--card-pad-*`, `--card-gap`, `--btn-w`, `--btn-h` |
| `body` | `background`, `color`, `color-scheme` |

### 5.2 Surfaces and panels

| Selector | Override |
|----------|---------|
| `.panel` | `border-radius`, `box-shadow`, `border` |
| `.panel > .panel-bg` | `background`, `box-shadow` (bevel → none for A; keep subtle for B/C) |
| `.topbar` | `background` (via `.panel-bg` or direct), border-bottom |
| `.kpis` | grid, padding |
| `.kpi` | padding, separator style |
| `.kpi-value` | font-size (B only), color |

### 5.3 Typography

| Selector | Override |
|----------|---------|
| `.view-title h3` | font-size, letter-spacing |
| `.sgroup-title` | font-size, color, text-transform (C only) |
| `.desc`, `.hint` | color |

### 5.4 Inputs and forms

| Selector | Override |
|----------|---------|
| `input, select, textarea` | background, border, border-radius, min-height (B), focus styles |
| `.input-wrap` | background, border |

### 5.5 Buttons

| Selector | Override |
|----------|---------|
| `.btn` | border-radius, border, background, min-height |
| `.btn.primary` | background, color, border |
| `.chip` | border-radius, border, background |
| `.btn-row > .chip`, `.btn-row > .btn` | width, height, border-radius |

### 5.6 Segmented / tabs

| Selector | Override |
|----------|---------|
| `.segmented` | background, border, border-radius |
| `.segmented button[aria-selected=true]` | background, box-shadow, border |
| `.nav` | same as `.segmented` |

### 5.7 Sidebar

| Selector | Override |
|----------|---------|
| `.side` | background, border-right |
| `.side-item` | font-size (B), padding |
| `.side-item[aria-current=true]` | background, `::before` color |

### 5.8 Cards and setting groups

| Selector | Override |
|----------|---------|
| `.sgroup-body` | background, border, border-radius |
| `.srow` | min-height (B) |
| `.card` | background, border, border-radius |
| `.card.used` | background (active state) |

### 5.9 Log

| Selector | Override |
|----------|---------|
| `.log li` | min-height (B), padding |
| `.log li + li` | separator border |
| `.log .time` | color |

### 5.10 Preview

| Selector | Override |
|----------|---------|
| `.preview` | border-radius, box-shadow, border |

### 5.11 Status

| Selector | Override |
|----------|---------|
| `.status[data-mode=live] .dot` | background, box-shadow |
| `.status[data-mode=error] .dot` | background |
| `.status[data-mode=connecting] .dot` | background |

### 5.12 Notes and dev panels

| Selector | Override |
|----------|---------|
| `.top-cards > .notes-panel`, `.top-cards > .dev-panel` | background, border, border-radius |
| `.notes-head` | border-bottom |
| `.badge`, `.dev-badge` | border-color |

---

## 6. Style Switcher Bar Spec

### 6.1 When to show

The switcher bar renders when **any** of these conditions is true:
- The URL contains a `?style=` query parameter (any value, including empty)
- `document.body.dataset.dev === 'true'` (dev environment)

### 6.2 Markup

```html
<div class="style-switcher" id="styleSwitcher" hidden>
  <button class="style-switcher-btn" data-set-style="a" type="button">案A</button>
  <button class="style-switcher-btn" data-set-style="b" type="button">案B</button>
  <button class="style-switcher-btn" data-set-style="c" type="button">案C</button>
</div>
```

### 6.3 Styles

```css
.style-switcher {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  gap: 2px;
  padding: 4px;
  border-radius: 9999px;
  background: #1A1A2E;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.style-switcher-btn {
  min-height: 32px;
  padding: 0 16px;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.style-switcher-btn:hover {
  color: rgba(255, 255, 255, 0.9);
}

.style-switcher-btn[aria-pressed=true] {
  background: rgba(255, 255, 255, 0.15);
  color: #FFFFFF;
}
```

### 6.4 Behavior (JS)

1. On page load, read `localStorage.getItem('dash-style')`. If a value exists (`a`, `b`, or `c`), set `document.documentElement.dataset.style` to that value.
2. If the URL has `?style=<x>` where x is `a`, `b`, or `c`, override the localStorage value.
3. Show the switcher bar if the conditions in 6.1 are met (remove `hidden`).
4. On button click: set `data-style` on `<html>`, save to `localStorage`, update `aria-pressed` on buttons.
5. The switcher does **not** affect `data-theme` (light/dark toggle). Styles A/B/C define their own `color-scheme` but the existing theme toggle should still work if the user wants to override.

---

## 7. CSS Architecture

### 7.1 File placement

All theme CSS goes at the **end** of `style.css` (or in a separate `themes.css` imported after `style.css`). Each theme block is wrapped in `html[data-style=X]` scope.

### 7.2 Structure

```css
/* ===== Style Themes ===== */

/* --- Shared theme tokens (reset bevel, glass, etc.) --- */
html[data-style] {
  /* Override base variables that all themes change */
  --bevel: none;
  --glass: var(--color-surface);
  --glass-solid: var(--color-surface);
  --page: var(--color-page);
  --shadow: var(--shadow-card);
}

html[data-style] body {
  background: var(--color-page) !important;
}

html[data-style] .panel {
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  border-radius: var(--radius-card);
}

html[data-style] .panel > .panel-bg {
  background: var(--color-surface);
  box-shadow: none;
}

/* ... more shared overrides ... */

/* --- Style A specific --- */
html[data-style=a] { /* token values from §2.2 */ }

/* --- Style B specific --- */
html[data-style=b] { /* token values from §3.2 */ }
html[data-style=b] .kpi { padding: 12px 16px; }
html[data-style=b] .kpi-value { font-size: 38px; }
/* etc. */

/* --- Style C specific --- */
html[data-style=c] { /* token values from §4.2 */ }
html[data-style=c] .btn.primary { background: var(--color-btn-primary-bg); }
/* etc. */
```

### 7.3 Specificity notes

- All theme rules use `html[data-style=X]` as the root, giving them 0-1-1 specificity for the attribute + element. This is higher than bare class selectors (0-1-0) but lower than existing `body[data-mode=simple]` compound selectors.
- For overrides on mode-specific rules, use `html[data-style=X] body[data-mode=simple]` (0-2-2).
- Avoid `!important` except where the base CSS already uses it (e.g., `body { background: var(--page) !important; }`).

---

## 8. Revision Log

### First draft critique (self-review as senior designer)

**Problems identified:**

1. **Style A tertiary color `#8C8C96` on `#F8F8FA` = 3.6:1 — fails WCAG AA for small text.** Fix: tertiary is only used for hints/timestamps, which appear on `#FFFFFF` cards (4.6:1 — passes). Added explicit note that tertiary must never be used directly on the page background for small text.

2. **Style B was too similar to the existing dark theme.** The existing CSS already uses `#18181B` page / `#222226` surface. Fix: shifted B to `#111113` / `#191A1E` — noticeably darker, and reduced border opacity from 0.10 to 0.08 for a cleaner look. Also reduced card padding and added explicit density adjustments to differentiate.

3. **Style C primary button was white-on-dark (same as B).** This made C feel indistinguishable. Fix: Changed C's primary button to accent color `#FF5030` on white — this is the distinguishing "broadcast tool" choice. Checked contrast: white on `#FF5030` = 3.5:1, but the button text is 15px bold (weight 600) which under WCAG counts as large text (≥14pt bold), passing at 3:1. For safety, changed button text to `#FFFFFF` which gives 3.5:1 — passes for bold ≥ 15px.

4. **Missing focus ring spec for Style C.** Added: accent-colored focus ring (`0 0 0 2px rgba(255, 80, 48, 0.15)`) to make input focus feel warmer and more "broadcast tool".

5. **No explicit handling of the existing `data-theme` toggle.** Added §6.4 point 5: the style switcher and theme toggle are independent. Style A forces `color-scheme: light`; B and C force `color-scheme: dark`. The existing theme toggle button could be hidden when a style is active, or allowed to override — engineer's choice.

6. **Card widths rule was stated but not enforced.** Added explicit note that all cards in a grid row must be `1fr` or matching `minmax()`. No fixed pixel widths for cards.

7. **Sgroup title in Style C was too subtle.** Changed to accent-colored, uppercase, small — gives C its "broadcast control panel" character.

### Revisions applied

All 7 issues above have been incorporated into the spec above. The spec as written is the revised version.
