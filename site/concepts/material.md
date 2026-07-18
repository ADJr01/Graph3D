# Material — Phase 6 (DONE)

Material is Layer 6 of Graph3D.js — materials, procedural textures, and text. It sits above `anim/` in the layer table (CLAUDE.md §1.4), so it's free to reach into `object/` (`GraphMesh`/`GraphInstancedObject`), `core/` (the shared render loop, the disposal registry), and `anim/` (nothing in this phase needed it directly, but the door is open). Everything here returns a plain `THREE.Material`/`THREE.Texture`/`THREE.Mesh` — Graph3D doesn't invent its own material abstraction, it composes THREE's.

Two namespaces plus a handful of classes make up the public surface:

```js
import { material, texture, GraphObjectMaterial, SDFText } from 'graph3d';

material.standard({ color: '#3b82f6' });          // → THREE.MeshStandardMaterial
texture.checkerboard({ tiles: 8 });                // → THREE.DataTexture
new GraphObjectMaterial(mesh);                      // wraps a GraphMesh/GraphInstancedObject's material
await SDFText.create('Hello');                      // → a GPU-rendered text mesh
```

---

## GraphObjectMaterial — the material-behavior wrapper (Prompt 100)

`GraphMesh`/`GraphInstancedObject.material` (Phase 3) return the raw `THREE.Material` — that will never change (`object/` can never import `material/`, a higher layer). `GraphObjectMaterial` is the richer wrapper Phase 3's own docs promised, built from the other side of that boundary:

```js
const wrapper = new GraphObjectMaterial(bar); // bar: GraphMesh or GraphInstancedObject
wrapper.set(material.chrome());
wrapper.setMap('normal', normalTexture);
wrapper.applyShader(material.holographic());
wrapper.bindUniforms({ time: 'auto', resolution: 'auto', intensity: 1.5 });
```

- **`set(material)`** — replace the target's material outright, disposing the one being replaced.
- **`applyShader(shaderMaterial, { preserveUniforms })`** — promote to a custom `THREE.ShaderMaterial`. `preserveUniforms: true` (Prompt 112's dev-mode hot-reload) copies matching uniform *names* from the old material onto the new one before swapping — re-apply a shader you've only edited the GLSL text of and keep whatever values you'd already tweaked, instead of resetting to the new material's own defaults. Defaults to `false`: two *unrelated* shaders that happen to share a uniform name (e.g. `color`) shouldn't silently bleed values into each other.
- **`bindUniforms({ time: 'auto', resolution: 'auto', ...anythingElse })`** — `'auto'` is only recognized for `time` (seconds elapsed, driven by the shared render loop) and `resolution` (`window.innerWidth/innerHeight * devicePixelRatio`, refreshed on resize); any other key is assigned as a static value. Re-binding a name mutates its uniform's `.value` in place — THREE reads a compiled `ShaderMaterial`'s uniform objects by reference.
- **`setMap(slot, texture)`** — assign a texture to a named PBR slot: `map`, `normal`, `roughness`, `metalness`, `emissive`, `ao`, `env`, `displacement`, `clearcoat`.

**Texture ref-counting** (Prompt 111): `set()`/`setMap()` both route texture disposal through `core/GraphDisposal.js`'s `retainTexture`/`releaseTexture` — a texture referenced by two materials at once (e.g. one `THREE.CubeTexture` shared across many `material.crystal()` calls) survives until every material referencing it is gone, instead of the first one to be swapped/disposed taking it down with it. A texture nobody ever explicitly `retainTexture()`-d behaves exactly as before this prompt: it disposes on its first release. Two *independently constructed* `GraphObjectMaterial`s sharing a texture from the start aren't auto-detected as sharing it — call `retainTexture(texture)` yourself once per extra material using it (there's no scene-wide registry to infer this from).

---

## The `material` namespace — presets (Prompts 101–106, 111–112)

### PBR pass-throughs (Prompt 101)

Thin, validated wrappers over THREE's own material classes — no custom shader, no reinvented physics:

| Name | Wraps | Notes |
|---|---|---|
| `standard` | `MeshStandardMaterial` | Roughness/metalness workflow, the general-purpose default. |
| `physical` | `MeshPhysicalMaterial` | Adds clearcoat/transmission/sheen/iridescence over `standard`. |
| `basic` | `MeshBasicMaterial` | Unlit flat color, cheapest to render. |
| `lambert` | `MeshLambertMaterial` | Diffuse-only, no specular highlight. |
| `phong` | `MeshPhongMaterial` | Non-PBR specular highlight (`shininess`). |
| `toon` | `MeshToonMaterial` | Cel-shaded banding via an optional `gradientMap`. |
| `matcap` | `MeshMatcapMaterial` | Lighting baked into a sphere texture — no scene lights needed. |

### Custom-shader looks (Prompts 102–104)

| Name | Look | Key options |
|---|---|---|
| `holographic` | Fresnel iridescent rim + scrolling scanlines + chromatic fringe | `intensity`, `scanlineFrequency`, `color1`/`color2` |
| `crystal` | Chromatic-dispersion refraction + fresnel reflection off a `THREE.CubeTexture`, animated sparkle standing in for caustics | `envMap` (required), `ior`, `dispersion`, `causticIntensity` |
| `glow` | Additive fresnel rim-glow halo, bloom-friendly (`intensity` can exceed `1.0`) | `color`, `intensity`, `power` |

All three need `time` (`holographic`/`crystal`) or nothing at all (`glow` has no time uniform) — pair with `bindUniforms({ time: 'auto' })` to animate.

### Glass & thin-film (Prompt 103)

`glass()`/`frostedGlass()` are `MeshPhysicalMaterial` wrappers built on real `transmission` (light actually passing through — needs the renderer's transmission render target) and `iridescence` (thin-film soap-bubble sheen). `frostedGlass` is the same base with higher roughness and slightly reduced transmission.

### Emissive & fabric (Prompt 104)

- **`neon(options)`** — `MeshStandardMaterial` with `emissiveIntensity` deliberately above `1.0` (an HDR value a bloom postfx pass, Phase 7, will threshold on). Pass `pulse: true` (or `{ min, max, speed }`) to breathe — wires a `pulse()` controller and folds its cleanup into the returned material's own `.dispose()`, so callers never need to remember a second cleanup call.
- **`pulse(material, options)`** — the generic engine behind `neon`'s `pulse` option: oscillates *any* numeric material property between `min`/`max` off the shared render loop. Returns `{ dispose() }`.
- **`velvet(options)`** — `MeshPhysicalMaterial` built on the `sheen`/`sheenRoughness`/`sheenColor` workflow designed specifically for cloth.

### Metals & coated dielectrics (Prompt 105)

`liquidMercury`, `chrome`, `gold`, `copper` share a `buildMetalPreset()` helper (`metalness: 1` + a physically-plausible `color`/`roughness` pair — gold/copper matched to the Filament/Unreal PBR reflectance reference charts). `pearl` (clearcoat + soft iridescence) and `obsidian` (clearcoat, near-black, no transmission — it's opaque volcanic glass) are standalone `MeshPhysicalMaterial` looks. All six are meant to be lit by a real HDR environment — see the gallery section below for the caveat on this repo's own studio HDR.

### Data-driven color (Prompt 106)

**`dataDriven(options)`** samples a per-instance (or per-vertex, on a plain mesh) scalar attribute and looks it up in a palette texture:

```js
selection.attr('value', (d) => scale(d.magnitude)); // pre-normalized to [0,1] — scale.linear, not reimplemented here
material.dataDriven({ palette: palette.viridis, perInstanceOpacity: true });
```

This also **completes the Prompt 77 `Selection.style` link**: `perInstanceOpacity`/`perInstanceEmissiveIntensity` read the exact `'opacity'`/`'emissiveIntensity'` per-instance attributes `Selection.attr`/`.style` already wrote on the instanced backend (previously inert — no material read them). `color` (via THREE's native `instanceColor`) needs no option at all — THREE defines that attribute per-object regardless of material type.

### The 90%-case convenience (Prompt 112)

```js
selection.attr('value', (d) => magnitudeScale(d.temperature));
material.setPaletteForAttribute(bars, 'value', palette.viridis);
```

One call instead of hand-assembling `GraphObjectMaterial` + `dataDriven`. Note the actual signature is `setPaletteForAttribute(object, attrName, palette, options)`, not `object.material.setPaletteForAttribute(...)` — `GraphInstancedObject.material` can never gain new methods (see above), so the object is the first argument instead.

### Streaming-aware freshness (Prompt 166, Phase 10)

Two more custom-shader presets that both read a per-instance `age` attribute — a `performance.now()` millisecond timestamp the *caller* stamps when a datum enters or updates (e.g. `selection.attr('age', () => performance.now())` inside a `chart.stream()` consumer, `site/concepts/stream.md`). Neither preset writes `age` itself — same "attribute already written elsewhere" contract as `dataDriven`'s `valueAttribute`. Both keep a `uNow` uniform current every frame off the shared render loop (`core/Graph3DLoop`) to compare against it.

```js
points.defineAttribute('age', 1);
selection.attr('age', () => performance.now()); // stamp on every enter/update join

material.freshness(800, { color: '#39ff14' });                          // pulse-then-settle on arrival
material.dataStream({ trailLength: 2000, palette: palette.plasma });    // comet-trail fade + auto-prune
```

- **`freshness(decayMs, options)`** fades `color` from full intensity down to `baseOpacity` (default `0.15`) over `decayMs` milliseconds — newly-arrived/updated instances flash and settle instead of popping in indistinguishably from data that's been sitting there a while.
- **`dataStream({ trailLength, palette })`** samples `palette` from full color at `age=0` down to the palette's far end as an instance approaches `trailLength` ms old, then `discard`s the fragment entirely once it's older — a self-pruning comet trail, with no per-frame opacity bookkeeping required from the caller.

### Planar reflections (Prompt 111)

```js
const mirror = await material.addPlanarReflection(floorPlane, { textureWidth: 1024 });
```

Turns an existing flat `GraphMesh` into a live mirror using `three/examples/jsm/objects/Reflector.js` (dynamically imported, matching this codebase's established pattern for `three/examples/jsm/*` utilities). Reflects the current camera view every frame automatically via THREE's own `onBeforeRender` hook — no `loop`/RAF wiring needed on this library's side. `plane` is disposed and replaced in its scene by the reflector (a whole `THREE.Mesh` subclass, not a swappable material). Pass `ssrPass` (any truthy value) to use `ReflectorForSSRPass` instead of the standalone `Reflector` fallback, then pair the result with postfx's `ssr` pass (Prompt 119):

```js
const mirror = await material.addPlanarReflection(floorPlane, { ssrPass: true });
graph3d.postfx.enable('ssr', { groundReflector: mirror });
```

---

## The `texture` namespace — procedural textures (Prompt 110)

Seven pattern generators plus a palette-lookup builder, all returning `THREE.DataTexture`:

| Name | Pattern |
|---|---|
| `gradient({ type: 'linear'\|'radial', from, to, angle, size })` | Two-color gradient. |
| `noise({ scale, seed, size, color1, color2 })` | Smooth 2D value noise. |
| `voronoi({ cellCount, seed, size, color1, color2 })` | Filled Worley/Voronoi cells (F1 distance). |
| `cellular({ cellCount, seed, edgeWidth, size, color1, color2 })` | Voronoi cell *edges* (`F2 - F1`) — shares `voronoi`'s feature-point search. |
| `checkerboard({ tiles, size, color1, color2 })` | Alternating squares. |
| `dots({ tiles, radius, size, color1, color2 })` | Polka dots. |
| `lines({ tiles, thickness, angle, size, color1, color2 })` | Angled stripes. |
| `paletteTexture(palette)` | A 256×1 (or `palette.colors.length`×1) lookup ramp — `dataDriven`'s own palette texture is built through this exact function, not a separate copy. |

All share one `buildDataTexture(width, height, pixelFn)` per-pixel-loop helper and a non-cryptographic `hash2` 2D hash (a standard shader trick, not `anim/GraphAnimCurve.noise`'s 1D easing-curve noise — different domains, not a missed DRY opportunity).

---

## SDFText — GPU-rendered text (Prompt 108)

```js
const label = await SDFText.create('42%', { fontSize: 0.5, color: '#39ff14' });
scene.add(label.mesh);
// later:
label.dispose();
```

MSDF (multi-channel signed distance field) text — crisp at any distance, no blur, no pixelation, unlike canvas-sprite text (banned after Phase 6, CLAUDE.md §2). `SDFText.create()` is async (loading the atlas texture + JSON glyph metrics is inherently asynchronous) and lazily loads/caches a bundled Roboto atlas shared across every `SDFText` instance — `.dispose()` only frees this instance's own geometry/material, never the shared atlas.

Options: `fontSize`, `letterSpacing`, `align` (`'left'|'center'|'right'`), `color`, `outline: { color, width }`, `glow: { color, width, intensity }`.

**The bundled atlas doesn't exist in this repo yet** — `roboto-msdf.png`/`.json` were never generated (no MSDF font tool or Roboto TTF was available in this environment; same category of gap as Phase 2's missing HDR assets). `SDFText.create()` rejects with a clear, actionable error identifying exactly what's missing rather than silently rendering nothing. The full layout/shader engine (atlas caching, per-glyph quad layout with kerning/letterSpacing/align, an MSDF shader with outline/glow support) is built and unit-tested against a mock atlas — only the real binary asset is missing.

**Now wired into both `Axis` and `annotation.label`** via the two-phase "stay synchronous, upgrade when ready" design: `Axis.render(scene, name, { camera })` and `annotation.label({ ..., scene, camera })` both stay synchronous and keep returning their `{ text, position, style }` metadata immediately, but — when `camera` (and, for `label`, `scene`) is supplied — also fire off an async build of a real, camera-billboarded mesh in the background, disposed alongside the rest of the axis/label. Omitting `camera` keeps the original metadata-only behavior for existing callers.

---

## Label — the shared GPU-text primitive (improvement.md initiative (c))

```js
import { label } from 'graph3d';

const l = label()
  .text('42%')
  .position({ x: 1, y: 2, z: 0 })
  .font({ fontSize: 0.3, color: '#ffffff' })
  .anchor('center')
  .billboard(camera)
  .render(scene, 'bar_0_label');

l.text('88%'); // updates the live mesh in place
l.dispose();
```

A chainable, disposable wrapper around `SDFText` + a real `GraphMesh` — one primitive for "build SDF text, recenter it, billboard it toward a camera, dispose it," reused instead of hand-rolled per call site. `Axis`'s tick labels and `graphHTML`'s `SDFText` fallback (above) both build on `Label` now, rather than each independently repeating the same sequence.

Calling `.text()`/`.font()`/`.anchor()` again after `.render()` rebuilds the live mesh's geometry in place — the update capability the old hand-rolled `graphHTML` fallback never had (`.position()` is cheap: it repositions the existing mesh without a rebuild). `.anchor('center')` (default) centers the text block on `.position()`, matching `SDFText.centerOffset`; `.anchor('start')` places the block's natural top-left origin there instead. `.billboard(camera)` is opt-in and shares one `loop` registration across every currently-billboarded label (`material/label/billboardRegistry.js`), not one per label. `await l.ready` resolves once the most recently requested build settles — never rejects; a failed build is logged, not thrown.

Lives in `material/`, not `compose/`, specifically so `graphHTML` (also `material/`) can use it without an upward import — `compose/` is allowed to import `material/` (the same crossing `Axis`/`annotation.label` already use for `SDFText`/`graphHTML` directly), never the reverse.

---

## graphHTML — experimental HTML-in-Canvas labels (user-requested, not part of `prompts.md`'s numbered sequence)

```js
import { graphHTML } from 'graph3d';

const handle = graphHTML(bar, { html: '<b>42%</b>', camera: scene.camera.three });
await handle.ready;
handle.dispose();
```

Attaches a real, camera-billboarded label to any targeted object — a `GraphMesh`, one instance of a `GraphInstancedObject` (`{ object, index }`), or an explicit `{ scene, position }` pair (what `annotation.label`'s `scene`/`camera` opt-in uses internally, see above). Ten bars, ten different labels: `bars.forEach((bar, i) => graphHTML(bar, { html: htmls[i], camera }))`.

**Status: experimental.** `graphHTML` tries Chrome's still-in-origin-trial [HTML-in-Canvas API](https://developer.chrome.com/blog/html-in-canvas-origin-trial) first — real, arbitrary HTML/CSS content, rasterized via the 2D-context `drawElementImage(element, x, y)` entry point into a small offscreen canvas, then wrapped in a standard `THREE.CanvasTexture` (the WebGL-native entry point, `texElementImage2D`, has no public THREE.js API for handing it an externally-uploaded texture, so the 2D-context path was chosen deliberately). `isHTMLInCanvasSupported()` checks for `CanvasRenderingContext2D.prototype.drawElementImage` — as of this writing that requires Chrome 148-150 with the origin trial registered, or Canary 149+ behind the `#canvas-draw-element` flag, so almost every real user today will transparently get the fallback below instead. Both a missing API and a runtime failure inside the experimental path are caught and logged once (`console.warn`/`console.error`), never thrown.

**Fallback: `SDFText`.** When HTML-in-Canvas is unavailable (or throws), `graphHTML` builds a plain-text `SDFText` label instead — `html`'s markup is stripped to `textContent` (or pass `options.text` to control the fallback text directly), styled via `options.style` (`fontSize` default `0.3`, `color` default `'#ffffff'`, plus `outline`/`glow` — same shape as `SDFText.create`'s own options). `options.style` only affects the fallback; the experimental path renders `html`'s own CSS as-is. The two paths are structurally interchangeable to the caller: same target shapes, same returned handle (`{ mesh, isExperimental, ready, dispose() }`), same disposal contract. `handle.isExperimental` tells you which path actually built the visible mesh.

**Sizing — two independent knobs.** `width`/`height` (default `2`×`1`) are the built `THREE.PlaneGeometry`'s size in world units — the same space as everything else in the scene. `pixelWidth`/`pixelHeight` (default `512`×`256`) are the raster resolution `html` is captured at on the experimental path only — bump these for crisper small text, independent of how big the label appears in the scene. They're ignored by the `SDFText` fallback (vector glyphs, nothing to rasterize). Mismatching the world-unit and pixel aspect ratios stretches the texture, same as texturing any other plane:

```js
graphHTML(bar, { html: '<small>42%</small>', camera, width: 1, height: 0.5, pixelWidth: 256, pixelHeight: 128 });
```

Fire-and-forget, mirroring `Axis`/`annotation.label`'s own pattern: `graphHTML()` returns synchronously, `handle.mesh` is `null` until `handle.ready` resolves. Calling `handle.dispose()` before `ready` resolves is safe — the in-flight build is discarded instead of added to the scene.

Skipped for now (YAGNI): updating a label's content after creation (`handle.update(html)`) — nothing in this codebase calls it yet; add it if a real consumer needs to change a label post-creation instead of disposing and re-creating.

---

## graphIcon — image/SVG icons riding an animated bar

```js
import { graphIcon } from 'graph3d';

const handle = graphIcon(bar, { src: '/icons/btc.svg', camera: scene.camera.three });
await handle.ready;
handle.dispose();
```

`graphHTML` (above) can only show real markup — an `<img>`, an inline `<svg>` — on Chrome's experimental HTML-in-Canvas path; its universal `SDFText` fallback strips all markup down to plain text, so an icon silently disappears for almost every user. `graphIcon` shows the same `src` (any PNG/JPG/SVG `THREE.TextureLoader` can load, including a `data:` URI) in every browser, no experimental API involved. It targets the same shapes as `graphHTML` — a `GraphMesh`, one instance of a `GraphInstancedObject` (`{ object, index }`), or an explicit `{ scene, position }` pair — and returns the same shaped handle (`{ mesh, ready, dispose() }`), fire-and-forget: `handle.mesh` is `null` until `handle.ready` resolves, and `handle.dispose()` before then safely discards the in-flight build. There is no fallback path here (unlike `graphHTML`'s `SDFText` fallback) — a failed image load rejects `handle.ready` instead of silently substituting a placeholder.

**Riding an animating bar.** Unlike `graphHTML`, which snapshots its target's position once, `graphIcon` re-resolves the target every frame by default (`options.follow`, default `true`) — needed so an icon pinned to an instanced chart bar keeps tracking the bar's top through a `chart.update()` transition, not just where the bar was the moment `graphIcon()` was called. `options.offset` may also be a callback, re-evaluated every frame alongside the position, since a bar's "top" keeps moving as its height animates — `graphIcon` itself has no notion of "bar top," it only calls `offset()` again and lets the caller supply that meaning:

```js
bars.forEach((bar, i) => {
  graphIcon(
    { object: bars, index: i },
    { src: coinIconUrls[i], camera, offset: () => ({ y: bars.getInstanceScale(i).y / 2 + 0.15 }) },
  );
});
```

Set `follow: false` for a target that never moves (cheaper — no per-frame position re-resolution). `width`/`height` (default `0.6`×`0.6`) are the built `THREE.PlaneGeometry`'s size in world units, same space as everything else in the scene.

---

## Material-picker gallery

A textual reference until `examples/06-materials/main.js` (a real rendered 4×4 grid, `studio-dark` themed) and its screenshot exist in whatever hosts these docs. Sixteen of the twenty-one factories above are shown there — `physical`/`lambert`/`basic`/`frostedGlass` are visually redundant with a sibling already in the grid, and `crystal` needs an external cubemap image this repo doesn't bundle.

| Preset | Category | Needs an env/HDR to look right? |
|---|---|---|
| `standard`, `physical`, `phong`, `lambert` | PBR pass-through | Yes, for specular highlights |
| `basic`, `toon` | Unlit / stylized | No |
| `matcap` | Baked lighting | No (the matcap texture *is* the lighting) |
| `holographic`, `glow` | Custom shader, unlit | No — self-illuminating |
| `crystal` | Custom shader, refraction | Yes — required (`envMap`) |
| `glass`, `frostedGlass` | Physical transmission | Yes, for anything to refract |
| `neon` | Emissive | No |
| `velvet` | Physical sheen | Some — sheen highlights need a light source |
| `liquidMercury`, `chrome`, `gold`, `copper`, `pearl` | Metal / coated dielectric | **Yes, heavily** — near-black without one |
| `obsidian` | Coated dielectric | Some — clearcoat highlights need a light source |
| `dataDriven` | Palette lookup | No — unlit, palette-driven |

The "Yes, heavily" row is not theoretical: building `examples/06-materials` and testing it in a browser showed metal presets rendering essentially pure black without *any* environment map — physically correct (near-zero diffuse response, nothing to reflect), but a poor look for a hero screenshot. That example adds a small procedural PMREM fallback (a `texture.gradient()` output) precisely so metals have something to reflect while `studio-1k.hdr` remains unbundled — see `skipping_list.md` for the full note.

---

## What's genuinely out of scope for Phase 6

- **`crystal` requires a raw `THREE.CubeTexture`**, not the PMREM-processed equirect atlas THREE's own PBR materials/`scene.environment` use — reproducing that sampling math by hand wasn't worth it for one preset with no current consumer needing it.
- **No headless-GL rendering** in this project's test suite — every custom-shader preset (`holographic`, `crystal`, `glow`, `dataDriven`, `SDFText`) is tested structurally (uniforms, `defines`, validation, disposal, geometry math) but never actually compiled/rendered against a real GL context. A syntax error inside an untested `#ifdef` branch wouldn't surface until a real browser render.
- **The bundled Roboto MSDF atlas doesn't exist**, and neither does `studio-1k.hdr` (a pre-existing Phase 2 gap) — six metal/dielectric presets were tuned against physically-based reference values, not an actual render.
- **`GraphObjectMaterial`'s texture ref-counting requires an explicit `retainTexture()` call** for textures shared across independently-constructed wrappers — there's no automatic scene-wide detection.

See `skipping_list.md`'s Phase 6 section for the full, itemized list with revisit triggers.
