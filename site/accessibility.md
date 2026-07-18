# Accessibility

A `<canvas>` carries no readable content of its own — everything below is
about making a Graph3D.js scene usable without a mouse, without color vision,
and without sight at all.

## Screen readers: `setAriaLabel` / `setLongDescription`

Every chart can write an accessible name and description into a
visually-hidden `<div>` inserted immediately after a container element you
supply — the actual place a screen reader finds a chart's content, since the
`<canvas>` itself has none:

```js
chart.setAriaLabel('Quarterly revenue by region', { container: canvas });
chart.setLongDescription('Revenue climbed steadily each quarter, peaking in Q4.');
```

`container` is required only the first time either method is called — both
write into the same hidden div. If you never call `setLongDescription()`,
`render()`/`update()` keep it filled with an auto-generated one-line summary
(a data-point count and value range, from `describeData()`) so a chart is
never silently undescribed, even one you forgot to label by hand.

## Keyboard navigation: `KeyboardNav`

`PointerRouter` (mouse/touch picking) has a keyboard-driven counterpart with
the same hover/select visual vocabulary:

```js
import { KeyboardNav } from 'graph3d.js';

const nav = new KeyboardNav({ domElement: canvas });
nav.stateMachineFor(barChart).style('focused', (s) => s.attr('scale.x', 1.15)); // e.g. a focus ring
```

- **Tab** / **Shift+Tab** advances a single roving focus cursor across every
  registered chart's current data, in registration order, wrapping at both
  ends. The canvas gets `tabIndex = 0` automatically if it doesn't already
  have one — a bare `<canvas>` can't receive keyboard focus otherwise.
- **Enter** selects the focused datum. **Escape** clears the current
  keyboard-driven selection without moving the focus cursor (matching the
  ARIA APG listbox/grid pattern, so you don't lose your place).
- Every action updates a visually-hidden `aria-live="polite"` region
  (`nav.liveRegion`) describing the newly-focused/selected datum — override
  the default `"key: value"` summary via the constructor's `describe` option
  for data whose readable label isn't obvious from its raw shape.

`KeyboardNav` keeps its own selection bookkeeping, independent of any
`PointerRouter` used alongside it on the same chart — see [Interact: Drag-and-
drop + KeyboardNav](/concepts/interact#drag-and-drop-keyboardnav-accessible-interaction-prompt-154)
for the full reference, including this scoping caveat.

## Color-blind-safe palettes

Not every built-in `palette.*` ramp is safe for color-vision-deficient
viewers, and Graph3D.js doesn't pick one for you — `chart.color(accessor,
palette)` takes whichever ramp you pass. Some guidance:

- **Sequential data** — `palette.viridis`/`inferno`/`magma`/`plasma`/
  `cividis` are all perceptually-uniform colormaps designed to remain
  distinguishable under the common forms of color vision deficiency (and in
  grayscale). `cividis` specifically is designed and tuned to be safe for
  both red-green (deuteranopia/protanopia) *and* blue-yellow (tritanopia)
  color vision deficiency — reach for it first if accessibility is the
  primary concern. Avoid `palette.turbo` (a high-contrast rainbow ramp) if
  color-vision accessibility matters — rainbow colormaps are a known-bad
  pattern for both color-blind readers and perceptual accuracy generally
  (equal-looking color steps don't correspond to equal data steps).
- **Diverging data** — `palette.BrBG` (brown → white → teal) reads correctly
  for red-green color blindness; `palette.RdBu`/`RdYlBu`/`PiYG` all rely on a
  red-vs-green (or red-vs-teal-adjacent) contrast that collapses for the most
  common forms of color vision deficiency. Prefer `BrBG`, or a diverging ramp
  built from your own colorblind-safe endpoints via
  `palette.custom([...])`, if the audience is unknown.
- **Categorical data** — every built-in categorical scheme
  (`category10`/`tableau10`/`set1`/...) places at least one red and one green
  swatch close together in the cycle; for a handful of categories, prefer
  `palette.dark2`/`palette.set2` (ColorBrewer's qualitative schemes, chosen
  for better lightness separation) over `category10` when color is the
  *only* channel distinguishing categories.
- **Don't rely on color alone.** Pair `chart.color()` with a second visual
  channel where it matters — `chart.shape()`, `chart.size()`, or
  `chart.opacity()` — so category/value differences survive even for a
  viewer who can't distinguish the color ramp at all. See
  [Compose: Color & Palettes](/concepts/compose#color-palettes-color-palette)
  for the full built-in ramp list.

## Reduced motion

`new Graph3D({ respectReducedMotion: true })` (the default) stores your
app's reduced-motion preference as a plain, readable property —
`g.respectReducedMotion` — but does **not** wire it to the animation engine
automatically (`core/` sits below `anim/` in the layer order and can't import
it — see [Core](/concepts/core)). Wire it yourself, once, from a real
`prefers-reduced-motion` check:

```js
import { anim } from 'graph3d.js';

anim.respectReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Once set, every registered `anim/` timeline — including `Selection.transition()`
and `chart.transition()` — snaps to its end value on the next tick instead of
animating through it, rather than each transition needing its own reduced-
motion check. See [Anim](/concepts/anim) for the full timeline reference.

## Camera and interaction

`scene.camera.enableOrbitControls(canvas)` (see
[Scene Composition](/concepts/scene)) is mouse/touch-driven and has no
built-in keyboard equivalent — pair it with `KeyboardNav`'s focus cursor and
`FocusFollower` (which orbits the camera to a focused datum's position, see
[Interact](/concepts/interact)) if keyboard-only camera movement matters for
your use case; there is currently no single built-in "keyboard-drive the
free camera" control.
