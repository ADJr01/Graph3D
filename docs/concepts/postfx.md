# PostFX & Particles — Phase 7 (DONE)

PostFX is Layer 7 of Graph3D.js — a thin, chart-agnostic wrapper around Three.js's `EffectComposer` (screen-space passes) plus a GPU-instanced particle system. It sits above `material/` in the layer table (CLAUDE.md §1.4), so it's free to reach into `object/`, `material/`, `anim/`, and `core/` — but no chart type exists yet (Phase 8), so nothing here composes with chart internals; charts will request effects through `graph3d.postfx`'s public API once they do.

Two independent surfaces make up this phase:

```js
import { Graph3D, Selection, ParticleSystem } from 'graph3d';

const g = new Graph3D({ canvas });
g.setActiveScene(scene);

g.postfx.enable('bloom', { strength: 1.2 });   // pass-based screen-space effects
g.postfx.preset('cinematic');                   // a tuned bundle of passes

const rain = new ParticleSystem({ scene: scene.three, camera: scene.camera.three, renderer: g.renderer.three, capacity: 100_000 });
rain.addBehavior('gravity', { strength: 9.8 });
rain.emit({ count: 1000, position: () => new THREE.Vector3(0, 20, 0), lifetime: 3 });
g.loop.add((dt) => rain.update(dt));
```

---

## `PostFX` — the pass chain (Prompt 116)

`graph3d.postfx` is lazily created on first access, bound to the currently active scene/camera/renderer (a second sanctioned `Graph3D`-composition-root exception in CLAUDE.md §1.4, alongside `GraphScene`) — accessing it before `setActiveScene()` throws.

```js
g.postfx.enable('bloom', { strength: 1.2 });
g.postfx.configure('bloom', { strength: 0.8 });
g.postfx.enabled();              // ['ssao', 'bloom', 'fxaa'] — canonical order, not enable() call order
g.postfx.disable('bloom');
```

- **`enable(name, opts)`** — creates and activates a registered pass, or `configure()`s it if already active (idempotent re-enable). Every pass declares its own `order` at registration time; `enabled()`/the composer's actual chain always sort by that value regardless of what sequence `enable()` was called in.
- **`configure(name, opts)`** — merges `opts` into the pass's stored options and re-applies them (`Object.assign` by default; a pass whose tunables live in `.uniforms` instead of plain properties — `dof`, `vignette`, `filmGrain`, `chromaticAberration` — registers its own `configure` hook, `configureUniforms`, instead).
- **`disable(name)`** — removes and disposes the pass; a no-op if it isn't active (`Map`-delete semantics).
- **`setSceneCamera(scene, camera)`** — `Graph3D` calls this every frame so `postfx` keeps following whichever scene is active; also re-runs the `godRays` auto-activation check (below).
- **`preset(name)`** — see Presets, below.
- **`pipeline(order)`** (Prompt 123) — the full manual-reordering escape hatch, see its own section below.

### Built-in passes (Prompts 117–119)

| Pass | `order` | Wraps | Key options |
|---|---|---|---|
| `outline` | 5 | `OutlinePass` | `selectedObjects`, `visibleEdgeColor`, `hiddenEdgeColor` (both accept a hex number or `THREE.Color` — routed through `.set()` so `Object.assign` can't clobber the internal `Color` instance) |
| `ssao` | 10 | `SSAOPass` | `kernelRadius`, `minDistance`, `maxDistance`, `output` |
| `ssr` | 12 | `SSRPass` | `groundReflector` (pair with `material.addPlanarReflection({ ssrPass: true })`), `selects`, `bouncing` — auto-disables with a `console.warn` on a `CapabilityProbe`-reported weak GPU (no WebGL2 and/or no float-texture support) |
| `godRays` | 15 | custom `Pass` (screen-space light-scatter march) | `exposure`, `decay`, `density`, `weight`, `samples` — auto-activates when the active scene's fog preset is `'volumetric-cinematic'` (below) |
| `bloom` | 20 | `UnrealBloomPass` | `strength`, `radius`, `threshold` — pairs with `material.neon`/`.glow`/`.pulse`, whose emissive intensities deliberately exceed `1.0` to bloom under this pass |
| `dof` | 30 | `BokehPass` | `focus` (world units from the camera), `aperture`, `maxblur` |
| `motionBlur` | 40 | custom `Pass` (depth-reprojection) | `strength`, `samples` — **camera** motion blur only (reprojects depth through the previous frame's view-projection matrix); does not track individual objects' own motion, which would need a per-object velocity pass reaching into `object/` (out of scope for a `postfx/`-only pass, CLAUDE.md §1.4 — see `skipping_list.md`) |
| `colorGrading` | 50 | `LUTPass` | `lut` (a `THREE.Data3DTexture`), `intensity` — defaults to a generated neutral identity LUT (`lut(rgb) === rgb`) so `enable('colorGrading')` works with no asset |
| `vignette` | 60 | `ShaderPass(VignetteShader)` | `offset`, `darkness` |
| `chromaticAberration` | 70 | `ShaderPass(RGBShiftShader)` | `amount`, `angle` |
| `filmGrain` | 80 | `FilmPass` | `intensity`, `grayscale` |
| `fxaa` | 90 | `ShaderPass(FXAAShader)` | none — fast, low-quality antialiasing |
| `smaa` | 95 | `SMAAPass` | none — slower, higher-quality antialiasing than `fxaa` |

`godRays`/`motionBlur` share one `DepthPrepass` helper (`passes/_shared.js`) — an offscreen depth-only render, the standard idiom `BokehPass`/`SSAOPass` already use internally (`motionBlur` had it first; `godRays` is the DRY two-strike extraction).

**`godRays` auto-activation:** `GraphSceneEnvironment.setFog('volumetric-cinematic')` stores `scene.userData.graph3d_fogPreset` (since `scene/` can't import `postfx/`, a plain `userData` flag is the wire format between the two layers); `PostFX`'s constructor and `setSceneCamera()` both check it and `enable('godRays')` automatically if a scene light exists (throwing a clear error if the flag is set but no light does).

### Presets (Prompt 119)

Seven tuned bundles of the scene-agnostic stylistic passes — `godRays`/`outline`/`ssr` are deliberately excluded, since they need scene-specific setup (a light, a selection, a reflector) a generic preset can't safely assume exists:

| Preset | Passes |
|---|---|
| `cinematic` | `dof`, `bloom`, `vignette`, `filmGrain`, `chromaticAberration`, `smaa` |
| `clean` | `ssao`, `smaa` |
| `dramatic` | `ssao`, `bloom`, `vignette`, `smaa` |
| `dreamy` | `bloom`, `dof`, `vignette`, `filmGrain` |
| `editorial` | `ssao`, `vignette`, `smaa` |
| `cyberpunk` | `bloom`, `chromaticAberration`, `filmGrain`, `vignette` |
| `minimal` | `fxaa` |

`preset(name)` disables every currently-enabled pass first, then enables exactly the preset's passes — a deterministic "look" swap, not a merge with whatever was on before. It also clears any `pipeline()` order override (below), for the same reason.

### `pipeline(order)` — the manual-reordering escape hatch (Prompt 123)

The registered `order` values above cover the common case, but a specific look sometimes needs a different sequence (e.g. `bloom` before `ssao`). `pipeline()` overrides the chain for the currently-enabled set:

```js
g.postfx.enable('ssao').enable('bloom').enable('fxaa');
g.postfx.pipeline(['bloom', 'ssao', 'fxaa']); // bloom now runs first
g.postfx.pipeline(null);                       // back to automatic order-based sorting
```

It's a live filter, not a frozen snapshot: a pass named in `order` that's later `disable()`d is simply skipped; a *new* pass `enable()`d afterward that wasn't named in `order` is appended at the end (sorted among any other such newcomers by their own registered `order`) rather than silently dropped from the chain. Passing an array that doesn't exactly match the currently-enabled set (missing, extra, or duplicate names) throws.

---

## `ParticleSystem` — GPU-instanced particles (Prompt 120)

```js
const rain = new ParticleSystem({
  scene: scene.three, camera: scene.camera.three, renderer: g.renderer.three,
  capacity: 100_000, capabilities: g.capabilities,
});
rain.emit({
  count: 1000,
  position: () => new THREE.Vector3((Math.random() - 0.5) * 20, 20, (Math.random() - 0.5) * 20),
  velocity: new THREE.Vector3(0, -10, 0),
  lifetime: 3, size: 0.1, color: 0x88aaff,
});
g.loop.add((dt) => rain.update(dt)); // this class never schedules its own RAF (CLAUDE.md §2)
```

`capacity` rounds up to the nearest perfect square (a GPU-path square simulation texture needs it; the CPU path uses the same rounded value so `capacity` means the same thing either way). Every particle "dies" once `age >= lifetime`; dead slots are recycled by a **ring buffer**, not a free-list — emitting faster than particles die force-recycles the oldest ones (a documented, standard tradeoff for a fixed-capacity pool, see `skipping_list.md`).

**Two simulation backends**, chosen once at construction from `CapabilityProbe`:

- **GPU** (`webgl2 && floatTextures`): position+age and velocity+lifetime each live in their own ping-ponged pair of floating-point `WebGLRenderTarget`s, advanced every `update()` by two `FullScreenQuad` shader passes — velocity first (`+= Σ active-behavior accelerations × delta`), then position (`+= the just-updated velocity × delta`). No per-particle JS work; scales to millions of particles. The velocity pass's fragment shader is *rebuilt* (not just re-uniformed) whenever the active behavior *set* changes.
- **CPU** (fallback, including iOS Safari without float-texture support): position/velocity/age/lifetime live in regular `InstancedBufferAttribute`s, integrated in a JS loop every `update()` — correct at any scale, just not GPU-parallel.

Particles render as one instanced draw call — camera-facing billboards (default) or a caller-supplied "mesh particle" geometry (`options.geometry` at construction).

### Behaviors (Prompt 121)

Continuous forces, accumulated into acceleration every `update()`:

| Behavior | Effect | Key options |
|---|---|---|
| `gravity` | Constant acceleration along `direction` | `strength`, `direction` |
| `wind` | Same shape as `gravity`, semantically a lateral force | `strength`, `direction` |
| `attract` | Radial pull toward `target`, linear falloff to `0` at `radius` | `strength`, `target`, `radius` |
| `repel` | `attract` with the sign flipped (shares its formula) | `strength`, `target`, `radius` |
| `swirl` | Rotational force: `axis × (position - center) * strength` | `strength`, `center`, `axis` |
| `curl` | Divergence-free turbulence (curl of a hash-based value-noise potential field) | `strength`, `scale` |

```js
rain.addBehavior('wind', { strength: 0.5, direction: new THREE.Vector3(1, 0, 0) });
rain.configureBehavior('wind', { strength: 1.5 });
rain.removeBehavior('wind');
rain.activeBehaviors; // ['wind', ...]
```

At most one active configuration per behavior *name* — calling `addBehavior()` again reconfigures in place rather than stacking a second instance. The CPU math (`behaviors.js`) and GPU GLSL (`behaviorShaders.js`) are hand-ported, formula-identical implementations — a fragment shader can't `import` JS, a documented, unavoidable cross-language DRY exception (see `skipping_list.md`).

### `spawnAt` — surface emission

```js
rain.spawnAt(floorMesh, { count: 2000, speed: 2, lifetime: 1.5 });
```

Samples `count` points off a mesh's surface (area-weighted per-triangle sampling — larger triangles get proportionally more samples), defaulting each particle's velocity to outward-along-the-sampled-normal. Accepts a raw `THREE.Mesh` or anything exposing one as `.three` (duck-typed, so `postfx/` never imports `object/`). Reads the mesh's rest-pose geometry, not a currently-posed skinned/morphed shape (see `skipping_list.md`).

### Presets (Prompt 121)

Six tuned recipes, each one or more `emit()` calls (and sometimes a continuous behavior):

| Preset | Look | Notes |
|---|---|---|
| `dust` | Slow ambient drift | Adds a gentle `wind` behavior |
| `sparks` | Fast, short-lived burst | Adds `gravity`; `AdditiveBlending` |
| `smoke` | Rising, curling plume | Adds `wind` + `curl`; `NormalBlending` |
| `confetti` | Colorful falling burst | Adds `gravity`; cycles a 5-color palette |
| `dataStream` | Particles flowing toward a target | Adds `attract` aimed at `options.target`; `AdditiveBlending` |
| `dissolve` | Burst from a point, or a mesh's surface | Delegates to `spawnAt` when given `options.mesh`, otherwise a point burst; `AdditiveBlending` |

```js
rain.preset('dust');
burst.preset('sparks', { count: 500, position: origin });
```

Presets a caller applies to the *same* `ParticleSystem` share behavior slots by name — applying both `dust` and `smoke` on one system means `smoke`'s `wind` settings silently replace `dust`'s (both target the `'wind'` slot). This only matters when stacking multiple presets on one instance; the common pattern — one dedicated `ParticleSystem` per look — is unaffected (see `skipping_list.md`).

None of the six presets fade opacity over a particle's lifetime — the render shader only supports a hard discard at death (Prompt 120's scope), so every preset reads as a pop rather than a fade.

---

## `dissolve` as an animated exit (Prompt 122)

`Selection.remove(animationName, options)` plays a particle exit effect at each departing node's location before freeing it:

```js
joined.exit().remove('dissolve', { system: rain });
```

`options.system` must expose `.preset(name, opts)` — duck-typed rather than imported (`compose/` must not import `postfx/`, and `Selection` has no scene/camera/renderer of its own to build a `ParticleSystem`). Meshes-backend nodes pass their raw `THREE.Mesh` (so `dissolve`'s surface-sample path works); instanced-backend nodes pass their local-space position instead (a point burst). The node is still freed immediately after — the burst is a short-lived visual, not a removal delay.

`chart.exitAnimation(name, { system, ...opts })` — the other half of Prompt 122 — is now wired on `GraphChart` (see `docs/concepts/chart.md`): it stores a default exit animation, and `update()`'s exit-join calls this same `Selection.remove(name, options)` path directly (no second implementation) whenever it's configured and no `on('exit', fn)` handler is registered. `options.system` is still an explicit, caller-constructed `ParticleSystem` — `GraphChart` has no camera/renderer of its own to build one automatically (see `skipping_list.md`'s resolved entry for why).

---

## Example / visual gallery (Prompt 124)

`examples/07-postfx/main.js` is a torus-knot gallery (standard/neon/glow materials, staggered depth for `dof`), a preset toggle bar cycling all 7 named `PostFX` presets, and a "🌧 100K-particle rain" button that lazily builds one large-capacity `ParticleSystem` and bursts 100,000 falling particles per click.

Building and running this example in an actual browser is what this phase's test suite (Prompt 125) *can't* do under jsdom — and it paid off immediately: it surfaced a genuine pre-existing bug where the GPU vertex shader's position-lookup fragment spliced `attribute`/`uniform` declarations *inside* `void main() { ... }` (invalid GLSL — those must be global-scope), invisible to construction-only unit tests since jsdom never compiles a real shader. Fixed in `particleShaders.js` by splitting the fragment into `declarations` (global scope) and `body` (inside `main()`).

| Preset | Passes it enables | Needs anything to look right? |
|---|---|---|
| `cinematic`, `dreamy` | `bloom` + `dof` combos | Emissive (`neon`/`glow`) geometry or bright lights to bloom against |
| `clean`, `editorial` | `ssao`-led, no bloom | Any lit geometry |
| `dramatic`, `cyberpunk` | Heavier `bloom`/`vignette`/`chromaticAberration` | Same as `cinematic` — strong emissive sources |
| `minimal` | `fxaa` only | Nothing — a no-look baseline |

---

## What's genuinely out of scope for Phase 7

- **No headless-GL rendering** in this project's test suite — the GPU particle-simulation path (`copyTextureToTexture`, `setRenderTarget`, the sim shaders) and every custom `Pass` are tested for construction, options, and disposal, never actually compiled/rendered against a real GL context. The one bug this gap could hide (see the example section above) has already surfaced once.
- **CPU-vs-GPU particle behavior parity is unverified** — the hash/noise/force formulas were ported by hand and checked algebraically, but no automated test proves the two paths numerically agree (same real-WebGL blocker).
- **`motionBlur` is camera-only**, not true per-object velocity-buffer motion blur; **`godRays` is a screen-space approximation**, not a true volumetric raymarch — both documented, standard real-time-rendering tradeoffs.
- **Particle presets share behavior slots by name** across presets applied to the same system instance; **no opacity fade over particle lifetime**; **`spawnAt` samples rest-pose geometry**, not a posed skinned/morphed mesh.
- **`ssr`'s "weak GPU" gate** reuses `CapabilityProbe`'s raw feature flags — there's no dedicated GPU-tier score in this codebase yet.

See `skipping_list.md`'s Phase 7 section for the full, itemized list with revisit triggers.
