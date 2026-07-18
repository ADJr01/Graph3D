# Troubleshooting

## Black canvas

**No active scene.** `Graph3D`'s per-frame tick renders nothing at all until
`g.setActiveScene(...)` has been called — `g.createScene('main')` alone
isn't enough. This is the first thing to check; everything else below
assumes a scene is actually active.

**A theme's HDR environment failed to load.** `scene.applyTheme(name)`
bundles camera/lighting/fog/HDR/shadow-quality together, and it's `async` —
if the HDR fetch rejects (e.g. a 404, or a relative path that doesn't
resolve in your build setup), the returned promise rejects and the scene is
left unchanged, often still fully dark from before the call. Add a `.catch()`
around `applyTheme()` while debugging to surface this instead of failing
silently:

```js
scene.applyTheme('studio-dark').catch((err) => console.error('applyTheme failed:', err));
```

**The camera's theme preset overrode your manual positioning.** Re-applying
a theme also re-applies that theme's own camera preset — if you position the
camera *before* `applyTheme()` resolves, the theme's preset silently wins.
Position the camera (and call `.lookAt()`/`enableOrbitControls()`) *after*
`applyTheme()`'s promise resolves, not before:

```js
await scene.applyTheme('clinical-white');
scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);
```

**No light for a physically-based material.** `material.standard()`/
`.physical()` (the chart-type default) need at least one light in the
scene to render anything but black — `GraphScene`'s default light rig covers
this automatically, but a scene built with `scene.useLights([])` or one
whose lights were manually removed will render real, correctly-positioned
geometry as solid black.

**The canvas has zero drawing-buffer size.** `autoResize` (default `true`)
attaches a `ResizeObserver` to `canvas.parentElement` at construction time —
if the canvas isn't attached to the DOM yet when `new Graph3D({ canvas })`
runs, `canvas.parentElement` is `null` and no observer is ever attached, not
even retroactively once you insert the canvas later. Construct `Graph3D`
*after* the canvas is in the DOM, or call `g.setSize(width, height)`
yourself if you must construct it earlier. A parent element with no
resolved height (a bare `<div>` with no CSS height in a flex/grid layout)
produces the same symptom: a `0`-height drawing buffer.

**The render loop is paused because the tab is backgrounded.**
`Graph3DLoop` explicitly cancels its `requestAnimationFrame` while
`document.hidden` is true, and resumes automatically on `visibilitychange` —
by design, not a bug, but it means a screenshot or an automated check taken
against a backgrounded/unfocused browser tab will show a stale or black
frame with no Graph3D-side error at all. Bring the tab into focus (or check
`document.visibilityState`) before concluding the scene itself is broken.

## Invisible meshes (something is there but nothing renders)

Distinct from a fully black canvas — other content renders correctly, but
one specific object doesn't. In rough order of likelihood:

- **Zero scale.** A `BarChart` bar for a datum whose value maps to `0` gets
  `scale.y = 0` — present in the scene graph, but with no visible extent.
  Check the accessor/scale you passed to `.y()` against the actual data
  range.
- **`opacity: 0` or `visible: false`**, set explicitly via `.attr()`/
  `chart.opacity()`/`chart.visible()`, or inherited from a `StateMachine`
  style that was never reverted.
- **Uncommitted vertex edits.** `mesh.setVertex(...)`/`setVertices(...)`
  stage geometry changes that only take effect after `mesh.commit()` — a
  mesh edited but never committed keeps its old (possibly degenerate)
  geometry.
- **Outside the camera frustum**, or behind the camera's near/far clipping
  planes — especially after a `scene.applyTheme()` camera-preset override
  (see above) moved the camera without you re-checking framing.
- **Added to the wrong scene.** `new THREE.Mesh(...)` added via
  `scene.three.add(x)`/`scene.add(x)` renders; an object added to some other
  `new THREE.Scene()` your app happens to still have lying around does not,
  with no error either way — this is easy to hit mid-migration from a
  hand-rolled Three.js app (see [migrating from raw
  Three.js](/migration/from-raw-three)).
- **A disposed object still referenced.** Calling `dispose()` on a
  `GraphMesh`/`GraphInstancedObject` removes it from the scene and frees its
  GPU resources — a stale reference to it kept around afterward renders
  nothing (and most of its methods now throw "disposed").

## Low FPS

Start with `g.frameBudget` (see [Core: Frame
Budget](/concepts/core#frame-budget)) rather than guessing — it emits
`graph3d:slow-frame` only after several *consecutive* over-budget frames, so
a real event means a sustained problem, not GC jitter. See
[Performance](/perf) for the full checklist: confirm large datasets are
actually hitting the instanced backend (`INSTANCING_THRESHOLD`, default 50),
attach `GPGPU` for force-directed layouts past a few thousand nodes, enable
`chart.enableLOD()` for camera-distance decimation, and disable PostFX passes
one at a time (`ssao`/`ssr`/`motionBlur`/`dof` are the costliest) to isolate
whether the bottleneck is scene complexity or post-processing.

## Leaks

Every class holding GPU/DOM resources (`GraphMesh`, `GraphInstancedObject`,
chart types, `GraphScene`, `Graph3D` itself) must have `dispose()` called on
it eventually — see [Core: Disposal Contract](/concepts/core#disposal-contract).
Common sources of a real leak:

- **Never calling `dispose()` at all** on a chart/scene/`Graph3D` instance
  that's being torn down (e.g. on route change in an SPA, or component
  unmount) — `g.dispose()` cascades through everything it owns, so one call
  at the right teardown point usually covers an entire app.
- **`loop.add()` callbacks that are never `loop.remove()`d.** Anything
  registered directly against the shared `loop` singleton (rather than
  through a chart/scene method that manages its own registration) keeps
  running, and keeps closing over whatever it captured, until explicitly
  removed.
- **Event listeners from `interact/` classes** (`PointerRouter`,
  `KeyboardNav`, `Brush`/`Lasso`) — each owns real DOM listeners and, for
  `KeyboardNav`, a live-region element; dispose them alongside the chart(s)
  they're attached to.
- **Textures/materials loaded outside `material/`'s own presets** — anything
  you construct yourself with `new THREE.TextureLoader().load(...)` is yours
  to `dispose()`; Graph3D's disposal contract only covers resources it
  created on your behalf.

Verify with `renderer.info.memory.geometries`/`.textures` (real Three.js
renderer stats, reachable via `g.renderer.three.info.memory`) around a
create/dispose cycle repeated many times — if either count doesn't return to
its baseline, something in that cycle isn't disposing correctly. This is the
same pattern every `tests/integration/*-disposal.test.js` file in this repo
already uses.

## Context loss

`Graph3DRenderer` listens for the browser's own `webglcontextlost`/
`webglcontextrestored` events on the canvas and re-dispatches them as
`graph3d:context-lost`/`graph3d:context-restored` `CustomEvent`s on
`g.renderer.three.domElement`:

```js
g.renderer.three.domElement.addEventListener('graph3d:context-lost', () => {
  console.error('WebGL context lost — rendering halted.');
});
g.renderer.three.domElement.addEventListener('graph3d:context-restored', () => {
  console.log('WebGL context restored.');
});
```

While the context is lost, any call that touches the renderer (`render()`,
`setSize()`, `setPixelRatio()`, `setToneMapping()`) throws — including the
renderer's own per-frame `render()` call inside `Graph3D`'s internal tick.
**This currently has a real, sharp-edged consequence**: `Graph3DLoop`'s tick
has no per-callback `try`/`catch`, so an uncaught throw from any registered
callback — Graph3D's own render call included — stops the `for` loop mid-
iteration and, because it never reaches its own `scheduleRaf()` call at the
end, halts the **entire shared RAF loop for the whole page**, not just the
one `Graph3D` instance whose context was lost. There is no automatic
recovery once this happens, even after the browser fires
`webglcontextrestored` — the loop simply has no more scheduled frames.

If you need resilience against real context loss (a common occurrence on
mobile GPUs and shared/virtualized GPU environments), listen for
`graph3d:context-restored` and manually kick the shared loop back into
motion — its registered callbacks (yours and Graph3D's own) are never
cleared by the crash, so an explicit `stop()` + `start()` is enough to
resume everything at once:

```js
import { loop } from 'graph3d.js';

g.renderer.three.domElement.addEventListener('graph3d:context-restored', () => {
  loop.stop();
  loop.start();
});
```
