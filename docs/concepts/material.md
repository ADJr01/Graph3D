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

**Not yet wired into `Axis`/`annotation.label`** (Prompt 109) — both remain the `{ type: 'label', text, position, style }` metadata stub from Phase 4. `Axis.render()`/`annotation.label()` are synchronous; `SDFText.create()` is necessarily async. Wiring them together as specified would mean either an API-breaking async `Axis.render()` (touching every existing sync call site across Phases 4–5) or a two-phase "render now, upgrade when ready" design — and since the atlas is missing regardless, text can't actually render correctly either way today. See `skipping_list.md`'s Phase 6 section and `.claude/TODO.md` for the full writeup and the two design options for whoever picks this up once the atlas exists.

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
