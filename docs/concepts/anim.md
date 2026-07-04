# Anim — Phase 5 (DONE)

Anim is Layer 5 of Graph3D.js — the animation engine. It's deliberately agnostic about *what* it animates: `GraphAnimTimeline`/`GraphAnimKeyframe` operate on a plain target object's dot-paths (`'position.y'`, `'opacity'`, ...), never referencing `Selection`, `object/`'s wrapper classes, or Three.js directly. Everything richer — `Transition`'s D3-flavored sugar, `Selection.transition()`'s per-datum animated writes, `CameraTour`'s waypoint flights — is built *on top of* that one engine, not a second one (CLAUDE.md §1.1 DRY).

One shared RAF tick drives all of it: `core/Graph3DLoop`'s singleton `loop` is the only `requestAnimationFrame` call in the library, and `GraphAnim`'s singleton `anim` is the only thing that subscribes to it for animation. `Transition`/`SelectionTransition` register their timelines with `anim`; `CameraTour` registers directly with `loop` (it isn't a dot-path timeline internally, so there's no `GraphAnimTimeline` to hand to `anim`).

---

## Three layers, side by side

The same "animate this property" intent looks different depending on which layer you reach for:

```js
// 1. GraphAnimTimeline — the raw engine. Verbose, but every knob is explicit.
const tl = new GraphAnimTimeline(mesh.position);
tl.to({ y: 5 }, { duration: 1, easing: 'easeOutCubic' })
  .onComplete(() => console.log('done'))
  .play();
anim.add(tl); // or tl is already registered if built via anim.timeline(target)

// 2. Transition — D3-flavored sugar over the same engine. One target, dot-paths, ms.
new Transition(mesh.position)
  .duration(600)
  .easing('easeOutCubic')
  .on('end', () => console.log('done'))
  .to({ y: 5 });

// 3. SelectionTransition — animated Selection, one call covers every bound datum.
selection.transition()
  .duration(600)
  .easing('easeOutCubic')
  .on('end', () => console.log('done'))
  .attr('position.y', (d) => d.value);
```

Reach for **`GraphAnimTimeline`** directly when you need `.then()`-sequenced groups, `.loop()`, or `.seek()`/`.reverse()` scrubbing on a single object — it's the only layer with that full transport control. Reach for **`Transition`** for a one-shot D3-style tween on a single object. Reach for **`SelectionTransition`** (`selection.transition()`) for anything chart-shaped — a whole bound dataset animating together, with per-datum staggering and correct behavior across both the meshes and instanced rendering backends.

---

## GraphAnimCurve — `curve.*`, `spring`, `bezier`, `noise`, `resolve`

Every named easing (`easeIn/Out/InOut` × `Quad/Cubic/Quart/Quint/Sine/Expo/Circ/Back/Elastic/Bounce`, plus `linear`) is a pure `(t: 0..1) => number`. `spring(stiffness, damping)` and `bezier(x1,y1,x2,y2)` build custom curves from physical/CSS-style parameters; `noise(seed)` gives a deterministic 1D value-noise curve. Every other layer resolves a curve through `resolve(nameOrFn)` — a string looks it up by name, a function passes straight through — so a custom easing function works anywhere a named one does.

```js
curve.easeOutBounce(0.5);      // a named curve, called directly
resolve('easeInOutCubic');     // looked up by name
resolve((t) => t * t);         // a raw function passes through unchanged
spring(170, 26)(0.8);          // a custom spring curve
```

---

## GraphAnimKeyframe — per-property tracks

The building block `GraphAnimTimeline` stages internally: one dot-path, a list of `{offset, value}` stops, each adjacent pair's interpolator built *once* at construction via `compose/interpolate` (Prompt 87 — no local lerp anywhere in `anim/`). Not usually constructed directly; `GraphAnimTimeline.to()`/`.from()` build one per property.

---

## GraphAnimTimeline — the raw engine

Sequences one or more property tracks on a single target. `.to()`/`.from()` calls made back-to-back run in **parallel**, starting at the current cursor; `.then()` advances the cursor past that group so the next calls run **sequentially** after it — and seals the group just ended so its own `onGroupComplete` (Prompt 96) fires independently of the timeline's overall `onComplete`:

```js
const tl = new GraphAnimTimeline(bar.scale);
tl.to({ y: 2 }, { duration: 0.4 })
  .onGroupComplete(() => console.log('grew'))
  .then()
  .to({ y: 1 }, { duration: 0.2, easing: 'easeInBounce' })
  .onComplete(() => console.log('settled'))
  .play();
```

`.loop(count, mode)` repeats the whole single-pass timeline — `'restart'` jumps back to `t=0`, `'pingpong'` reverses direction instead. `.play()`/`.pause()`/`.stop()`/`.reverse()`/`.seek(time)` give full transport control; `update(deltaSeconds)` advances it (call it yourself, or register with `anim` for automatic per-frame ticking via `anim.add(timeline)`/`anim.timeline(target)`).

`interruptPath(path)` removes every still-live track animating `path`, leaving every other track untouched — the primitive `Transition`/`SelectionTransition` build cross-transition interrupt semantics on top of (see below); not something you'd normally call directly.

---

## GraphAnim — the engine root

The singleton `anim` is what actually ticks every registered timeline once per frame, via the one shared `loop`. `anim.timeline(target)` creates-and-registers in one call; `anim.add(timeline)` registers one built by hand. `anim.pause()`/`.resume()` freeze every registered timeline globally regardless of its own individual play state; `anim.dispose()` unsubscribes from `loop` and drops everything (mostly for tests — a real app never disposes the shared engine).

**`anim.tween(from, to, options, onUpdate)`** (Prompt 95) is the ad-hoc escape hatch for callers who just want an interpolated value on every frame without a target object to attach dot-paths to — a shader uniform, say:

```js
anim.tween(0, 1, { duration: 0.5 }, (v) => { material.uniforms.uProgress.value = v; });
```

It's a thin wrapper (a throwaway single-property `GraphAnimTimeline` under the hood) so it inherits everything else `anim` already does for free — including `respectReducedMotion`.

**`anim.respectReducedMotion`** (Prompt 95): set it `true` and every registered timeline snaps straight to its end value on its next tick instead of animating through it — `Transition` and `SelectionTransition` both inherit this automatically, since both register their internal timelines with `anim`. `anim` never reads `window.matchMedia` itself (that would give this layer a DOM dependency it has never had); wire the media query yourself:

```js
anim.respectReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

This doesn't reach `CameraTour` (it registers with `loop` directly, not `anim` — see below).

---

## Transition — D3-flavored sugar for one target

```js
new Transition(bar.scale)
  .duration(600)
  .delay((_, i) => i * 40)   // a constant, or a function
  .easing('easeOutCubic')
  .on('start', () => {})
  .on('end', () => {})
  .on('interrupt', () => {}) // fires if a later Transition supersedes this one first
  .to({ y: 2.4 });
```

`.to(props)` returns the underlying `GraphAnimTimeline` (for further `.then()` sequencing, `.stop()`, etc.) and starts it immediately. Milliseconds throughout, matching D3's own convention — the raw `GraphAnimTimeline` underneath uses seconds, which `Transition` converts at the boundary.

**Interrupt semantics** (Prompt 93): a second `Transition` targeting the *same* target object and an overlapping dot-path fires `'interrupt'` on the one it supersedes, removes just that path's track (`GraphAnimTimeline.interruptPath`), and continues from whatever value was already interpolated — not from the original start. An interrupted transition's `'end'` never also fires.

```js
Transition.runningOn(mesh.position);   // how many of its dot-paths are still animating
Transition.cancelAllOn(mesh.position); // hard-stop everything running on it, no 'end'/'interrupt' fired
```

These two (Prompt 96) are the introspection primitive a future `chart.runningTransitions()`/`chart.cancelTransitions()` will delegate to once Phase 8's chart layer exists — there's no chart class to attach them to yet, so they're usable standalone against any target today.

---

## SelectionTransition — animated `Selection`

`selection.transition()` returns a `SelectionTransition`: the animated counterpart to `Selection.attr()`/`.style()`/`.remove()` (Prompt 91). Every scheduled write captures each node's *current* value (read from the live buffer or material) as the tween start, and interpolates toward the target via `compose/interpolate` — same authority `GraphAnimKeyframe` uses, so a color or number tween looks identical whether it came from a raw `GraphAnimTimeline` or a chart-shaped `SelectionTransition`.

```js
joined.exit().transition()
  .duration(400)
  .attr('opacity', 0)
  .remove(); // deferred until the fade actually finishes, not immediately

entered.transition()
  .duration(700)
  .delay((d, i) => i * 70)     // per-datum stagger, not a global delay
  .easing('easeOutBack')
  .attr('scale.y', (d) => Math.max(barHeight(d.value), MIN_SCALE));
```

One internal `GraphAnimTimeline` drives every scheduled `.attr()`/`.style()` call; each frame writes every node's interpolated value and commits the buffer **exactly once** — `commitMatrix()`/`commitColor()`/`commitAttribute()` per job, never per instance, on the instanced backend. The same `.attr('position.y', ...)`/`.style('roughness', ...)` calls work identically over a meshes-backend `Selection` or an instanced one — `tests/integration/phase5.test.js`'s parity test proves both land on the same numeric values.

**Interrupt semantics** (Prompt 93) apply per-node: a second `SelectionTransition` scheduling a write to the same mesh (or the same instanced raw index) and path fires `'interrupt'` and removes just that one node from the job it's superseding, leaving every other node/job of that older transition running. Unlike `Transition`, `SelectionTransition`'s `'end'` still fires even if only *some* of its nodes were interrupted — one datum out of a thousand-node stagger getting superseded doesn't mean the transition, as a whole, didn't finish.

---

## CameraTour — flying the camera through waypoints

```js
const tour = new CameraTour(camera, [
  { at: [10, 10, 10], lookAt: [0, 0, 0], duration: 2000, easing: 'easeOutCubic' },
  { at: [-10, 5, 10], lookAt: [0, 0, 0], duration: 1500 },
]);
tour.pause();
tour.resume();
tour.skipToNext(); // snap to the end of the current waypoint, advance
tour.cancel();     // stop for good — play()/resume()/skipToNext() become no-ops after
```

Each waypoint's `at` (position), `lookAt`, and optional `fov` interpolate from the previous waypoint's end state, over that waypoint's own `duration`/`easing` (resolved through `GraphAnimCurve` — no separate easing table). Auto-plays on construction, matching this codebase's other "call it, it starts" builders.

Presets build a ready-to-play tour in one call:

```js
CameraTour.orbit(camera, { center: [0, 0, 0], radius: 15, segments: 8 });
CameraTour.flyTo(camera, { at: [5, 5, 5], lookAt: [0, 0, 0], duration: 1200 });
CameraTour.cinematicReveal(camera, { target: [0, 0, 0] }); // wide/high/narrow-FOV sweeping into close/low/wide-FOV
```

`examples/05-transitions/main.js` uses `CameraTour.flyTo()` to reframe on the new tallest bar every time the bound dataset re-joins.

---

## What's genuinely out of scope for Phase 5

- **Chart-level `cancelTransitions()`/`runningTransitions()`** don't exist as methods yet — there's no `src/chart/` class to attach them to (Phase 8). `Transition.runningOn()`/`cancelAllOn()` are the primitive Phase 8 will wrap; `SelectionTransition` has no equivalent yet (its interrupt registry is keyed by node identity, not a single target — see `skipping_list.md`).
- **`CameraTour` doesn't respect `respectReducedMotion`** — it registers with `loop` directly, not `anim`, so the reduced-motion flag has no effect on it today.
- **Cross-transition interrupts don't cover `GraphInstancedObject`'s bulk setters** (Prompt 92) against a `SelectionTransition`/`Transition` writing the same buffer — only `Transition`↔`Transition` and `SelectionTransition`↔`SelectionTransition` interrupts are wired.

See `skipping_list.md`'s Phase 5 section for the full, itemized list with revisit triggers.
