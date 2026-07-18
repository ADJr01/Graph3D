# Migrating from raw Three.js

Graph3D.js is not a replacement rendering engine — every scene it builds is a
real `THREE.Scene`, every camera a real `THREE.Camera`, every mesh built from
real `THREE.BufferGeometry`/`THREE.Material`. If you have a hand-rolled
Three.js scene already, you don't need to rewrite it to adopt Graph3D — you
can drop your existing objects straight into a Graph3D scene and opt into the
chart/animation/interaction layers only where they help.

## What Graph3D owns vs. what stays yours

Graph3D.js takes over three things a hand-rolled scene normally manages
itself: the `WebGLRenderer` (`new Graph3D({ canvas })` creates it — you can't
hand it an existing renderer, since `CapabilityProbe`/`PostFX` need to own
context creation), the render loop (`Graph3DLoop`, a single shared
`requestAnimationFrame`, not a per-app one), and scene/camera bookkeeping
(`g.createScene()`/`g.setActiveScene()`). Everything else — your geometries,
materials, meshes, lights, camera controls, custom shaders — keeps working
exactly as it does today.

## Step 1: swap your renderer and loop, keep your scene

Before (hand-rolled):

```js
const renderer = new THREE.WebGLRenderer({ canvas });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
camera.position.set(0, 8, 14);

function tick() {
  requestAnimationFrame(tick);
  renderer.render(scene, camera);
}
tick();
```

After — `g.renderer`/`g.loop` replace your renderer and RAF loop; your own
`THREE.Scene` contents move into `scene.three`:

```js
import { Graph3D } from 'graph3d.js';

const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

// Your existing meshes, groups, lights — add them exactly as before.
scene.three.add(myExistingMesh);
scene.three.add(myExistingLight);

// Or use a real THREE.Camera you already built:
scene.useCamera(myExistingCamera);
```

No manual `requestAnimationFrame` call remains — `Graph3D`'s own tick (added
via the shared `loop` singleton at construction) renders the active scene
every frame automatically. If you have your own per-frame logic (a custom
animation, a physics step), register it the same way Graph3D registers its
own tick, instead of a second `requestAnimationFrame`:

```js
import { loop } from 'graph3d.js';

loop.add((deltaSec) => {
  myExistingMesh.rotation.y += deltaSec;
});
```

## Step 2: your custom shaders and geometry keep working

Nothing about a `THREE.ShaderMaterial`, a custom `BufferGeometry`, or a loaded
glTF changes — `scene.three` is a real `THREE.Scene`, so anything that would
`scene.add(x)` in plain Three.js still works via `scene.three.add(x)` (or the
`GraphScene` convenience wrapper, `scene.add(x)`, which accepts multiple
objects at once and is otherwise equivalent).

```js
const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
const mesh = new THREE.Mesh(myCustomGeometry, material);
scene.add(mesh);
```

See [Custom GLSL](/recipes/custom-glsl) for wiring a custom shader through
Graph3D's own `material/` preset system instead, if you'd rather register it
as a reusable preset than manage the `THREE.ShaderMaterial` by hand.

## Step 3: adopt incrementally

Once your scene renders through Graph3D, each additional layer is optional
and independent:

- **Charts** (`chart/`) — replace hand-rolled per-datum mesh code with
  `BarChart`/`ScatterChart`/etc. only where you actually want a data-bound
  chart; anything else in the scene stays untouched.
- **Animation** (`anim/`) — `new Transition(target).duration(400).to({...})`
  or `Selection.transition()` for anything currently hand-tweened with your
  own easing math.
- **Interaction** (`interact/`) — `scene.selectAll(name).on('click', fn)` for
  picking, instead of a hand-rolled `THREE.Raycaster` loop.
- **PostFX** (`postfx/`) — `g.postfx.enable('bloom')` instead of assembling
  your own `EffectComposer` pass chain.

Every layer's public surface is documented as a stable "escape hatch" back to
raw Three.js (`.three`, `.scene`, `.camera.three`) specifically so this
adoption can stop at any point — see [Core](/concepts/core) for the full
layer list and what each one owns.

## Disposal

The one behavior change to watch for: Graph3D's disposal contract. Any class
holding GPU resources (`GraphMesh`, `GraphInstancedObject`, charts, scenes,
`Graph3D` itself) must have `dispose()` called on it when you're done with it
— `g.dispose()` cascades through every scene/chart it owns. If your existing
code disposed geometries/materials/textures by hand, that logic can be
deleted once the corresponding objects are owned by a Graph3D wrapper; if you
keep raw `THREE.Object3D`s added directly via `scene.add()`, you're still
responsible for disposing those yourself — Graph3D only tracks resources it
created.
