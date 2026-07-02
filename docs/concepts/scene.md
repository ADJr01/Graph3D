# Scene Composition — Phase 2

Scene Composition is Layer 2 of Graph3D.js. It wraps `THREE.Scene` with a managed camera, light rig, HDR environment, shadows, and clip planes, and establishes the disposal pattern every later layer follows: walk the scene graph, dispose every geometry/material/texture, then clear it.

---

## `GraphScene` — the disposal foundation

`GraphScene` wraps a `THREE.Scene` and owns everything needed to render it: a camera, a light rig, and — once a renderer is available — an environment, shadow, and clip-plane manager.

```js
const scene = g.createScene('main');
g.setActiveScene(scene);

scene.add(mesh);
scene.traverse((obj) => console.log(obj.name));
scene.findByName('_key'); // the default light rig's key light

scene.dispose(); // walks the graph; disposes every geometry/material/texture
```

`Graph3D.createScene(name)` constructs a `GraphScene`, registers it under `name`, and returns it — it does not start rendering. `setActiveScene(nameOrScene)` (by name or by instance) selects which scene the per-frame tick renders; only one scene renders per `Graph3D` instance at a time, though a scene can define multiple `viewports` (see below) for split-screen or picture-in-picture layouts.

`scene.dispose()` is the pattern every future object-owning class follows: traverse, dispose reachable GPU resources, clear the container. It's idempotent, and it disposes the camera, light rig, environment, shadows, and clip planes it owns before walking the graph.

---

## Camera

`GraphSceneCamera` wraps either a `THREE.PerspectiveCamera` or a `THREE.OrthographicCamera`, selected by preset:

| Preset | Type | Notes |
|---|---|---|
| `orbit` | perspective | Default; pair with `enableOrbitControls()`. |
| `fixed` | perspective | Same framing as `orbit`, no controls implied. |
| `isometric` | orthographic | 45°-ish elevated corner view. |
| `top-down` | orthographic | Straight down the Y axis. |
| `cinematic-low` | perspective | Narrow FOV, low eye-line — dramatic ground-level framing. |
| `cinematic-high` | perspective | Narrow FOV, elevated — establishing-shot framing. |

```js
scene.camera.setPreset('isometric');
await scene.camera.enableOrbitControls(g.renderer.three.domElement);
```

`OrbitControls` is lazy-loaded from `three/examples/jsm/controls/OrbitControls.js` on the first `enableOrbitControls()` call — it isn't bundled unless a consumer actually calls it. `useCamera(camera)` on `GraphScene` (or `useCustom(camera)` on `GraphSceneCamera` directly) drops to a raw `THREE.Camera` when a preset doesn't fit.

### Cinematic primitives

Four chainable animation primitives, each returning a `CameraController` with `.cancel()`:

```js
cam.dollyZoom(25, 2000); // tween FOV to 25° over 2s — classic vertigo effect

cam.tour([
  { at: [10, 10, 10], lookAt: [0, 0, 0], duration: 2000, easing: 'easeOutCubic' },
  { at: [-10, 5, 10], lookAt: [0, 0, 0], duration: 1500 },
]);

const ctrl = cam.follow(shipMesh); // re-orients toward a moving target every frame
ctrl.cancel();

cam.focusOn(new THREE.Box3().setFromObject(group), 1.2, 800); // frame a bounding box
```

Starting a new animation (or calling `setPreset`/`useCustom`) cancels whichever animation is currently running — only one drives the camera at a time. All four run on the shared `Graph3DLoop`, never `setTimeout`/`requestAnimationFrame` directly.

---

## Lights

`GraphSceneLight` manages a named light rig. Preset-managed lights are tracked separately from user lights added via `addLight()`, so switching presets never disturbs custom lights:

| Preset | Lights |
|---|---|
| `ambient-only` | Ambient only. |
| `flat` | Bright ambient, no directional shading. |
| `three-point` | Key + fill + rim directional, plus ambient. |
| `studio` | Three-point tuned softer, plus a `RectAreaLight` key. |
| `cinematic` | Three-point tuned high-contrast (strong key/rim, dim fill/ambient). |
| `product-shot` | Four cardinal `RectAreaLight`s + soft ambient — even, shadowless catalog lighting. |

```js
scene.light.setPreset('cinematic').setKeyIntensity(3).setRimIntensity(2.5);
scene.light.addLight(new THREE.PointLight(0xff0000, 1), 'accent');
```

`studio` and `product-shot` use `THREE.RectAreaLight` — call `RectAreaLightUniformsLib.init()` once before rendering for physically correct falloff.

---

## Shadows

`GraphSceneShadows` configures the renderer's shadow map and, for large scenes, cascaded shadow maps:

| Mode | Shadow map type | Notes |
|---|---|---|
| `pcf` | `PCFShadowMap` | Baseline. |
| `pcf-soft` | `PCFSoftShadowMap` | Softer edges, moderate cost. |
| `vsm` | `VSMShadowMap` | Best soft-shadow quality. |
| `contact` | `VSMShadowMap` | VSM tuned for close-up product-shot penumbra. |
| `csm` | `PCFSoftShadowMap` + CSM | Lazy-loads `three/examples/jsm/csm/CSM.js`; splits the camera frustum into 4 cascades for large terrains. |

```js
await scene.shadows.enable('pcf-soft');
scene.shadows.setQuality('high'); // low(512) / medium(1024) / high(2048) / ultra(4096)

// Large scenes:
await scene.shadows.enable('csm'); // 4-cascade CSM, registers a per-frame update tick
```

`setQuality` applies retroactively to every shadow-casting light already in the scene. CSM registers its own per-frame `update()` tick with `Graph3DLoop`; `dispose()`/`disable()` remove it and tear down the CSM instance.

---

## Environment — HDR, background, fog, skybox

`GraphSceneEnvironment` manages everything that isn't geometry: HDR-based image lighting, background, fog, and skyboxes.

### HDR ref-counting

```js
await scene.environment.setHDR('studio-1k'); // built-in preset name, or a URL
```

Built-in presets: `studio-1k`, `cinema-night`, `daylight`. HDR textures are **ref-counted across every `GraphSceneEnvironment` instance sharing the same URL** — the file is fetched and PMREM-processed exactly once no matter how many scenes reference it, and the underlying textures are disposed only when the last referencing instance releases them (via `dispose()`, `clear()`, or loading a different HDR):

```
scene A ──┐
scene B ──┼─→ hdrCache['studio-1k.hdr'] { envTexture, bgTexture, refCount: 3 }
scene C ──┘
```

### Fog presets

```js
scene.environment.setFog('exponential'); // or 'linear', 'volumetric-low', 'volumetric-cinematic'
scene.environment.setFog({ type: 'linear', color: 0xcccccc, near: 10, far: 100 }); // custom
```

The two `volumetric-*` presets fall back to `FogExp2` and emit a `console.warn` until the Phase 7 god-rays postfx pass exists — the fallback is documented at the call site, not silently swallowed.

### Skybox

`setSkybox()` accepts either 6 cube-face URLs or a single equirectangular image (`.hdr` routed through `RGBELoader`, everything else through `TextureLoader`). Skybox textures are **not** ref-counted — the caller owns their lifecycle.

---

## Clip planes

`GraphSceneClipping` manages global clip planes for slicing into volumetric or surface data:

```js
const plane = scene.clipping.addClipPlane([0, 1, 0], 0); // keep the +Y side, clip the rest
scene.clipping.removeClipPlane(plane);
```

Clip planes are global to the renderer (`renderer.clippingPlanes`) — they apply to every scene the renderer draws, not just the one that added them. Geometry on the *positive* side of a plane's normal is kept; the negative side is clipped away.

---

## Themes

`applyTheme(name)` bundles a camera preset, light preset, HDR, fog, shadow mode/quality, and a default material palette into one call:

```js
await scene.applyTheme('cinema-night');
scene.theme;   // 'cinema-night'
scene.palette; // [0x1e3a8a, 0x7c2d12, 0x581c87, 0x134e4a, 0x78350f]
```

Built-in themes: `studio-light`, `studio-dark`, `cinema-night`, `clinical-white`, `terminal-green`, `editorial`, `cyberpunk`, `museum`.

A theme fully owns scene lighting and atmosphere once applied — any existing lights (including the constructor's defaults) are removed, and the previous theme's environment/shadow managers are disposed. The one fallible step, the HDR fetch, always runs **before** anything is mutated: if it rejects (e.g. a missing `.hdr` file), the previous theme's camera, lights, environment, and shadows are left completely untouched rather than half-applying the new one. Environment and shadows are skipped entirely (silently, matching `GraphScene`'s renderer-optional behaviour) when no renderer is available.

---

## Disposal Contract

Every Phase 2 class holds GPU or DOM/event resources that must be explicitly released, and `GraphScene.dispose()` releases all of them in one call:

```js
scene.dispose();
// disposes, in order: camera (OrbitControls), light rig, environment (HDR ref release),
// shadows (CSM teardown), clip planes, then walks the graph disposing every
// geometry/material/texture and clears it.
```

- Idempotent — safe to call twice on `GraphScene` and on every sub-manager.
- After `GraphScene.dispose()`, every public method throws `"scene '<name>' has been disposed"`.
- HDR textures are only released from the shared cache, not necessarily destroyed — see ref-counting above.
- Disposal tests in `tests/integration/*-disposal.test.js` construct-and-dispose each class 1000× and assert no throw; `tests/integration/phase2.test.js` additionally verifies the 10-scene HDR ref-count end-to-end (see Prompt 34).
