# Visual gate hardening

The visual gate compares a screenshot per route and viewport against a
committed baseline. Pixel comparison is inherently flaky on dynamic pages, so
the gate layers several stabilizers. This document describes the options and
how to combine them.

## Stabilizers applied to every capture

- `reducedMotion: "reduce"` emulation plus a color scheme pin.
- An injected stylesheet that disables animations, transitions, and the caret.
- `readySelector` wait, then `document.fonts.ready` before the screenshot.

These apply unconditionally. The options below are opt-in.

## New options

### `routes[].waitUntil`

Overrides the navigation lifecycle event for `page.goto`. Default
`domcontentloaded`. Allowed values: `load`, `domcontentloaded`,
`networkidle`, `commit`.

Use `networkidle` for routes whose content settles only after async fetches
finish. It can wait up to the navigation timeout on pages with persistent
connections, so prefer `readySelector` on late content when possible.

```yaml
routes:
  - name: home
    path: /
    readySelector: main
    waitUntil: networkidle
```

### `visual.maskSelectors`

CSS selectors whose elements are painted over before the screenshot is
written. Masked regions do not participate in the pixel diff. Selectors that
resolve to no element, or to a hidden element, are skipped instead of failing.

```yaml
visual:
  maskSelectors:
    - "[data-ad-slot]"
    - ".timestamp"
```

### `visual.freezeTime`

An ISO 8601 instant. Before navigation, FPG freezes page clocks at that time
using `page.clock` (`install` + `setFixedTime`). On runtimes without
`page.clock` support it falls back to an `addInitScript` that fixes
`Date.now()` and the `Date` constructor.

```yaml
visual:
  freezeTime: "2026-01-01T00:00:00Z"
```

### `visual.ariaSnapshot` and `visual.ariaSnapshotMode`

When `ariaSnapshot: true`, FPG captures `page.locator("body").ariaSnapshot()`
per route and viewport and compares it as text.

- `fpg baseline update` writes `<stem>.aria.yml` into `baselineDir` and
  records it in `manifest.json` alongside the PNG entries.
- `fpg compare` and `fpg verify` diff the snapshot against the baseline. A
  missing baseline fails the run like a missing PNG does.
- On a difference, the changed lines are written to
  `<stem>.aria.diff` in the run's evidence directory, embedded in the HTML
  report card for that screenshot, and summarized in the checks table.
- `ariaSnapshotMode: fail` (default) makes a difference fail the gate.
  `ariaSnapshotMode: warn` records the diff and marks the check with a warn
  status in the visual card without failing the run.

```yaml
visual:
  ariaSnapshot: true
  ariaSnapshotMode: fail
```

### `visual.fullPage` and `routes[].fullPage`

`visual.fullPage` captures the full scrollable page for every route.
`routes[].fullPage` overrides it per route. Full-page screenshots change the
baseline image dimensions, so regenerate baselines when toggling the option.

## Combining the options

Flake sources and the stabilizer that addresses each:

- Animations and caret: covered by the injected CSS and reduced motion.
- Timestamps, counters, dates rendered into the DOM: `freezeTime` if the value
  derives from `Date`; `maskSelectors` otherwise.
- Advertisement slots, carousels, randomized content: `maskSelectors`. Note
  that masking is visual only; the ARIA snapshot still sees the DOM. If the
  masked region's semantics also change, set `ariaSnapshotMode: warn` or drop
  `ariaSnapshot` for those routes.
- Late async content: `waitUntil: networkidle` plus a `readySelector` on the
  element that proves readiness.
- Structural changes without visual noise (a nav item renamed, a dialog role
  added): `ariaSnapshot` catches these even when the pixel diff stays under
  the threshold.

A defensive setup for a page with ads and clocks:

```yaml
visual:
  maskSelectors: ["[data-ad-slot]"]
  freezeTime: "2026-01-01T00:00:00Z"
  ariaSnapshot: true
  ariaSnapshotMode: warn
```
